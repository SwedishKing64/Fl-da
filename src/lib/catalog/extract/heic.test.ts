import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { asReadableImage, isHeic } from "./heic";

const PHOTO = "/root/.claude/uploads/94fb8bfb-35a9-5176-afe9-8fcc0dec9eb3/daba88ed-IMG_8853_2.HEIC";

describe("an iPhone photograph of an invoice", () => {
  it("is told by the file itself, whatever it is called", () => {
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypheic"), Buffer.alloc(8)]);
    expect(isHeic(heic, "whatever.bin", "application/octet-stream")).toBe(true);
    expect(isHeic(Buffer.from("\xff\xd8\xff\xe0 jpeg....", "latin1"), "photo.jpg", "image/jpeg")).toBe(false);
    // A JPEG the browser decoded from a HEIC keeps the HEIC's name; the bytes say what it is.
    expect(isHeic(Buffer.from("\xff\xd8\xff\xe0 jpeg....", "latin1"), "IMG_8853.HEIC", "image/jpeg")).toBe(false);
    // And by its name or type when the bytes are not there to read.
    expect(isHeic(Buffer.alloc(0), "IMG_8853.HEIC", "")).toBe(true);
    expect(isHeic(Buffer.alloc(0), "", "image/heif")).toBe(true);
  });

  it.skipIf(!existsSync(PHOTO))("becomes a JPEG the model can read, under a name that says so", { timeout: 60_000 }, async () => {
    const out = await asReadableImage({ filename: "IMG_8853_2.HEIC", mimeType: "image/heic", buffer: readFileSync(PHOTO) });
    expect(out.mimeType).toBe("image/jpeg");
    expect(out.filename).toBe("IMG_8853_2.jpg");
    expect(out.buffer.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    expect(out.buffer.length).toBeGreaterThan(100_000);
  });

  it("leaves any other picture exactly as it came", async () => {
    const png = { filename: "scan.png", mimeType: "image/png", buffer: Buffer.from("\x89PNG\r\n\x1a\n....", "latin1") };
    expect(await asReadableImage(png)).toBe(png);
  });
});
