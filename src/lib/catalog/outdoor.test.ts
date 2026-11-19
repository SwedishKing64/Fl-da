import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { scriptPictures, distillPage } from "./extract/page";
import { AI_HEADERS } from "./extract/ai";
import { colourName, isColourCode } from "./colour";
import { applyMapping, suggestMapping } from "./mapping";
import { groupLineItems } from "./grouping";
import { pickColour } from "./colour-match";
import { emptyLineItem, type CanonicalLineItem } from "./types";

describe("pictures a brand's own shop software keeps in its scripts", () => {
  const page = "https://www.example-outdoor.com/product/mens-better-sweater-fleece-jacket/25528.html";
  const html = `<html><head><title>Better Sweater</title></head><body>
    <img src="https://cdn.example-outdoor.com/site/logo.png">
    <script>window.__STATE__ = {"product":{"id":"25528","images":[
      "https:\\/\\/cdn.example-outdoor.com\\/is\\/image\\/25528_BLK_1.jpg",
      "https:\\/\\/cdn.example-outdoor.com\\/is\\/image\\/25528_BLK_2.jpg",
      "//cdn.example-outdoor.com/is/image/25528_NVY_1.jpg"]},
      "menu":{"promo":"https://cdn.example-outdoor.com/is/image/summer-campaign-hero.jpg"}}</script>
  </body></html>`;

  it("takes the ones that carry the product's own code, and not the site's", () => {
    const urls = scriptPictures(html, page, 3).map((c) => c.url);
    expect(urls).toEqual([
      "https://cdn.example-outdoor.com/is/image/25528_BLK_1.jpg",
      "https://cdn.example-outdoor.com/is/image/25528_BLK_2.jpg",
      "https://cdn.example-outdoor.com/is/image/25528_NVY_1.jpg",
    ]);
  });

  it("puts them in the page's picture list", () => {
    const d = distillPage(html, page);
    expect(d.images.map((c) => c.url)).toContain("https://cdn.example-outdoor.com/is/image/25528_NVY_1.jpg");
    expect(d.images.map((c) => c.url)).not.toContain("https://cdn.example-outdoor.com/is/image/summer-campaign-hero.jpg");
  });

  it("does not take a year in the address for the product's code", () => {
    const other = `<script>{"a":"https://cdn.x.com/2026/banner-sale.jpg"}</script><img src="https://cdn.x.com/a.jpg"><img src="https://cdn.x.com/b.jpg"><img src="https://cdn.x.com/c.jpg">`;
    expect(scriptPictures(other, "https://x.com/2026/trail-runner-shoe", 3)).toEqual([]);
  });
});

describe("colour codes", () => {
  it("writes out the trade's shorthand", () => {
    expect(colourName("BLK")).toBe("Black");
    expect(colourName("NVY")).toBe("Navy");
    expect(colourName("Walnut")).toBe("Walnut");
  });
  it("knows a code that names no colour", () => {
    for (const c of ["001", "4417", "0-9", "BK12", "XKCD"]) expect(isColourCode(c), c).toBe(true);
    for (const c of ["Black", "NAVY", "BLK", "Red", "Bear Hug Brown", "OLV"]) expect(isColourCode(c), c).toBe(false);
  });
});

describe("an option that is not a size or a colour", () => {
  const line = (over: Partial<CanonicalLineItem>): CanonicalLineItem => ({ ...emptyLineItem(), brand: "Osprey", title: "Atmos AG", productType: "Hiking Packs", costPrice: 250, quantity: 1, ...over });

  it("is read off a column headed Volume, and named after it", () => {
    const headers = ["Style", "Name", "Volume", "Colour", "Qty", "Cost"];
    const mapping = suggestMapping(headers);
    expect(mapping["Volume"]).toBe("variant");
    const item = applyMapping({ Style: "10004", Name: "Atmos AG", Volume: "65L", Colour: "Black", Qty: "1", Cost: "250" }, mapping);
    expect(item.variant).toBe("65L");
    expect(item.variantName).toBe("Volume");
  });

  it("makes one product with that option, not one product per volume", () => {
    const products = groupLineItems([
      line({ sku: "A65", variant: "65L", variantName: "Volume", colour: "Black" }),
      line({ sku: "A50", variant: "50L", variantName: "Volume", colour: "Black" }),
    ], []);
    expect(products).toHaveLength(1);
    expect([products[0].option1Name, products[0].option2Name, products[0].option3Name]).toContain("Volume");
    expect(products[0].variants).toHaveLength(2);
  });

  it("is a column the invoice reader writes", () => {
    for (const h of ["variant", "variantName", "productType"]) expect(AI_HEADERS as readonly string[]).toContain(h);
  });
});

describe("a page with many colourways", () => {
  it("looks past the sixteenth picture for the colour ordered", async () => {
    const pic = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#000" } }).png().toBuffer();
    const pics = Array.from({ length: 24 }, () => pic);
    let shown = 0;
    const look = await pickColour(pics, ["Navy"], "Nano Puff Jacket", {
      ask: async (_s, content) => {
        shown = (content as Array<{ type: string }>).filter((b) => b.type === "image").length;
        return JSON.stringify({ pictures: pics.map((_, i) => ({ number: i + 1, colour: i >= 18 ? "navy" : "red", ordered: i >= 18 ? "yes" : "no", which: i >= 18 ? "Navy" : "" })), note: "" });
      },
    });
    expect(shown).toBe(24);
    expect(look.keep).toEqual([18, 19, 20, 21, 22, 23]);
  });
});
