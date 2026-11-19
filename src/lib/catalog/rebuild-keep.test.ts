import { describe, expect, it } from "vitest";
import { keeper, type Gathered } from "./rebuild-keep";
import { pageProductTitle } from "./page-title";

const before = (over: Partial<Gathered>): Gathered => ({
  handle: "exos-58", title: "Exos 58", tags: "Mens, Backpacks", bodyHtml: "", lookupStatus: "NONE", lookupSource: "", lookupAt: null, images: [], ...over,
});
const pageBody = "<p>A light pack for long days.</p><h2>Details</h2><ul><li>Weight: 1.1kg</li></ul>";

describe("a rebuild keeps what the products had gathered", () => {
  it("gives a page-read product back its link, description and pictures, after the order's own", () => {
    const keep = keeper([before({
      bodyHtml: pageBody, lookupStatus: "PAGE", lookupSource: "https://www.osprey.com/au/exos-58",
      images: [
        { url: "https://shop.example/supplier.jpg", source: "SUPPLIER", altText: "Exos 58", position: 1, validated: true },
        { url: "https://blob.example/page-2.jpg", source: "PAGE", altText: "Exos 58", position: 3, validated: false },
        { url: "https://blob.example/page-1.jpg", source: "PAGE", altText: "Exos 58", position: 2, validated: false },
      ],
    })]);
    const kept = keep({ handle: "exos-58", title: "Exos 58", tags: "Mens, Backpacks" });
    expect(kept?.bodyHtml).toBe(pageBody);
    expect(kept?.lookupStatus).toBe("PAGE");
    expect(kept?.lookupSource).toBe("https://www.osprey.com/au/exos-58");
    expect(kept?.images.map((i) => i.url)).toEqual(["https://blob.example/page-1.jpg", "https://blob.example/page-2.jpg"]);
  });

  it("keeps a link that has not been read yet, and pictures somebody added", () => {
    const keep = keeper([before({ lookupStatus: "LINKED", lookupSource: "https://x.example/p", bodyHtml: "<p>From the order.</p>", images: [{ url: "https://blob.example/mine.jpg", source: "MANUAL", altText: "", position: 1, validated: true }] })]);
    const kept = keep({ handle: "exos-58", title: "Exos 58", tags: "" });
    expect(kept?.lookupStatus).toBe("LINKED");
    // The order's own description comes back from the order, not from here.
    expect(kept?.bodyHtml).toBeUndefined();
    expect(kept?.images.map((i) => i.source)).toEqual(["MANUAL"]);
  });

  it("finds the product by its name when the rebuild gave it another handle", () => {
    const keep = keeper([before({ handle: "exos-58-mens", lookupStatus: "PAGE", bodyHtml: pageBody })]);
    expect(keep({ handle: "exos-58", title: "Exos 58", tags: "" })?.bodyHtml).toBe(pageBody);
  });

  it("gives each old product back once, and nothing to a product that had gathered nothing", () => {
    const keep = keeper([before({ lookupStatus: "PAGE", bodyHtml: pageBody }), before({ handle: "eja-55", title: "Eja 55" })]);
    expect(keep({ handle: "exos-58", title: "Exos 58", tags: "" })).not.toBeNull();
    expect(keep({ handle: "exos-58", title: "Exos 58", tags: "" })).toBeNull();
    expect(keep({ handle: "eja-55", title: "Eja 55", tags: "" })).toBeNull();
  });

  it("keeps the page's title, with this build's season after it", () => {
    const keep = keeper([before({ handle: "mantra-88-2026", title: "Mantra 88 Ski 2026", tags: "2026, Skis", lookupStatus: "PAGE", bodyHtml: pageBody })]);
    expect(keep({ handle: "mantra-88-2026", title: "Mantra 88 2027", tags: "2027, Skis" })?.title).toBe("Mantra 88 Ski 2027");
  });
});

describe("a product titled as the supplier's page titles it", () => {
  it("takes the page's name, without the brand, the gender or the site, with the year after it", () => {
    expect(pageProductTitle("Völkl Mantra 88 Men's Ski | Völkl Australia", "Völkl", "2027")).toBe("Mantra 88 Ski 2027");
    expect(pageProductTitle("Exos 58 Men’s Backpack", "Osprey", null)).toBe("Exos 58 Backpack");
    expect(pageProductTitle("Osprey Exos 58 - Men's", "Osprey", null)).toBe("Exos 58");
    expect(pageProductTitle("Women's Eja Pro 55 - Osprey Australia", "Osprey", null)).toBe("Eja Pro 55");
    expect(pageProductTitle("Kids' Moki 1.5L", "Osprey", null)).toBe("Kids' Moki 1.5L");
  });

  it("leaves a year the page already gives, and gives nothing for a page with no name", () => {
    expect(pageProductTitle("Mantra 88 2027", "Volkl", "2027")).toBe("Mantra 88 2027");
    expect(pageProductTitle("", "Osprey", "2027")).toBe("");
  });
});
