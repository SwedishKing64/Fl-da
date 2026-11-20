/**
 * How titles are written, inferred from a few typed the way the shop wants them.
 *
 * Instead of choosing "brand in front" and "year at the end" one setting at a time, the shop
 * types three titles as it would write them, and what they have in common becomes the naming
 * conventions: whether the brand leads, whether the model year ends the title, whether Men's or
 * Women's opens it, whether the supplier's capitals are kept. The result is said back as a
 * sentence to confirm, and one of the titles becomes the example new titles match. Pure.
 */

import { leadsWithVendor } from "./titles";
import type { HouseConventions } from "./house";

export interface TitleExample {
  title: string;
  /** The brand, where the shop names it; otherwise it is looked for among the shop's brands. */
  vendor?: string;
  productType?: string;
}

export interface TitleGrammar {
  naming: Pick<HouseConventions["naming"], "brandInTitle" | "season" | "audience" | "casing" | "example">;
  /** Where every example is of one product type: that type's title shape. */
  typeFormat?: { type: string; format: string };
  sentence: string;
  /** How many examples were read. Two or fewer is a thin reading, and the sentence says so. */
  from: number;
}

const YEAR_AT_END = /\b20\d{2}\s*$/;
const AUDIENCE_FIRST = /^(men's|women's|kids'|boys'|girls'|unisex)\b/i;
const letters = (s: string) => s.replace(/[^\p{L}]/gu, "");

/** The conventions the examples share. Null when there is nothing to read. */
export function inferTitleGrammar(examples: TitleExample[], brands: string[] = []): TitleGrammar | null {
  const clean = examples.map((e) => ({ title: e.title.trim().replace(/\s+/g, " "), vendor: (e.vendor ?? "").trim(), productType: (e.productType ?? "").trim() })).filter((e) => e.title);
  if (!clean.length) return null;
  const n = clean.length;
  const majority = (count: number) => count * 2 > n;
  const leads = clean.filter((e) => (e.vendor ? leadsWithVendor(e.vendor, e.title) : brands.some((b) => leadsWithVendor(b, e.title)))).length;
  const years = clean.filter((e) => YEAR_AT_END.test(e.title)).length;
  const audience = clean.filter((e) => AUDIENCE_FIRST.test(e.title)).length;
  const caps = clean.filter((e) => letters(e.title).length >= 3 && letters(e.title) === letters(e.title).toUpperCase()).length;
  const naming: TitleGrammar["naming"] = {
    brandInTitle: majority(leads) ? "always" : "never",
    season: years === n ? "always" : years === 0 ? "never" : "seasonal",
    audience: majority(audience) ? "front" : "none",
    casing: majority(caps) ? "supplier" : "shop",
    example: clean[0].title,
  };
  const types = new Set(clean.map((e) => e.productType.toLowerCase()).filter(Boolean));
  const typeFormat = types.size === 1 && clean.every((e) => e.productType) ? { type: clean[0].productType, format: clean[0].title } : undefined;
  const parts = [
    naming.brandInTitle === "always" ? "titles start with the brand" : "titles leave the brand out",
    naming.season === "always" ? "end with the model year" : naming.season === "never" ? "carry no model year" : "carry the model year only on seasonal types",
    naming.audience === "front" ? "open with Men's or Women's" : "say the gender in the tags, not the title",
    naming.casing === "supplier" ? "keep the supplier's capitals" : "are written in mixed case",
  ];
  const sentence = `From ${n === 1 ? "the one title" : `these ${n} titles`}: ${parts.join(", ")}${typeFormat ? `; ${typeFormat.type} titles read like "${typeFormat.format}"` : ""}.${n < 3 ? " Three or more titles read more surely." : ""}`;
  return { naming, typeFormat, sentence, from: n };
}
