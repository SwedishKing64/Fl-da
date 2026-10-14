/**
 * A PDF's pages as pictures, made in the browser.
 *
 * Browser-only: it draws on a canvas, so only a client component may import it.
 *
 * A day's invoices scanned into one PDF runs to tens of megabytes — 65MB at 600dpi — and an upload
 * has to stay under 3MB (see image-size.ts). The API reads a page at 1568px on its long edge
 * whatever it is sent, so each page is drawn at that size and sent as a JPEG of a few hundred
 * kilobytes: the same page as the reader would have seen it, and nothing too big to arrive.
 */

import { MAX_EDGE, MAX_UPLOAD } from "@/lib/catalog/image-size";

export const isPdf = (file: File): boolean => file.type === "application/pdf" || /\.pdf$/i.test(file.name);

type PdfDocument = Awaited<ReturnType<typeof import("unpdf")["getDocumentProxy"]>>;

/** The PDF opened for drawing. Call `close` when done with it. */
export async function openPdf(file: File): Promise<{ pages: number; page: (n: number) => Promise<File>; close: () => Promise<void> }> {
  const { getDocumentProxy } = await import("unpdf");
  const doc: PdfDocument = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
  const stem = file.name.replace(/\.pdf$/i, "");
  return {
    pages: doc.numPages,
    page: async (n) => {
      const page = await doc.getPage(n);
      try {
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: MAX_EDGE / Math.max(base.width, base.height) });
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("This browser cannot draw the PDF's pages.");
        // White underneath: a scan with no background of its own comes out black on a JPEG.
        context.fillStyle = "#fff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        for (const quality of [0.85, 0.7, 0.5]) {
          const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
          if (blob && blob.size <= MAX_UPLOAD) return new File([blob], `${stem} p${n}.jpg`, { type: "image/jpeg" });
        }
        throw new Error(`Page ${n} of ${file.name} would not shrink under the upload limit.`);
      } finally {
        page.cleanup();
      }
    },
    // pdf.js frees a document with destroy(); unpdf's types leave it out.
    close: async () => { await (doc as unknown as { destroy?: () => Promise<void> }).destroy?.(); },
  };
}
