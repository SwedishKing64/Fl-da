import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { CANVAS_MAX, CANVAS_MIN, FILL, canvasFor, fetchPicture, framePicture, hostPictures } from "./pictures";

/** A picture of a solid block of colour sat off-centre on a background, like a product shot with uneven margins. */
async function shot(width: number, height: number, block: { left: number; top: number; width: number; height: number }, background = "#ffffff", colour = "#1f3a93", format: "png" | "jpeg" = "png"): Promise<Buffer> {
  const blockImage = await sharp({ create: { width: block.width, height: block.height, channels: 3, background: colour } }).png().toBuffer();
  const base = sharp({ create: { width, height, channels: 3, background } }).composite([{ input: blockImage, left: block.left, top: block.top }]);
  return format === "png" ? base.png().toBuffer() : base.jpeg().toBuffer();
}

/** Where the non-background pixels sit, by scanning the frame. */
async function bounds(data: Buffer): Promise<{ left: number; top: number; right: number; bottom: number; width: number; height: number }> {
  const { data: raw, info } = await sharp(data).raw().toBuffer({ resolveWithObject: true });
  let left = info.width, top = info.height, right = -1, bottom = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const i = (y * info.width + x) * info.channels;
    const dark = raw[i] < 200 || raw[i + 1] < 200 || raw[i + 2] < 200;
    if (dark) { if (x < left) left = x; if (x > right) right = x; if (y < top) top = y; if (y > bottom) bottom = y; }
  }
  return { left, top, right, bottom, width: info.width, height: info.height };
}

describe("the square a picture is set on", () => {
  it("is sized from the product, between the limits", () => {
    expect(canvasFor(300)).toBe(CANVAS_MIN);
    expect(canvasFor(1500)).toBe(Math.round(1500 / FILL));
    expect(canvasFor(5000)).toBe(CANVAS_MAX);
  });
});

describe("framing a picture", () => {
  it("trims the margin, scales the product to the same share of the square, and centres it", async () => {
    // A tall product sat low and to the right in a wide frame with lots of white around it.
    const framed = await framePicture(await shot(1200, 800, { left: 700, top: 300, width: 200, height: 400 }));
    expect(framed).not.toBeNull();
    expect(framed!.width).toBe(framed!.height);
    const b = await bounds(framed!.data);
    const tall = b.bottom - b.top + 1;
    const wide = b.right - b.left + 1;
    // The longer side fills FILL of the square; the shorter keeps the product's proportions.
    expect(tall / b.height).toBeCloseTo(FILL, 1);
    expect(wide / tall).toBeCloseTo(0.5, 1);
    // Centred: the same margin either side, above and below.
    expect(Math.abs(b.left - (b.width - 1 - b.right))).toBeLessThanOrEqual(2);
    expect(Math.abs(b.top - (b.height - 1 - b.bottom))).toBeLessThanOrEqual(2);
  });

  it("gives a small picture a square no smaller than the minimum, and a huge one no bigger than the maximum", async () => {
    const small = await framePicture(await shot(300, 300, { left: 50, top: 50, width: 200, height: 200 }));
    expect(small!.width).toBe(CANVAS_MIN);
    const huge = await framePicture(await shot(3000, 3000, { left: 100, top: 100, width: 2800, height: 2800 }, "#ffffff", "#1f3a93", "jpeg"));
    expect(huge!.width).toBe(CANVAS_MAX);
  });

  it("keeps a plain coloured background out to the edges rather than boxing it in white", async () => {
    const framed = await framePicture(await shot(800, 800, { left: 200, top: 200, width: 400, height: 400 }, "#e8e8e8"));
    const px = await sharp(framed!.data).extract({ left: 2, top: 2, width: 1, height: 1 }).raw().toBuffer();
    expect(Math.abs(px[0] - 0xe8)).toBeLessThanOrEqual(3);
  });

  it("sets a see-through picture on white", async () => {
    const png = await sharp({ create: { width: 400, height: 400, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: await sharp({ create: { width: 100, height: 100, channels: 3, background: "#1f3a93" } }).png().toBuffer(), left: 150, top: 150 }]).png().toBuffer();
    const framed = await framePicture(png);
    const px = await sharp(framed!.data).extract({ left: 2, top: 2, width: 1, height: 1 }).raw().toBuffer();
    expect([px[0], px[1], px[2]].every((v) => v >= 250)).toBe(true);
  });

  it("leaves alone what it cannot read", async () => {
    expect(await framePicture(Buffer.from("not a picture"))).toBeNull();
    expect(await framePicture(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10'/>"))).toBeNull();
  });
});

describe("keeping a page's pictures here", () => {
  const picture = () => shot(600, 400, { left: 100, top: 50, width: 300, height: 300 });

  it("fetches, frames and keeps each one in order, and leaves what the site will not give as it was", async () => {
    const fetcher = (async (url: string) => {
      if (/blocked/.test(String(url))) return new Response("no", { status: 403 });
      if (/text/.test(String(url))) return new Response("<html>", { status: 200, headers: { "content-type": "text/html" } });
      return new Response(new Uint8Array(await picture()), { status: 200, headers: { "content-type": "image/png" } });
    }) as unknown as typeof fetch;
    const out = await hostPictures(["https://a.example.com/1.png", "https://a.example.com/blocked.png", "https://a.example.com/text", "https://a.example.com/2.png"], "Freestyle Bindings", { fetcher, publicBaseUrl: "https://tools.example.com" });
    expect(out).toHaveLength(4);
    expect(out[1]).toBe("https://a.example.com/blocked.png");
    expect(out[2]).toBe("https://a.example.com/text");
    expect(out[0]).toMatch(/^https:\/\/tools\.example\.com\/api\/catalog\/files\/images\/.*freestyle-bindings-1\.jpg$/);
    expect(out[3]).toMatch(/freestyle-bindings-4\.jpg$/);
  });

  it("keeps the brand's own addresses when the only place to serve a copy from is the copy's own machine", async () => {
    let asked = 0;
    const fetcher = (async () => { asked++; return new Response(new Uint8Array(await picture()), { status: 200 }); }) as unknown as typeof fetch;
    const urls = ["https://a.example.com/1.png"];
    expect(await hostPictures(urls, "x", { fetcher, publicBaseUrl: "http://127.0.0.1:51299" })).toEqual(urls);
    expect(asked).toBe(0);
  });

  it("keeps the brand's own addresses when there is nowhere public to serve a copy from", async () => {
    let asked = 0;
    const fetcher = (async () => { asked++; return new Response(new Uint8Array(await picture()), { status: 200 }); }) as unknown as typeof fetch;
    const urls = ["https://a.example.com/1.png"];
    expect(await hostPictures(urls, "x", { fetcher, publicBaseUrl: "" })).toEqual(urls);
    expect(asked).toBe(0);
  });

  it("gives up on a picture that is not one", async () => {
    expect(await fetchPicture("https://a.example.com/x", (async () => new Response("nope", { status: 200, headers: { "content-type": "image/png" } })) as unknown as typeof fetch)).not.toBeNull();
    expect(await fetchPicture("https://a.example.com/x", (async () => new Response("", { status: 200 })) as unknown as typeof fetch)).toBeNull();
  });
});
