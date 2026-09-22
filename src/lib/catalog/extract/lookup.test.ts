import { describe, it, expect } from "vitest";
import { bodyHtmlFrom, applyLookup, isPlaceholderBody, type ProductLookup } from "./lookup";

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

  it("never overwrites what the invoice stated, or a description someone wrote", () => {
    // The body here is real prose. A one-line body is the placeholder the build step writes from
    // the invoice, and the manufacturer's copy is meant to replace that — see the placeholder
    // tests below, and isPlaceholderBody for where the line sits.
    const priced = { vendor: "Giro Sport Design", bodyHtml: `<p>${"our own words ".repeat(12).trim()}</p>`, rrp: 219 };
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

/**
 * The invoice's own line must never be mistaken for the manufacturer's copy.
 *
 * Building products writes the invoice line into the description so the column is not blank, and
 * everything downstream only filled a description that was *empty*. The result was that every
 * product built from an invoice shipped to Shopify reading "<p>Spyder mens technical jacket.</p>"
 * and the web lookup — the entire reason for the API key — never ran on any of them.
 */
describe("telling the invoice's words from the brand's", () => {
  it("treats an invoice line as a gap still to fill", () => {
    expect(isPlaceholderBody("")).toBe(true);
    expect(isPlaceholderBody("   ")).toBe(true);
    expect(isPlaceholderBody("<p>Spyder mens technical jacket.</p>")).toBe(true);
    expect(isPlaceholderBody("<p>SPYD Mens Technical Jackets — Titan GTX</p>")).toBe(true);
    expect(isPlaceholderBody("<p>Giro Ledge MIPS Helmet</p>")).toBe(true);
  });

  it("leaves a real description alone", () => {
    // The house format: manufacturer's prose, then the spec list.
    expect(isPlaceholderBody(bodyHtmlFrom(found()))).toBe(false);
    // Prose with no spec list is still prose.
    const prose = `<p>${"word ".repeat(60).trim()}</p>`;
    expect(isPlaceholderBody(prose)).toBe(false);
    // Two paragraphs is someone's writing, however short.
    expect(isPlaceholderBody("<p>Short one.</p><p>Short two.</p>")).toBe(false);
    // A spec list on its own IS a placeholder, deliberately. A supplier's export gives the numbers
    // and never the words, so those specs go on the product straight away — and the body still has
    // to read as unwritten, or the lookup could never come back and add the prose.
    expect(isPlaceholderBody("<ul><li>Shell: 20k</li></ul>")).toBe(true);
    expect(isPlaceholderBody("<h2>Tech Specs</h2><ul><li>WAIST WIDTH: 96 mm</li></ul>")).toBe(true);
    // With prose in front of it, it is written.
    expect(isPlaceholderBody(`<p>${"word ".repeat(30).trim()}</p><ul><li>Shell: 20k</li></ul>`)).toBe(false);
  });

  it("lets the manufacturer's copy replace the invoice line, but not a written one", () => {
    const fromInvoice = { vendor: "", bodyHtml: "<p>Giro Ledge MIPS Helmet</p>", rrp: null as number | null };
    expect(applyLookup(fromInvoice, found()).bodyHtml).toBe(bodyHtmlFrom(found()));

    const written = { vendor: "", bodyHtml: `<p>${"our own words ".repeat(12).trim()}</p>`, rrp: null as number | null };
    expect(applyLookup(written, found()).bodyHtml).toBe(written.bodyHtml);
  });
});
