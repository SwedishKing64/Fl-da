import { extractCsv, extractXlsx, orderToTable } from "./tabular";
import { readGridPdf } from "./pdf-grid";
import { extractPdfText } from "./pdf";
import { extractHeuristic } from "./heuristic";
import { aiAvailable } from "../anthropic";
import { docxText } from "../archive";
import { aiDocumentMeta, aiExtractionToTable, extractFromImage, extractFromPdf, extractFromText, type DocumentType, type ReadOptions } from "./ai";
import type { ExtractedTable } from "./types";
import { layoutOf, layoutOfHeaders, sameLayout } from "../layout";
import { examplesPrompt, pickExamples, type ReadExample } from "../read-examples";

export type { ExtractedTable } from "./types";

export interface ExtractionOutcome {
  table: ExtractedTable;
  meta?: { documentType: DocumentType; supplier: string; invoiceNumber: string; currency: string; gstTreatment: string };
}

export type UploadKind = "AUTO" | "INVOICE" | "SPEC_SHEET" | "PRODUCT_PHOTO";

/** What is known of the supplier before its document is read. See read-examples.ts. */
export interface SupplierHistory {
  /** Its lines from finished batches, as the shop settled them. */
  examples?: ReadExample[];
  /** The layouts of the documents it has sent before. */
  layouts?: string[];
}

/**
 * The read for one document: the supplier's examples nearest its layout, and the lighter model only
 * for a layout the supplier has sent before. A known supplier on a new system is read fresh, and
 * the batch says why.
 */
export function readFor(read: ReadOptions, history: SupplierHistory, layout: string | null): { read: ReadOptions; note: string | null } {
  const guide = examplesPrompt(pickExamples(history.examples ?? [], layout));
  const seen = history.layouts ?? [];
  const newLayout = Boolean(layout && seen.length > 0 && !seen.some((l) => sameLayout(l, layout)));
  return {
    read: { ...read, known: read.known && !newLayout, ...(guide ? { guide } : {}) },
    note: newLayout ? "A layout this supplier has not sent before, so it was read in full rather than as a known supplier's. Check its lines." : null,
  };
}

export function detectKind(filename: string, mimeType: string): "csv" | "xlsx" | "pdf" | "image" | "text" | "docx" | "unknown" {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (ext === "csv" || mimeType === "text/csv") return "csv";
  if (["xlsx", "xlsm", "xls"].includes(ext) || mimeType.includes("spreadsheet") || mimeType.includes("excel")) return "xlsx";
  if (ext === "pdf" || mimeType === "application/pdf") return "pdf";
  if (["png", "jpg", "jpeg", "gif", "webp", "heic", "heif"].includes(ext) || mimeType.startsWith("image/")) return "image";
  if (ext === "docx" || mimeType.includes("wordprocessingml")) return "docx";
  if (["txt", "tsv", "json", "xml", "html", "htm", "md", "rtf"].includes(ext) || mimeType.startsWith("text/") || mimeType === "application/json" || mimeType === "application/xml") return "text";
  return "unknown";
}

const NEEDS_AI = "This file type needs ANTHROPIC_API_KEY to be read by AI. Spreadsheets (CSV/XLSX) work without it.";

/**
 * Turn an uploaded file into a table of rows. Tabular files are parsed deterministically;
 * everything else is read by Claude, which also decides what the document is (invoice, spec
 * sheet, product photo…). Without an API key a conservative pattern-matching fallback keeps
 * text-based invoices usable.
 */
export async function extractFile(buffer: Buffer, filename: string, mimeType: string, kind: UploadKind = "AUTO", read: ReadOptions = {}, history: SupplierHistory = {}): Promise<ExtractionOutcome> {
  const fileType = detectKind(filename, mimeType);
  const hint = kind === "AUTO" ? undefined : kind;
  switch (fileType) {
    case "csv": {
      const table = extractCsv(buffer);
      return { table: { ...table, layout: layoutOfHeaders(table.headers) }, meta: tabularMeta(kind) };
    }
    case "xlsx": {
      const table = await extractXlsx(buffer);
      return { table: { ...table, layout: layoutOfHeaders(table.headers) }, meta: tabularMeta(kind) };
    }
    case "text":
      return fromText(buffer.toString("utf8"), "AI_TEXT", hint, read, history);
    case "docx":
      return fromText(await docxText(buffer), "AI_TEXT", hint, read, history);
    case "pdf": {
      // An order with a size grid under each product is read by position, with no model: the
      // quantities only mean something under the size they sit beneath. See pdf-grid.ts.
      const grid = kind === "PRODUCT_PHOTO" ? null : await readGridPdf(buffer).catch(() => null);
      if (grid) return { table: orderToTable({ lines: grid.lines, sheet: filename, warnings: grid.warnings }, "PDF_TEXT"), meta: { documentType: "INVOICE", supplier: grid.brand, invoiceNumber: "", currency: "AUD", gstTreatment: "EXCLUSIVE" } };
      const pdf = await extractPdfText(buffer);
      if (!pdf.looksScanned && kind !== "PRODUCT_PHOTO") return fromText(pdf.text, "PDF_TEXT", hint, read, history);
      if (aiAvailable()) {
        // A scan has no text to tell its layout by; the supplier's most recent lines guide it.
        const result = await extractFromPdf(buffer, hint, readFor(read, history, null).read);
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
      const result = await extractFromImage(buffer, mimeType, hint, readFor(read, history, null).read);
      return { table: aiExtractionToTable(result, "IMAGE_AI"), meta: aiDocumentMeta(result) };
    }
    default:
      // Kept with the batch all the same: a supplier's file is the shop's record of what was sent.
      return { table: { headers: [], rows: [], method: "HEURISTIC", warnings: [`Kept with the batch, but ${filename} is not a kind of file Flöda can read (it reads PDFs, spreadsheets, CSVs, Word documents, text and pictures). Nothing was taken from it.`] } };
  }
}

function tabularMeta(kind: UploadKind): ExtractionOutcome["meta"] {
  if (kind === "SPEC_SHEET") return { documentType: "SPEC_SHEET", supplier: "", invoiceNumber: "", currency: "", gstTreatment: "UNKNOWN" };
  return undefined;
}

async function fromText(text: string, method: "PDF_TEXT" | "AI_TEXT", hint?: string, given: ReadOptions = {}, history: SupplierHistory = {}): Promise<ExtractionOutcome> {
  const layout = layoutOf(text);
  if (aiAvailable()) {
    try {
      const { read, note } = readFor(given, history, layout);
      const result = await extractFromText(text, hint, read);
      const table = aiExtractionToTable(result, method === "PDF_TEXT" ? "PDF_AI" : "AI_TEXT", text);
      if (note) table.warnings.push(note);
      return { table: { ...table, layout }, meta: aiDocumentMeta(result) };
    } catch (err) {
      const table: ExtractedTable = { ...extractHeuristic(text), layout };
      table.warnings.unshift(`AI extraction failed (${err instanceof Error ? err.message : String(err)}); used pattern matching instead.`);
      return { table };
    }
  }
  const table: ExtractedTable = { ...extractHeuristic(text), layout };
  if (hint === "SPEC_SHEET") table.warnings.unshift("Spec sheets need ANTHROPIC_API_KEY to be read; only invoice-style lines were recognised.");
  return { table };
}
