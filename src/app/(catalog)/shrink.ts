/**
 * Shrinking a photograph or a scan in the browser, before it is sent anywhere.
 *
 * Browser-only: it uses createImageBitmap and a canvas, so only a client component may import it.
 *
 * Every upload in this app goes through a serverless request body that tops out at about 4.5MB,
 * whether it travels as a Server Action argument or as multipart form data. A scan of an A4
 * invoice at 600dpi is 20MB and a phone photo is five, so both are refused at the edge BEFORE any
 * of this app runs — no error to catch, nothing in the logs, and on screen an upload that never
 * finishes. It has now been hit on two different pages, which is why it lives here rather than
 * next to one of them.
 *
 * Nothing is lost by shrinking. The API scales any image over 1568px on its long edge down to
 * 1568px before it reads it, so a 600dpi scan is read at the same size a 150dpi one would be —
 * the extra pixels were never going to be looked at, they only made the file too big to arrive.
 */

import { MAX_UPLOAD, fitWithin, fitsUpload, readableSize } from "@/lib/catalog/image-size";

export { fitsUpload, readableSize };

export const looksLikeImage = (file: File): boolean =>
  /^image\//.test(file.type) || /\.(png|jpe?g|webp|gif|heic|heif|tiff?|bmp)$/i.test(file.name);

export interface Shrunk {
  /** What to send. The original file when it was already small enough or could not be decoded. */
  file: File;
  /** A line for the screen when something was done, empty when the file went as it came. */
  note: string;
}

/**
 * Shrink one file if it is an image that needs it.
 *
 * A file the browser cannot decode — an iPhone HEIC where there is no decoder, a TIFF — comes back
 * unchanged, and the caller says what to do about it. Better that than a silent failure.
 */
export async function shrinkImage(given: File): Promise<Shrunk> {
  const asIs = { file: given, note: "" };
  if (!looksLikeImage(given) || typeof createImageBitmap !== "function") return asIs;

  // An iPhone HEIC first, which only Safari can open natively: decoded here to a JPEG and then
  // shrunk like any other photo. If the decoder fails the file goes as it is, and the server
  // decodes it instead (see extract/heic) — slower, but nothing is lost.
  const file = await decodeHeic(given);

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return asIs;
  }
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    if (width === bitmap.width && height === bitmap.height && fitsUpload(file.size)) return file === given ? asIs : { file, note: `${given.name}: an iPhone HEIC, sent as a JPEG.` };

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return asIs;
    // White underneath, because a scan saved with transparency comes out black on a JPEG.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob || blob.size >= file.size) return file === given ? asIs : { file, note: `${given.name}: an iPhone HEIC, sent as a JPEG.` };
    const name = given.name.replace(/\.[^.]+$/, "") + ".jpg";
    return {
      file: new File([blob], name, { type: "image/jpeg", lastModified: given.lastModified }),
      note: `${given.name}: ${bitmap.width}×${bitmap.height} at ${readableSize(given.size)}, sent at ${width}×${height} and ${readableSize(blob.size)} — the size it is read at.`,
    };
  } finally {
    bitmap.close();
  }
}

const looksLikeHeic = (file: File): boolean => /^image\/hei[cf]$/i.test(file.type) || /\.hei[cf]$/i.test(file.name);

/** A HEIC as a JPEG, decoded in the browser. Any other file, or a HEIC that will not decode, as is. */
async function decodeHeic(file: File): Promise<File> {
  if (!looksLikeHeic(file)) return file;
  try {
    const { heicTo } = await import("heic-to");
    const blob = await heicTo({ blob: file, type: "image/jpeg", quality: 0.92 });
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  }
}

/** Shrink a whole selection, leaving anything that is not an image exactly as it is. */
export async function shrinkAll(files: File[]): Promise<{ files: File[]; notes: string[] }> {
  const done = await Promise.all(files.map(shrinkImage));
  return { files: done.map((d) => d.file), notes: done.map((d) => d.note).filter(Boolean) };
}

/** What to say about a file that still will not fit once it has been through the above. */
export function tooBig(file: File, sent: number): string {
  return looksLikeImage(file)
    ? `${file.name} is ${readableSize(sent)}, and this browser could not shrink it — which usually means it is an iPhone HEIC or a TIFF scan. Open it and save it as a PNG or JPEG, or screenshot it, and add that instead.`
    : `${file.name} is ${readableSize(sent)}. An upload has to stay under ${readableSize(MAX_UPLOAD)}, so split it or send only the pages that matter. A scanner set to 600dpi makes a file four times the size of one at 300dpi and no easier to read.`;
}
