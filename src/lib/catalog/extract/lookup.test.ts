import { describe, it, expect } from "vitest";
import { bodyHtmlFrom, applyLookup, type ProductLookup } from "./lookup";

const found = (over: Partial<ProductLookup> = {}): ProductLookup => ({
  vendor: "Giro",
  description: "A helmet that keeps its shape.",
  features: ["Shell: In-Mould", "Weight: 380 g"],
  rrp: 249.95,
  sourceUrl: "https://www.giro.com/p/ledge-mips",
  confident: true,
  ...over,
});

describe("the shop's description layout", () => {
  it("is a paragraph, a Tech Specs heading and a list, one element per line", () => {
    // Measured off their own 827 exported products: 414 of the 714 with a body are exactly this.
    expect(bodyHtmlFrom(found())).toBe(
      ["<p>A helmet that keeps its shape.</p>", "<h2>Tech Specs</h2>", "<ul>", "<li>Shell: In-Mould</li>", "<li>Weight: 380 g</li>", "</ul>"].join("\n"),
    );
  });

  it("gives a second paragraph its own <p>, as the longer ones in the exports do", () => {
    const html = bodyHtmlFrom(found({ description: "First para.\n\nSecond para.", features: [] }));
    expect(html).toBe("<p>First para.</p>\n<p>Second para.</p>");
  });

  it("leaves out Tech Specs entirely when the manufacturer published no specs", () => {
    expect(bodyHtmlFrom(found({ features: [] }))).toBe("<p>A helmet that keeps its shape.</p>");
  });

  it("writes nothing at all rather than an empty shell", () => {
    expect(bodyHtmlFrom(found({ description: "", features: [] }))).toBe("");
  });

  it("escapes what came off the web, so a & in a spec cannot break the CSV's HTML", () => {
    expect(bodyHtmlFrom(found({ description: "Fox & Hound <b>", features: [] }))).toBe("<p>Fox &amp; Hound &lt;b&gt;</p>");
  });

  it("collapses the whitespace a scraped page brings with it", () => {
    expect(bodyHtmlFrom(found({ description: "Two   spaces\nand a wrap.", features: [] }))).toBe("<p>Two spaces and a wrap.</p>");
  });
});

describe("what a lookup is allowed to overwrite", () => {
  const product = { vendor: "", bodyHtml: "", rrp: null as number | null };

  it("fills the empty columns", () => {
    expect(applyLookup(product, found())).toMatchObject({ vendor: "Giro", rrp: 249.95 });
  });

  it("never overwrites what the invoice stated", () => {
    const priced = { vendor: "Giro Sport Design", bodyHtml: "<p>Ours.</p>", rrp: 219 };
    expect(applyLookup(priced, found())).toEqual(priced);
  });

  it("will not name a brand or set a price off a page it is unsure of", () => {
    const out = applyLookup(product, found({ confident: false }));
    expect(out.vendor).toBe("");
    expect(out.rrp).toBeNull();
    // The description is still worth having — a person reads it before it ships.
    expect(out.bodyHtml).toContain("keeps its shape");
  });

  it("ignores a price of zero, which is what a page with no price reads as", () => {
    expect(applyLookup(product, found({ rrp: 0 })).rrp).toBeNull();
  });
});
