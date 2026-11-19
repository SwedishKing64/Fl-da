import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { picturesForColour } from "./picture-colour";
import type { PageDetails } from "./page-types";

const block = (colour: string) => sharp({ create: { width: 300, height: 300, channels: 3, background: colour } }).png().toBuffer();
const details = (images: string[]): PageDetails => ({ description: "d", features: [], images, pageTitle: "t", confident: true, sourceUrl: "https://a.example.com/p", via: "ai", note: "" });

function site(colours: Record<string, string>): typeof fetch {
  return (async (url: string) => {
    const c = colours[String(url)];
    if (!c) return new Response("no", { status: 404 });
    return new Response(new Uint8Array(await block(c)), { status: 200, headers: { "content-type": "image/png" } });
  }) as unknown as typeof fetch;
}

describe("a page's pictures made right for the colour ordered", () => {
  const urls = ["https://a.example.com/1.png", "https://a.example.com/2.png", "https://a.example.com/3.png"];
  const fetcher = site({ [urls[0]]: "#cc0000", [urls[1]]: "#000000", [urls[2]]: "#cc0000" });

  it("leaves the other colour's pictures out, keeps the ordered one's, and says so", async () => {
    const out = await picturesForColour(details(urls), "Freestyle Bindings", ["Black"], {
      fetcher, publicBaseUrl: "https://tools.example.com",
      ask: async () => JSON.stringify({ pictures: [{ number: 1, colour: "red", ordered: "no" }, { number: 2, colour: "black", ordered: "yes" }, { number: 3, colour: "red", ordered: "no" }], note: "" }),
    });
    expect(out.images).toHaveLength(1);
    expect(out.images[0]).toMatch(/freestyle-bindings-2\.jpg$/);
    expect(out.pictureColour).toBe("black");
    expect(out.imageColours).toEqual(["Black"]);
    expect(out.pictureNote).toBe("2 pictures of other colours (red) left out; the 1 kept show the black.");
  });

  it("keeps the pictures, and says what to do, when the page has only another colour", async () => {
    const out = await picturesForColour(details(urls), "Freestyle Bindings", ["Black"], {
      fetcher, publicBaseUrl: "https://tools.example.com",
      ask: async () => JSON.stringify({ pictures: [{ number: 1, colour: "red", ordered: "no" }, { number: 2, colour: "red", ordered: "no" }, { number: 3, colour: "red", ordered: "no" }], note: "" }),
    });
    // Better than none (asked 2026-10-20): all three are kept, and the note says to swap them.
    expect(out.images).toHaveLength(3);
    expect(out.pictureNote).toContain("none of the Black ordered");
    expect(out.pictureNote).toContain("that colour's own link box");
  });

  it("matches each kept picture to one of several colours ordered and says which had none", async () => {
    const out = await picturesForColour(details(urls), "Freestyle Bindings", ["Black", "Red", "Blue"], {
      fetcher, publicBaseUrl: "https://tools.example.com",
      ask: async () => JSON.stringify({ pictures: [{ number: 1, colour: "red", ordered: "yes", which: "Red" }, { number: 2, colour: "black", ordered: "yes", which: "Black" }, { number: 3, colour: "red", ordered: "yes", which: "Red" }], note: "" }),
    });
    expect(out.images).toHaveLength(3);
    expect(out.imageColours).toEqual(["Red", "Black", "Red"]);
    expect(out.pictureNote).toContain("Pictures matched for Black and Red; none for Blue");
  });

  it("keeps the brand's addresses and says nothing when there was no colour to go by", async () => {
    const out = await picturesForColour(details(urls), "x", [], { fetcher, publicBaseUrl: "", ask: async () => { throw new Error("should not look"); } });
    expect(out.images).toEqual(urls);
    expect(out.pictureNote).toBeUndefined();
  });

  it("keeps a picture the site would not give, unlooked at", async () => {
    const out = await picturesForColour(details([...urls, "https://a.example.com/gone.png"]), "x", ["Black"], {
      fetcher, publicBaseUrl: "https://tools.example.com",
      ask: async () => JSON.stringify({ pictures: [{ number: 1, colour: "red", ordered: "no" }, { number: 2, colour: "black", ordered: "yes" }, { number: 3, colour: "red", ordered: "no" }], note: "" }),
    });
    expect(out.images).toHaveLength(2);
    expect(out.images[1]).toBe("https://a.example.com/gone.png");
  });
});
