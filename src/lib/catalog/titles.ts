/**
 * How a product is named: the Title column, and the SEO title that goes with it.
 *
 * Two rules, both read off the shop's own catalogue. The Title never carries the brand — not one of
 * its 827 products begins with its own vendor — and the SEO title always does: 752 of the 797
 * products that have one are exactly the vendor followed by the title, and not one is the title
 * alone. And a seasonal product carries its year after the name: every snowboard, 96% of skis, 95%
 * of snowboard bindings, 91% of snow clothing. Outdoor kit never does, which is the same line the
 * season tag draws — a product that carries a year tag carries the year in its name.
 */

import { EVERGREEN_SEASON, MANUAL_SEASON } from "./tagging";
import { houseConventions } from "./taxonomy";

const YEAR_IN_NAME = /\b20\d{2}\b/;

/** The years that are not a season: the shop's sentinels for something that does not change. */
function isSeason(value: string | number | undefined | null): boolean {
  const season = String(value ?? "").trim();
  if (!/^20\d{2}$/.test(season)) return false;
  return season !== EVERGREEN_SEASON && season !== MANUAL_SEASON;
}

/**
 * The Title column: the product's own name, with its season after it.
 *
 * A name that already carries a year is left alone — "Mantra Junior 2025" is not made into "Mantra
 * Junior 2025 2026" — and so is anything without a season, which is how a tent stays a tent.
 */
export function productTitle(name: string, season?: string | number | null): string {
  const { naming } = houseConventions();
  const title = naming.casing === "supplier" ? name.trim().replace(/\s+/g, " ") : asShopWritesIt(name);
  if (!title || naming.season === "never" || !isSeason(season) || YEAR_IN_NAME.test(title)) return title;
  return `${title} ${season}`;
}

/** The Title column with the brand in front, for a shop whose titles lead with it. */
export function titledForShop(vendor: string, title: string): string {
  return houseConventions().naming.brandInTitle === "always" ? seoTitle(vendor, title) : title;
}

/** Words the shop keeps lower case inside a name, and the units it writes that way. */
const LOWER_IN_NAME = new Set(["INC", "INCL", "AND", "THE", "OF", "WITH", "IN", "FOR", "TO", "CM", "MM", "KG"]);
/** Codes and brands with a case of their own, which titling by rule would get wrong. */
const OWN_CASE: Record<string, string> = { TI: "Ti", JR: "Jr", MR: "Mr", DEMO: "Demo", FIS: "FIS", MIPS: "MIPS", GW: "GW", GORE: "GORE", TEX: "TEX", BOA: "BOA", "[AK]": "[ak]", "RE:FLEX": "Re:Flex" };
/** Markers the shop does shout, and keeps on the end of a name: "Blaze 94 2025 EX DEMO". */
const SHOUTED_TAIL = /\s(EX DEMO|SUPERSEDED)$/;

/**
 * A supplier's shouting turned into the case this shop writes.
 *
 * Every order form and spec sheet arrives in capitals — "M7 MANTRA", "SX-2M MITT MENS" — and until
 * now that is exactly how the product went onto the shelf. The shop's own catalogue settles it: of
 * its 1,197 distinct titles, 1,187 are written in mixed case and the ten that are not are short
 * model codes (QST 92, MOD1 - MIPS, F8 LNC). So a name in capitals is a supplier's formatting, not
 * a name, and a name with any lower case in it has already been written by a person — untouched.
 *
 * The rules are read off those same titles, and measured against them: shouting each of the 1,197
 * and casing it back rebuilds 820 of them character for character. The rest are their own
 * inconsistencies ("Hero Gs Pro" beside "Hero GS Pro") and camel case that cannot be recovered from
 * capitals at all — vMotion, S/MAX. Which is why what this builds is a DRAFT: 69% exactly right and
 * the rest readable beats 0% and a catalogue that shouts.
 *
 *   a token with a digit in it   letter runs cased   89TI -> 89Ti, XP11 -> Xp11, 90C -> 90C
 *   three letters, no vowel      left alone          GS, SL, XT, QST, FR
 *   a word with its own case     as the shop spells it   TI -> Ti, MIPS -> MIPS
 *   a joining word               lower                inc, and, with, cm
 */
export function asShopWritesIt(name: string): string {
  const text = name.trim().replace(/\s+/g, " ");
  // Anything a person has already written has lower case in it somewhere. Leave it exactly alone.
  if (!text || /[a-z]/.test(text)) return text;
  const tail = SHOUTED_TAIL.exec(text);
  const body = tail ? text.slice(0, text.length - tail[0].length) : text;
  const cased = withMarks(body.split(" ").map((token) => token.split(/([/\-])/).map(casePart).join("")).join(" "));
  return tail ? `${cased} ${tail[1]}` : cased;
}

/** The registered marks the shop writes on a name: every one of its Step On and BOA listings carries ®. */
function withMarks(name: string): string {
  return name.replace(/\bStep On\b(?!®)/g, "Step On®").replace(/\bBOA\b(?!®)/g, "BOA®");
}

function casePart(part: string): string {
  if (part === "") return part;
  if (LOWER_IN_NAME.has(part)) return part.toLowerCase();
  if (OWN_CASE[part]) return OWN_CASE[part];
  // A code with digits in it keeps its digits and its single letters: 90C, M7, 7.0.
  if (/\d/.test(part)) {
    return part.replace(/[A-Z]{2,}/g, (run) => (LOWER_IN_NAME.has(run) ? run.toLowerCase() : run.charAt(0) + run.slice(1).toLowerCase()));
  }
  const letters = part.replace(/[^A-Z]/g, "");
  // An initialism has no vowel to speak: GS, SL, XT, NX, W. Cased, they stop being one.
  if (letters.length <= 3 && !/[AEIOU]/.test(letters)) return part;
  return part.charAt(0) + part.slice(1).toLowerCase();
}

/**
 * The SEO Title column: the vendor, then the title. The shop writes "Volkl Mantra 88 2026" for a
 * product titled "Mantra 88 2026", and a title that already leads with its brand is not given it
 * twice.
 */
export function seoTitle(vendor: string, title: string): string {
  const brand = vendor.trim().replace(/\s+/g, " ");
  const name = title.trim().replace(/\s+/g, " ");
  if (!brand) return name;
  if (!name) return brand;
  return name.toLowerCase().startsWith(`${brand.toLowerCase()} `) || name.toLowerCase() === brand.toLowerCase()
    ? name
    : `${brand} ${name}`;
}

/** A brand or a name as compared: no accents, no ® or ™, lower case. "Völkl®" is "volkl". */
const plainBrand = (s: string): string => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[®™©]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/** A gender or age word a page puts in front of the brand: "Men's Burton Cartel X". */
const LEAD_WORD = /^(?:men['’]?s|women['’]?s|ladies['’]?|unisex|kids['’]?|youth|junior|boys['’]?|girls['’]?)\s+/i;

/** True when a title names its own brand, which the shop's Title column never does. */
export function leadsWithVendor(vendor: string, title: string): boolean {
  const brand = plainBrand(vendor);
  if (!brand) return false;
  const name = plainBrand(title).replace(LEAD_WORD, "");
  return name === brand || name.startsWith(`${brand} `) || name.startsWith(`${brand}:`) || name.startsWith(`${brand}-`) || Boolean(brandCode(vendor, title));
}

/**
 * A distributor's short code for the brand on the front of a line, in capitals: Outdoor Agencies
 * writes Nemo's tents "NEM Dagger Osmo 2P Tent". Three or four letters that begin the brand's
 * name, and not the whole of it. "" when the title has none.
 */
function brandCode(vendor: string, title: string): string {
  const first = /^([A-Z]{3,4})\s+(?=\S)/.exec(title.trim())?.[1] ?? "";
  const brand = plainBrand(vendor).replace(/\s+/g, "");
  return first && brand.length > first.length && brand.startsWith(first.toLowerCase()) ? first : "";
}

/**
 * Take the brand back off a title that arrived with it, since the Title column does not carry it
 * (asked again 2026-10-22: Burton's pages write "Men's Burton Cartel X Re:Flex", and the brand stayed
 * because it was only looked for at the very front). Any "Men's" or "Kids'" before it is kept.
 */
export function withoutVendor(vendor: string, title: string): string {
  const t = title.trim();
  if (!leadsWithVendor(vendor, t)) return t;
  const code = brandCode(vendor, t);
  if (code) return t.slice(code.length).trim();
  const lead = LEAD_WORD.exec(t)?.[0] ?? "";
  const rest = t.slice(lead.length);
  // The brand as the title spells it, accents and ® included: as many words as the vendor has.
  const words = plainBrand(vendor).split(" ").length;
  const m = new RegExp(`^(?:\\S+\\s+){${words - 1}}\\S+?(?=[\\s:–—-]|$)[®™]?`).exec(rest);
  const after = (m ? rest.slice(m[0].length) : rest).trim().replace(/^[®™]?\s*[-–—:,]?\s*/, "");
  return after ? `${lead}${after}`.trim() : t;
}

/**
 * The year a product's title carries: its season, unless the shop puts the year only on the
 * product types and tags it chose and this product is none of them.
 */
export function titleYear(tags: string[], productType = ""): string | null {
  const season = seasonTagFrom(tags);
  const { naming } = houseConventions();
  if (!season || naming.season !== "chosen") return season;
  const norm = (s: string) => s.trim().toLowerCase();
  const types = new Set((naming.yearOn?.types ?? []).map(norm));
  const wanted = new Set((naming.yearOn?.tags ?? []).map(norm));
  return types.has(norm(productType)) || tags.some((t) => wanted.has(norm(t))) ? season : null;
}

/**
 * The season a product belongs to, read off its tags.
 *
 * The year tag is where the season is decided, so both the name and the URL handle are built from
 * this one answer rather than each working it out for itself.
 */
export function seasonTagFrom(tags: string[]): string | null {
  return tags.find((t) => /^20\d{2}$/.test(t.trim())) ?? null;
}
