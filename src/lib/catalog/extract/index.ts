import { extractCsv, extractXlsx } from "./tabular";
import { extractPdfText } from "./pdf";
import { extractHeuristic } from "./heuristic";
import { aiAvailable, aiDocumentMeta, aiExtractionToTable, extractFromImage, extractFromPdf, extractFromText } from "./ai";
import type { ExtractedTable } from "./types";

export type { ExtractedTable } from "./types";

export interface ExtractionOutcome {
  table: ExtractedTable;
  meta?: { supplier: string; invoiceNumber: string; currency: string; gstTreatment: string };
}

export function detectKind(filename: string, mimeType: string): "csv" | "xlsx" | "pdf" | "image" | "text" | "unknown" {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (ext === "csv" || mimeType === "text/csv") return "csv";
  if (["xlsx", "xlsm", "xls"].includes(ext) || mimeType.includes("spreadsheet") || mimeType.includes("excel")) return "xlsx";
  if (ext === "pdf" || mimeType === "application/pdf") return "pdf";
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext) || mimeType.startsWith("image/")) return "image";
  if (ext === "txt" || mimeType.startsWith("text/")) return "text";
  return "unknown";
}

/**
 * Turn an uploaded file into a table of rows. Tabular files are parsed deterministically;
 * PDFs use their text layer + Claude, scanned PDFs and images go straight to Claude vision;
 * without an API key a conservative pattern-matching fallback keeps the app usable.
 */
export async function extractFile(buffer: Buffer, filename: string, mimeType: string): Promise<ExtractionOutcome> {
  const kind = detectKind(filename, mimeType);
  switch (kind) {
    case "csv":
      return { table: extractCsv(buffer) };
    case "xlsx":
      return { table: await extractXlsx(buffer) };
    case "text": {
      const text = buffer.toString("utf8");
      return fromText(text, "AI_TEXT");
    }
    case "pdf": {
      const pdf = await extractPdfText(buffer);
      if (!pdf.looksScanned) return fromText(pdf.text, "PDF_TEXT");
      if (aiAvailable()) {
        const result = await extractFromPdf(buffer);
        return { table: aiExtractionToTable(result, "PDF_AI", pdf.text), meta: aiDocumentMeta(result) };
      }
      const table = extractHeuristic(pdf.text);
      table.warnings.unshift("This PDF looks scanned and no ANTHROPIC_API_KEY is configured, so OCR was not possible.");
      return { table };
    }
    case "image": {
      if (!aiAvailable()) {
        return { table: { headers: [], rows: [], method: "IMAGE_AI", warnings: ["Image invoices need ANTHROPIC_API_KEY for OCR/extraction."] } };
      }
      const result = await extractFromImage(buffer, mimeType);
      return { table: aiExtractionToTable(result, "IMAGE_AI"), meta: aiDocumentMeta(result) };
    }
    default:
      throw new Error(`Unsupported file type: ${filename} (${mimeType})`);
  }
}

async function fromText(text: string, method: "PDF_TEXT" | "AI_TEXT"): Promise<ExtractionOutcome> {
  if (aiAvailable()) {
    try {
      const result = await extractFromText(text);
      return { table: aiExtractionToTable(result, method === "PDF_TEXT" ? "PDF_AI" : "AI_TEXT", text), meta: aiDocumentMeta(result) };
    } catch (err) {
      const table = extractHeuristic(text);
      table.warnings.unshift(`AI extraction failed (${err instanceof Error ? err.message : String(err)}); used pattern matching instead.`);
      return { table };
    }
  }
  return { table: extractHeuristic(text) };
}
