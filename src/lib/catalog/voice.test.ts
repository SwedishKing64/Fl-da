import { describe, expect, it } from "vitest";
import { applySpellings, cleanVoice, DEFAULT_VOICE, describeVoice, exemplarsFor, voiceGuidance, withShopSections, withoutNeverTags, type Voice } from "./voice";

const voice: Voice = cleanVoice({
  audience: "weekend families from Canberra",
  use: ["colourway", "mitts"],
  avoid: ["premium", "game-changing"],
  spellings: [{ from: "color", to: "colour", brand: "" }, { from: "Jacket", to: "Shell", brand: "Arc'teryx" }],
  exemplars: [
    { title: "Talon 22 2026", body: "<p>A pack for long days.</p>", productType: "Backpacks", vendor: "Osprey" },
    { title: "Beta Shell", body: "<p>Alpine shell.</p>", productType: "Jackets", vendor: "Arc'teryx" },
    { title: "Trail Runner", body: "<p>Light shoe.</p>", productType: "Shoes", vendor: "Salomon" },
  ],
  sections: [{ heading: "Fitted in store", text: "Come in and we will fit it.\nNo charge.", types: ["Backpacks"], brands: [] }, { heading: "Our warranty", text: "Two years, here.", types: [], brands: [] }],
  brandNotes: [{ brand: "Arc'teryx", fit: "Runs small, go up a size.", care: "", origin: "Made in Canada." }],
  neverTags: [{ tag: "Sale", brand: "" }, { tag: "Downhill", brand: "Trek" }],
});

describe("the shop's voice", () => {
  it("is cleaned: duplicates, blanks and a spelling that changes nothing are dropped", () => {
    const v = cleanVoice({ use: "colourway, Colourway, , mitts", spellings: [{ from: "x", to: "X" }, { from: "a", to: "b" }], exemplars: [{}, { title: "T" }], sections: [{ heading: "H", text: "" }] });
    expect(v.use).toEqual(["colourway", "mitts"]);
    expect(v.spellings).toEqual([{ from: "a", to: "b", brand: "" }]);
    expect(v.exemplars).toEqual([{ title: "T", body: "", productType: "", vendor: "" }]);
    expect(v.sections).toEqual([]);
    expect(cleanVoice(null)).toEqual(DEFAULT_VOICE);
  });

  it("spells words the shop's way, whole words only, for the brand they are for", () => {
    expect(applySpellings("Color block jacket in two colors", voice)).toBe("Colour block jacket in two colors");
    expect(applySpellings("Beta Jacket", voice, "Arc'teryx")).toBe("Beta Shell");
    expect(applySpellings("Beta Jacket", voice, "Trek")).toBe("Beta Jacket");
    expect(applySpellings("Jackets", voice, "Arc'teryx")).toBe("Jackets");
  });

  it("picks the examples closest to the product: same type, then same brand", () => {
    expect(exemplarsFor(voice, { productType: "Jackets", vendor: "Patagonia" }).map((e) => e.title)).toEqual(["Beta Shell", "Talon 22 2026", "Trail Runner"]);
    expect(exemplarsFor(voice, { productType: "Hats", vendor: "Salomon" }, 1).map((e) => e.title)).toEqual(["Trail Runner"]);
  });

  it("adds the brand's notes and the shop's sections after the copy, once, and never to an empty copy", () => {
    const body = withShopSections("<p>A pack.</p>", voice, { productType: "Backpacks", vendor: "Arc'teryx" });
    expect(body).toContain("<p><strong>Fit:</strong> Runs small, go up a size.</p>");
    expect(body).toContain("<p><strong>Made:</strong> Made in Canada.</p>");
    expect(body).toContain("<h2>Fitted in store</h2><p>Come in and we will fit it.</p><p>No charge.</p>");
    expect(body).toContain("<h2>Our warranty</h2>");
    expect(withShopSections(body, voice, { productType: "Backpacks", vendor: "Arc'teryx" })).toBe(body);
    expect(withShopSections("<p>A shoe.</p>", voice, { productType: "Shoes", vendor: "Salomon" })).not.toContain("Fitted in store");
    expect(withShopSections("", voice, { productType: "Backpacks" })).toBe("");
  });

  it("drops the tags the shop never writes", () => {
    expect(withoutNeverTags(["Sale", "Downhill", "Park"], voice, "Trek")).toEqual(["Park"]);
    expect(withoutNeverTags(["Sale", "Downhill"], voice, "Giant")).toEqual(["Downhill"]);
  });

  it("tells the writer the voice, with the examples that fit the product", () => {
    const g = voiceGuidance(voice, { productType: "Jackets", vendor: "Arc'teryx" });
    expect(g).toContain("writes for weekend families from Canberra");
    expect(g).toContain("never uses: premium, game-changing");
    expect(g).toContain('"Shell" not "Jacket"');
    expect(g).toContain("About Arc'teryx: fit: Runs small");
    expect(g).toContain('("Our warranty")');
    expect(g).toContain("1. Title: Beta Shell\nAlpine shell.");
    expect(voiceGuidance(DEFAULT_VOICE)).toBe("");
  });

  it("says each piece as a sentence, and what is not yet taught", () => {
    const lines = describeVoice(DEFAULT_VOICE);
    expect(lines.every((l) => !l.taught)).toBe(true);
    expect(describeVoice(voice).find((l) => l.id === "voice.sections")?.sentence).toContain('"Fitted in store" (Backpacks)');
  });
});
