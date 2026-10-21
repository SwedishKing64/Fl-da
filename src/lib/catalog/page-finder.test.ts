import { describe, expect, it } from "vitest";
import { findPageFor, guessUrls, learnPatterns, pageMatches, slugCandidates } from "./page-finder";

const atomic = { vendor: "Atomic", handle: "atomic-bent-100-2027", title: "Atomic Bent 100 2027" };

describe("slugCandidates", () => {
  it("offers the handle without the brand first, then without the year, then the whole", () => {
    expect(slugCandidates(atomic).map((s) => s.slug)).toEqual(["bent-100-2027", "bent-100", "atomic-bent-100-2027", "atomic-bent-100"]);
  });
  it("reads a package from its ski", () => {
    expect(slugCandidates({ ...atomic, handle: "atomic-bent-100-2027-inc-marker-griffon-binding-package" }).map((s) => s.slug)[0]).toBe("bent-100-2027");
  });
});

describe("learnPatterns", () => {
  it("works out a brand's address shape from the links pasted before", () => {
    const patterns = learnPatterns([
      { ...atomic, url: "https://www.atomic.com/en-au/products/bent-100-2027.html?variant=blue" },
      { vendor: "Atomic", handle: "atomic-maverick-88-2027", title: "Atomic Maverick 88 2027", url: "https://www.atomic.com/en-au/products/maverick-88-2027.html" },
      { vendor: "Burton", handle: "burton-custom-2027", title: "Burton Custom 2027", url: "https://www.burton.com/au/en/p/custom-snowboard/W27-106881.html" },
    ]);
    expect(patterns).toEqual([
      { vendor: "atomic", template: "https://www.atomic.com/en-au/products/{slug}.html", style: 0, count: 2 },
      { vendor: "burton", template: "https://www.burton.com/au/en/p/{slug}-snowboard/w27-106881.html", style: 1, count: 1 },
    ]);
  });
  it("takes the longest slug that fits, so a year's absence is not mistaken for the year", () => {
    const [p] = learnPatterns([{ ...atomic, url: "https://x.com/p/bent-100-2027-skis/" }]);
    expect(p.template).toBe("https://x.com/p/{slug}-skis/");
  });
});

describe("guessUrls", () => {
  it("fills the shape with the brand's usual slug style first", () => {
    const pattern = { vendor: "atomic", template: "https://www.atomic.com/en-au/products/{slug}.html", style: 1, count: 2 };
    expect(guessUrls(pattern, { ...atomic, handle: "atomic-maverick-88-2027", title: "Atomic Maverick 88 2027" })[0]).toBe("https://www.atomic.com/en-au/products/maverick-88.html");
  });
});

describe("pageMatches", () => {
  it("wants every number and most words of the product's name on the page", () => {
    expect(pageMatches("Bent 100 | Atomic Skis AU", atomic)).toBe(true);
    expect(pageMatches("Bent 90 | Atomic Skis AU", atomic)).toBe(false);
    expect(pageMatches("Atomic Skis | Home", atomic)).toBe(false);
    expect(pageMatches("Custom Snowboard 2027", { vendor: "Burton", title: "Burton Custom Snowboard 2027" })).toBe(true);
  });
});

describe("findPageFor", () => {
  const html = (title: string) => `<html><head><title>${title}</title></head><body><h1>${title}</h1></body></html>`;
  const fetcher = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/products/bent-100-2027.html")) return new Response(html("Bent 100 | Atomic"), { status: 200, headers: { "content-type": "text/html" } });
    if (url.includes("searched.example")) return new Response(html("Bent 90 | Atomic"), { status: 200, headers: { "content-type": "text/html" } });
    return new Response("", { status: 404 });
  }) as typeof fetch;
  const patterns = [{ vendor: "atomic", template: "https://www.atomic.com/en-au/products/{slug}.html", style: 0, count: 1 }];

  it("takes the brand's shape when the page there is the product's", async () => {
    const r = await findPageFor({ id: "p", batchId: "b", ...atomic }, patterns, { fetcher, search: async () => null });
    expect(r.how).toBe("pattern");
    expect(r.url).toBe("https://www.atomic.com/en-au/products/bent-100-2027.html");
  });

  it("does not keep a searched page that is titled like another product", async () => {
    const r = await findPageFor({ id: "p", batchId: "b", vendor: "Atomic", handle: "atomic-bent-110-2027", title: "Atomic Bent 110 2027" }, patterns, { fetcher, search: async () => "https://searched.example/p" });
    expect(r.how).toBe("none");
    expect(r.said).toMatch(/does not look like this product/);
  });
});
