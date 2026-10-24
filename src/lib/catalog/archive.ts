/**
 * A supplier's files in one archive: a zip of the season's pictures, a barcode list and a price
 * list together. Each file in it is taken as if it had been added on its own.
 */

import JSZip from "jszip";

export interface ArchivedFile { filename: string; mimeType: string; buffer: Buffer }

const MAX_FILES = 500;
const MAX_TOTAL = 2 * 1024 * 1024 * 1024;

const TYPES: Record<string, string> = {
  pdf: "application/pdf", csv: "text/csv", txt: "text/plain", tsv: "text/tab-separated-values",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xls: "application/vnd.ms-excel", xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", heic: "image/heic", heif: "image/heif", tif: "image/tiff", tiff: "image/tiff",
  json: "application/json", xml: "application/xml", html: "text/html", htm: "text/html",
};

/** The type a file's name says it is. */
export function typeOfName(name: string): string {
  return TYPES[name.toLowerCase().split(".").pop() ?? ""] ?? "application/octet-stream";
}

export const isArchive = (filename: string, mimeType = ""): boolean => /\.zip$/i.test(filename) || /zip/i.test(mimeType);

/** The files in a zip, folders and the Mac's own leftovers skipped. */
export async function filesInArchive(buffer: Buffer): Promise<ArchivedFile[]> {
  const zip = await JSZip.loadAsync(buffer);
  const out: ArchivedFile[] = [];
  let total = 0;
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const name = entry.name.split("/").pop() ?? "";
    if (!name || name.startsWith(".") || entry.name.startsWith("__MACOSX/") || name === "Thumbs.db") continue;
    const data = Buffer.from(await entry.async("uint8array"));
    total += data.length;
    if (out.length >= MAX_FILES || total > MAX_TOTAL) break;
    out.push({ filename: name, mimeType: typeOfName(name), buffer: data });
  }
  return out;
}

/** Whether a set of files is a folder of pictures: every one an image. */
export const allPictures = (files: Array<{ mimeType: string }>): boolean => files.length > 0 && files.every((f) => f.mimeType.startsWith("image/"));

/** A Word document's text, paragraph by paragraph. */
export async function docxText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) return "";
  return xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:br\/>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
