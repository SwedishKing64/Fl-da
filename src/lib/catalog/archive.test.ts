import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { allPictures, docxText, filesInArchive, isArchive } from "./archive";
import { detectKind } from "./extract";

describe("a supplier's archive", () => {
  it("is the files in it, the Mac's leftovers and folders skipped", async () => {
    const zip = new JSZip();
    zip.file("pictures/red.jpg", "x");
    zip.file("pictures/blue.png", "y");
    zip.file("__MACOSX/pictures/._red.jpg", "z");
    zip.file(".DS_Store", "z");
    const files = await filesInArchive(Buffer.from(await zip.generateAsync({ type: "uint8array" })));
    expect(files.map((f) => [f.filename, f.mimeType])).toEqual([["red.jpg", "image/jpeg"], ["blue.png", "image/png"]]);
    expect(allPictures(files)).toBe(true);
    expect(isArchive("Season.ZIP")).toBe(true);
  });

  it("reads a Word document's text", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", "<w:document><w:body><w:p><w:r><w:t>Model A &amp; B</w:t></w:r></w:p><w:p><w:r><w:t>Barcode 9300000000000</w:t></w:r></w:p></w:body></w:document>");
    expect(await docxText(Buffer.from(await zip.generateAsync({ type: "uint8array" })))).toBe("Model A & B\nBarcode 9300000000000");
  });

  it("tells the kinds of file apart", () => {
    expect(detectKind("specs.docx", "")).toBe("docx");
    expect(detectKind("feed.json", "")).toBe("text");
    expect(detectKind("catalogue.indd", "")).toBe("unknown");
  });
});
