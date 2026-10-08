import { describe, expect, it } from "vitest";
import { fetchShopifyProduct, parseStoreProduct, shopifyProductAddress, storeAsHtml, storePictures } from "./shopify-store";
import { readProductPage } from "./page";

/** A product as a store's ".js" form gives it. */
const JS = {
  title: "Men's [ak] Cyclic GORE-TEX 2L Jacket",
  vendor: "Burton",
  description: "<p>The Cyclic is built for storm days.</p><h3>Features</h3><ul><li>GORE-TEX 2L</li><li>Pit zips</li></ul>",
  options: ["Colour", "Size"],
  variants: [
    { id: 1, option1: "True Black", option2: "S", featured_image: { src: "//cdn.shopify.com/s/files/1/black-1.png?v=1", alt: "True Black", variant_ids: [1, 2] } },
    { id: 2, option1: "True Black", option2: "M", featured_image: { src: "//cdn.shopify.com/s/files/1/black-1.png?v=1", alt: "True Black", variant_ids: [1, 2] } },
    { id: 3, option1: "Chinchilla Gray", option2: "S", featured_image: { src: "//cdn.shopify.com/s/files/1/gray-1.png?v=1", alt: "Chinchilla Gray", variant_ids: [3] } },
  ],
  images: ["//cdn.shopify.com/s/files/1/gray-1.png?v=1", "//cdn.shopify.com/s/files/1/gray-2.png?v=1", "//cdn.shopify.com/s/files/1/black-1.png?v=1", "//cdn.shopify.com/s/files/1/black-2.png?v=1", "//cdn.shopify.com/s/files/1/detail.png?v=1"],
  media: [
    { media_type: "image", alt: "Chinchilla Gray", src: "//cdn.shopify.com/s/files/1/gray-1.png?v=1" },
    { media_type: "image", alt: "Chinchilla Gray back", src: "//cdn.shopify.com/s/files/1/gray-2.png?v=1" },
    { media_type: "image", alt: "True Black", src: "//cdn.shopify.com/s/files/1/black-1.png?v=1" },
    { media_type: "image", alt: "True Black back", src: "//cdn.shopify.com/s/files/1/black-2.png?v=1" },
    { media_type: "image", alt: "", src: "//cdn.shopify.com/s/files/1/detail.png?v=1" },
  ],
};

/** The same product as the ".json" form gives it. */
const JSON_FORM = {
  product: {
    title: JS.title, vendor: "Burton", body_html: JS.description,
    options: [{ name: "Colour", values: ["True Black", "Chinchilla Gray"] }, { name: "Size", values: ["S", "M"] }],
    variants: [{ id: 1, option1: "True Black", option2: "S" }, { id: 2, option1: "True Black", option2: "M" }, { id: 3, option1: "Chinchilla Gray", option2: "S" }],
    images: [
      { src: "https://cdn.shopify.com/s/files/1/gray-1.png?v=1", alt: null, variant_ids: [3] },
      { src: "https://cdn.shopify.com/s/files/1/black-1.png?v=1", alt: null, variant_ids: [1, 2] },
      { src: "https://cdn.shopify.com/s/files/1/black-2.png?v=1", alt: "True Black back", variant_ids: [] },
    ],
  },
};

describe("a link into a Shopify store", () => {
  it("is known by its path, with the locale and any collection set aside", () => {
    expect(shopifyProductAddress("https://www.burton.com/en-au/products/mens-burton-ak-cyclic-gore-tex-2l-jacket-100021b-o")).toEqual({ origin: "https://www.burton.com", prefix: "/en-au", handle: "mens-burton-ak-cyclic-gore-tex-2l-jacket-100021b-o" });
    expect(shopifyProductAddress("https://shop.example.com/collections/jackets/products/cyclic?variant=1")).toEqual({ origin: "https://shop.example.com", prefix: "", handle: "cyclic" });
    expect(shopifyProductAddress("https://www.rossignol.com/au/hero-gs")).toBeNull();
  });

  it("reads both forms of the store's data into one shape", () => {
    const a = parseStoreProduct(JS)!;
    expect(a.title).toBe(JS.title);
    expect(a.options).toEqual(["Colour", "Size"]);
    expect(a.variants[0]).toEqual({ id: 1, values: ["True Black", "S"], image: { src: "https://cdn.shopify.com/s/files/1/black-1.png?v=1", alt: "True Black" } });
    expect(a.images.map((i) => [i.src.replace(/^.*\//, ""), i.alt, i.variantIds])).toEqual([
      ["gray-1.png?v=1", "Chinchilla Gray", [3]], ["gray-2.png?v=1", "Chinchilla Gray back", []], ["black-1.png?v=1", "True Black", [1, 2]], ["black-2.png?v=1", "True Black back", []], ["detail.png?v=1", "", []],
    ]);
    const b = parseStoreProduct(JSON_FORM)!;
    expect(b.options).toEqual(["Colour", "Size"]);
    expect(b.images.map((i) => i.variantIds)).toEqual([[3], [1, 2], []]);
    expect(parseStoreProduct({ nothing: true })).toBeNull();
  });

  it("gives the colour ordered the pictures tied to it and captioned with it, the variant's own first", () => {
    const p = parseStoreProduct(JS)!;
    expect(storePictures(p, ["True Black"])).toEqual({ matched: "True Black", pictures: [
      { url: "https://cdn.shopify.com/s/files/1/black-1.png?v=1", alt: "True Black" },
      { url: "https://cdn.shopify.com/s/files/1/black-2.png?v=1", alt: "True Black back" },
    ] });
    expect(storePictures(p, ["Black"]).matched).toBe("True Black");
    expect(storePictures(p, ["Chinchilla Gray"]).pictures.map((c) => c.url.replace(/^.*\//, ""))).toEqual(["gray-1.png?v=1", "gray-2.png?v=1"]);
    // A colour the store does not have, or none ordered: every picture, to be sorted by looking.
    expect(storePictures(p, ["Nightshade Purple"]).pictures).toHaveLength(5);
    expect(storePictures(p, []).matched).toBe("");
  });

  it("stands as a page with the words and the colours in it", () => {
    const html = storeAsHtml(parseStoreProduct(JS)!);
    expect(html).toContain("<title>Men's [ak] Cyclic GORE-TEX 2L Jacket</title>");
    expect(html).toContain("Colours: True Black, Chinchilla Gray");
    expect(html).toContain("<li>Pit zips</li>");
  });

  it("fetches the store's data, falling back from one form and address to the next", async () => {
    const asked: string[] = [];
    const fetcher = (async (url: string) => {
      asked.push(String(url));
      if (/en-au\/products\/.*\.js$/.test(String(url))) return new Response("Not found", { status: 404 });
      if (/\/products\/.*\.js$/.test(String(url))) return new Response(JSON.stringify(JS), { status: 200 });
      return new Response("", { status: 404 });
    }) as unknown as typeof fetch;
    const got = await fetchShopifyProduct("https://www.burton.com/en-au/products/cyclic-100021b-o", fetcher);
    expect(got?.product.title).toBe(JS.title);
    expect(asked).toEqual(["https://www.burton.com/en-au/products/cyclic-100021b-o.js", "https://www.burton.com/products/cyclic-100021b-o.js"]);
    expect(await fetchShopifyProduct("https://www.rossignol.com/au/hero-gs", fetcher)).toBeNull();
    expect(await fetchShopifyProduct("https://x.example.com/products/y", (async () => new Response("<html>", { status: 200 })) as unknown as typeof fetch)).toBeNull();
  });

  it("is read through the page reader with the colour's pictures and the store's words", async () => {
    const fetcher = (async (url: string) => (/\.js$/.test(String(url)) ? new Response(JSON.stringify(JS), { status: 200 }) : new Response("blocked", { status: 403 }))) as unknown as typeof fetch;
    const seen: string[] = [];
    const out = await readProductPage("https://www.burton.com/en-au/products/cyclic-100021b-o", { title: "Men's [ak] GORE-TEX Cyclic Jacket 2027", brand: "Burton", colours: ["True Black"] }, {
      fetcher,
      ask: async (_system, content) => {
        seen.push(content);
        return JSON.stringify({ confident: true, pageTitle: JS.title, description: "The Cyclic is built for storm days.", features: ["GORE-TEX 2L", "Pit zips"], imageNumbers: [1, 2], pictureColour: "", note: "ok" });
      },
    });
    expect(seen[0]).toContain("Colour ordered: True Black");
    expect(seen[0]).toContain("1. https://cdn.shopify.com/s/files/1/black-1.png?v=1  — True Black");
    expect(seen[0]).not.toContain("gray-1.png");
    expect(seen[0]).toContain("- Pit zips");
    expect(out.images).toEqual(["https://cdn.shopify.com/s/files/1/black-1.png?v=1", "https://cdn.shopify.com/s/files/1/black-2.png?v=1"]);
    expect(out.pictureColour).toBe("True Black");
    expect(out.features).toEqual(["GORE-TEX 2L", "Pit zips"]);
  });

  it("with no model, takes what the store declares", async () => {
    const fetcher = (async () => new Response(JSON.stringify(JS), { status: 200 })) as unknown as typeof fetch;
    const out = await readProductPage("https://www.burton.com/en-au/products/cyclic", { title: "Cyclic", colours: ["Chinchilla Gray"] }, { fetcher });
    expect(out.via).toBe("basic");
    expect(out.images[0]).toContain("gray-1.png");
    expect(out.pictureColour).toBe("Chinchilla Gray");
  });
});
