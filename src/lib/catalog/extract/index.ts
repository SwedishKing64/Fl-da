import { extractCsv, extractXlsx } from "./tabular";
import { extractPdfText } from "./pdf";
import { extractHeuristic } from "./heuristic";
import { aiAvailable, aiDocumentMeta, aiExtractionToTable, extractFromImage, extractFromPdf, extractFromText, type DocumentType } from "./ai";
import type { ExtractedTable } from "./types";

export type { ExtractedTable } from "./types";

export interface ExtractionOutcome {
  table: ExtractedTable;
  meta?: { documentType: DocumentType; supplier: string; invoiceNumber: string; currency: string; gstTreatment: string };
}

export type UploadKind = "AUTO" | "INVOICE" | "SPEC_SHEET" | "PRODUCT_PHOTO";

export function detectKind(filename: string, mimeType: string): "csv" | "xlsx" | "pdf" | "image" | "text" | "unknown" {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (ext === "csv" || mimeType === "text/csv") return "csv";
  if (["xlsx", "xlsm", "xls"].includes(ext) || mimeType.includes("spreadsheet") || mimeType.includes("excel")) return "xlsx";
  if (ext === "pdf" || mimeType === "application/pdf") return "pdf";
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext) || mimeType.startsWith("image/")) return "image";
  if (ext === "txt" || mimeType.startsWith("text/")) return "text";
  return "unknown";
}

const NEEDS_AI = "This file type needs ANTHROPIC_API_KEY to be read by AI. Spreadsheets (CSV/XLSX) work without it.";

/**
 * Turn an uploaded file into a table of rows. Tabular files are parsed deterministically;
 * everything else is read by Claude, which also decides what the document is (invoice, spec
 * sheet, product photo…). Without an API key a conservative pattern-matching fallback keeps
 * text-based invoices usable.
 */
export async function extractFile(buffer: Buffer, filename: string, mimeType: string, kind: UploadKind = "AUTO"): Promise<ExtractionOutcome> {
  const fileType = detectKind(filename, mimeType);
  const hint = kind === "AUTO" ? undefined : kind;
  switch (fileType) {
    case "csv":
      return { table: extractCsv(buffer), meta: tabularMeta(kind) };
    case "xlsx":
      return { table: await extractXlsx(buffer), meta: tabularMeta(kind) };
    case "text":
      return fromText(buffer.toString("utf8"), "AI_TEXT", hint);
    case "pdf": {
      const pdf = await extractPdfText(buffer);
      if (!pdf.looksScanned && kind !== "PRODUCT_PHOTO") return fromText(pdf.text, "PDF_TEXT", hint);
      if (aiAvailable()) {
        const result = await extractFromPdf(buffer, hint);
        return { table: aiExtractionToTable(result, "PDF_AI", pdf.text), meta: aiDocumentMeta(result) };
      }
      const table = extractHeuristic(pdf.text);
      table.warnings.unshift("This PDF looks scanned and no ANTHROPIC_API_KEY is configured, so it could not be read.");
      return { table };
    }
    case "image": {
      if (!aiAvailable()) {
        return { table: { headers: [], rows: [], method: "IMAGE_AI", warnings: [NEEDS_AI] }, meta: kind === "PRODUCT_PHOTO" ? { documentType: "PRODUCT_PHOTO", supplier: "", invoiceNumber: "", currency: "", gstTreatment: "UNKNOWN" } : undefined };
      }
      const result = await extractFromImage(buffer, mimeType, hint);
      return { table: aiExtractionToTable(result, "IMAGE_AI"), meta: aiDocumentMeta(result) };
    }
    default:
      throw new Error(`Unsupported file type: ${filename} (${mimeType}). Upload PDF, XLSX, CSV, TXT or an image.`);
  }
}

function tabularMeta(kind: UploadKind): ExtractionOutcome["meta"] {
  if (kind === "SPEC_SHEET") return { documentType: "SPEC_SHEET", supplier: "", invoiceNumber: "", currency: "", gstTreatment: "UNKNOWN" };
  return undefined;
}

async function fromText(text: string, method: "PDF_TEXT" | "AI_TEXT", hint?: string): Promise<ExtractionOutcome> {
  if (aiAvailable()) {
    try {
      const result = await extractFromText(text, hint);
      return { table: aiExtractionToTable(result, method === "PDF_TEXT" ? "PDF_AI" : "AI_TEXT", text), meta: aiDocumentMeta(result) };
    } catch (err) {
      const table = extractHeuristic(text);
      table.warnings.unshift(`AI extraction failed (${err instanceof Error ? err.message : String(err)}); used pattern matching instead.`);
      return { table };
    }
  }
  const table = extractHeuristic(text);
  if (hint === "SPEC_SHEET") table.warnings.unshift("Spec sheets need ANTHROPIC_API_KEY to be read; only invoice-style lines were recognised.");
  return { table };
}
