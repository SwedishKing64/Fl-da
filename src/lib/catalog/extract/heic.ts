/**
 * An iPhone photograph, made readable.
 *
 * An iPhone saves its pictures as HEIC, and a stockroom invoice photographed on one arrives that
 * way: a Tecnica delivery came in as IMG_8853.HEIC and nothing read it. The model takes JPEG,
 * PNG, GIF and WebP and nothing else, and most browsers cannot decode HEIC either, so the page
 * could not shrink it and the server could not read it. Now both can: the browser decodes it
 * before sending (see shrink.ts), and anything that still arrives as HEIC is decoded here, once,
 * before it is stored or read. Decoding is pure JavaScript (libheif compiled to wasm), so it runs
 * wherever the app runs; a 12-megapixel photograph takes about two seconds.
 */

const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1", "avif", "avis"]);

/** Whether this is a HEIF container, told by the file itself first and its name or type second. */
export function isHeic(buffer: Buffer, filename = "", mimeType = ""): boolean {
  // The bytes decide when there are bytes to read: a HEIC the browser already decoded arrives as
  // a JPEG still called IMG_8853.HEIC, and decoding that again would fail.
  if (buffer.length >= 12) {
    return buffer.toString("latin1", 4, 8) === "ftyp" && HEIF_BRANDS.has(buffer.toString("latin1", 8, 12).toLowerCase());
  }
  return /^image\/hei[cf]$/i.test(mimeType) || /\.hei[cf]$/i.test(filename);
}

export async function heicToJpeg(buffer: Buffer): Promise<Buffer> {
  const { default: convert } = await import("heic-convert");
  const out = await convert({ buffer: new Uint8Array(buffer), format: "JPEG", quality: 0.9 });
  return Buffer.from(out);
}

export interface StoredImage { filename: string; mimeType: string; buffer: Buffer }

/** The file as something the model can read: a HEIC becomes a JPEG, anything else is untouched. */
export async function asReadableImage<T extends StoredImage>(file: T): Promise<T> {
  if (!isHeic(file.buffer, file.filename, file.mimeType)) return file;
  const buffer = await heicToJpeg(file.buffer);
  return { ...file, buffer, mimeType: "image/jpeg", filename: file.filename.replace(/\.hei[cf]$/i, "") + ".jpg" };
}
