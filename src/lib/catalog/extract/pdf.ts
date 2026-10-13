import { extractText, getDocumentProxy } from "unpdf";

export interface PdfText {
  text: string;
  pages: number;
  /** True when the PDF carries little or no text layer (likely scanned) */
  looksScanned: boolean;
}

export async function extractPdfText(buffer: Buffer): Promise<PdfText> {
  const doc = await getDocumentProxy(new Uint8Array(buffer));
  const { text, totalPages } = await extractText(doc, { mergePages: true });
  const cleaned = text.replace(/ /g, " ").trim();
  const wordsPerPage = cleaned.split(/\s+/).filter(Boolean).length / Math.max(1, totalPages);
  return { text: cleaned, pages: totalPages, looksScanned: wordsPerPage < 15 };
}
