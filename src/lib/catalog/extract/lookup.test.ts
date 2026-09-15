import { describe, expect, it } from "vitest";
import { applyLookup, bodyHtmlFrom, type ProductLookup } from "./lookup";

const found: ProductLookup = {
  vendor: "Giro",
  description: "A lightweight in-mould helmet with Giro's Spherical Technology.",
  features: ["In-Mold construction", "Passive aeration", "270g"],
  rrp: 299.95,
  sourceUrl: "https://www.giro.com/ledge",
  confident: true,
};

const product = { vendor: "", bodyHtml: "", rrp: null as number | null };

describe("what a lookup is allowed to change", () => {
  /** The invoice is what the shop is being charged for, so it wins on everything it states. */
  it("fills the gaps a Giro invoice leaves", () => {
    const out = applyLookup(product, found);
    expect(out.vendor).toBe("Giro");
    expect(out.rrp).toBe(299.95);
    expect(out.bodyHtml).toContain("Spherical Technology");
  });

  it("never overwrites what the invoice already said", () => {
    const out = applyLookup({ vendor: "Giro Sport Design", bodyHtml: "<p>From the order.</p>", rrp: 279 }, found);
    expect(out.vendor).toBe("Giro Sport Design");
    expect(out.bodyHtml).toBe("<p>From the order.</p>");
    expect(out.rrp).toBe(279);
  });

  /** A wrong brand or a wrong price is worse than an empty column. */
  it("takes only the description when the page might be a different model", () => {
    const out = applyLookup(product, { ...found, confident: false });
    expect(out.vendor).toBe("");
    expect(out.rrp).toBeNull();
    expect(out.bodyHtml).toContain("Spherical Technology");
  });

  it("changes nothing when the search found nothing", () => {
    const empty: ProductLookup = { vendor: "", description: "", features: [], rrp: null, sourceUrl: "", confident: false };
    expect(applyLookup(product, empty)).toEqual(product);
  });

  it("does not take a price of zero for an answer", () => {
    expect(applyLookup(product, { ...found, rrp: 0 }).rrp).toBeNull();
  });
});

describe("the body the shop writes", () => {
  it("puts the description above a Tech Specs list", () => {
    const html = bodyHtmlFrom(found);
    expect(html).toBe(
      "<p>A lightweight in-mould helmet with Giro's Spherical Technology.</p>\n<h2>Tech Specs</h2>\n<ul><li>In-Mold construction</li><li>Passive aeration</li><li>270g</li></ul>",
    );
  });

  it("leaves out the list when nothing was published", () => {
    expect(bodyHtmlFrom({ ...found, features: [] })).toBe("<p>A lightweight in-mould helmet with Giro's Spherical Technology.</p>");
  });

  it("escapes what it is given", () => {
    expect(bodyHtmlFrom({ ...found, description: "Rossignol <b>Sender</b> & friends", features: [] }))
      .toBe("<p>Rossignol &lt;b&gt;Sender&lt;/b&gt; &amp; friends</p>");
  });

  it("is empty when there is nothing to say", () => {
    expect(bodyHtmlFrom({ ...found, description: "", features: [] })).toBe("");
  });
});
