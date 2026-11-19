/** Output of every extractor: a header list plus rows of string cells keyed by header. */
export interface ExtractedTable {
  headers: string[];
  rows: Record<string, string>[];
  method: "CSV" | "XLSX" | "PDF_TEXT" | "PDF_AI" | "IMAGE_AI" | "AI_TEXT" | "HEURISTIC";
  text?: string; // raw text (PDF/heuristic) kept for auditing and re-runs
  warnings: string[];
  /** The document's layout, where one could be told. See layout.ts. */
  layout?: string | null;
}
