/**
 * Reading an order against the supplier's own reference sheet, before any product is built.
 *
 * An order form names things the way the warehouse does — "CUSTOM NEW GRAPHIC", "PROCESS FV NEW
 * GRAPHIC", "COUNTRBLNCE NEW GPAPHIC" — and a description list names them the way the catalogue
 * does: "Men's Custom Camber Snowboard", "Men's Process Flying V Snowboard", "Counterbalance Camber
 * Snowboard". The two have to be joined before the products are grouped, not after, because the
 * join is what says which lines are one product: Burton's own form spells Process two ways
 * ("GRAPHIC" and "GRAHIC") and until they were joined to the same model they came out as two
 * products with one board in one of them.
 *
 * Pure, and free of anything server-only, so the delivery flow in the browser can use it too.
 */

import { detectCategory, type CategoryRuleLike } from "./categorize";
import { COLOUR_WORDS, type CanonicalLineItem } from "./types";
import { seasonFrom } from "./season";

/**
 * Keep the lines that were ordered, when the sheet says which those are.
 *
 * An order form is a price list with the order written onto it. Burton's W27 form is the whole
 * range — 125 rows — with a number in ORDER QTY against the 12 boards that were bought, and every
 * blank row was being built as a product. A blank quantity reaches here as null (see applyMapping),
 * so the rule is simple: if any line in a file has a quantity, the lines without one were not
 * ordered. A file where no line has one is a price list, and every line stays.
 *
 * Rows with nothing to say what they are — no name, no code, no barcode — go too, whatever else is
 * on them: that is the form's footer, "TOTAL ORDER QTY 12, $6,586.27", which was being built into a
 * product with no name at a cost of $548.86.
 */
export function keepOrderedLines<T extends { item: CanonicalLineItem; fileId: string }>(lines: T[]): { kept: T[]; notOrdered: number; footers: number; files: string[] } {
  const identified = (i: CanonicalLineItem) => Boolean(i.title.trim() || i.sku.trim() || i.barcode.trim() || i.modelCode.trim());
  const withIdentity = lines.filter((l) => identified(l.item));
  const footers = lines.length - withIdentity.length;
  const orderedFiles = new Set(withIdentity.filter((l) => (l.item.quantity ?? 0) > 0).map((l) => l.fileId));
  const kept = withIdentity.filter((l) => !orderedFiles.has(l.fileId) || (l.item.quantity ?? 0) > 0);
  return { kept, notOrdered: withIdentity.length - kept.length, footers, files: [...orderedFiles] };
}

// ---------------------------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------------------------

const tokens = (text: string): string[] =>
  text.toUpperCase().replace(/['’`]/g, "").replace(/[^A-Z0-9]+/g, " ").trim().split(" ").filter(Boolean);

/** Who a model is for, which is not part of its name. */
const GENDER = new Set(["MEN", "MENS", "WOMEN", "WOMENS", "KID", "KIDS", "BOY", "BOYS", "GIRL", "GIRLS", "YOUTH", "UNISEX", "JUNIOR", "JR"]);
/**
 * What kind of thing it is, which the order form never repeats. A catalogue says "Men's Highshot
 * Step On Snowboard Boots" and "Gondy GORE-TEX Leather Gloves"; the order says "HIGHSHOT STEP ON"
 * and "GONDY GORE LTHR GL".
 */
const KIND = new Set(["SNOWBOARD", "SNOWBOARDS", "BOARD", "BOOT", "BOOTS", "BINDING", "BINDINGS", "GLOVE", "GLOVES", "MITT", "MITTS", "MITTEN", "MITTENS", "SOCK", "SOCKS", "BAG", "JACKET", "PANT", "PANTS", "GOGGLE", "GOGGLES", "HELMET", "BEANIE", "SKI", "SKIS"]);
/**
 * Which kind of thing a kind word names, so that two names agreeing on everything but the kind are
 * not the same product: "GORE-TEX Deluxe Gloves" is not "Deluxe GORE-TEX Mittens", though the
 * words between them are. A kind word on only one side says nothing — a shop name often carries
 * the kind where the order's shorthand does not.
 */
const KIND_FAMILY: Record<string, string> = {
  SNOWBOARD: "board", SNOWBOARDS: "board", BOARD: "board", BOOT: "boot", BOOTS: "boot", BINDING: "binding", BINDINGS: "binding",
  GLOVE: "glove", GLOVES: "glove", MITT: "mitten", MITTS: "mitten", MITTEN: "mitten", MITTENS: "mitten", SOCK: "sock", SOCKS: "sock",
  BAG: "bag", JACKET: "jacket", PANT: "pants", PANTS: "pants", GOGGLE: "goggle", GOGGLES: "goggle", HELMET: "helmet", BEANIE: "beanie", SKI: "ski", SKIS: "ski",
};
const kindsIn = (words: string[]): Set<string> => new Set(words.map((w) => KIND_FAMILY[w]).filter(Boolean));
const kindsDisagree = (a: string[], b: string[]): boolean => {
  const x = kindsIn(a), y = kindsIn(b);
  return x.size > 0 && y.size > 0 && ![...x].some((k) => y.has(k));
};
/**
 * A board's bend, which a catalogue name includes and an order form leaves out.
 *
 * "Men's Custom Camber Snowboard" is "CUSTOM" on the order: camber is the default and nobody writes
 * it. These may be missing from an order line without the line being about a different board.
 * "Flying V" is NOT here — on Burton's range it is a different model, and their forms do write it
 * ("CUSTOM FLYING V", "PROCESS FV").
 */
const OPTIONAL = new Set(["CAMBER", "DIRECTIONAL", "FLAT", "TOP", "PUREPOP", "PURE", "POP"]);
/** A graphic that has not been named yet, which is not a colour. */
const PLACEHOLDER = ["NEW", "GRAPHIC", "NO", "COLOR", "COLOUR", "TBC", "TBA"];
/** Order-form shorthand for a model word. */
const SHORTHAND: Record<string, string[]> = { FV: ["FLYING", "V"], SO: ["STEP", "ON"] };

/** Letters without the vowels, which is how an order form abbreviates: COUNTRBLNCE, COUNTERBALANCE. */
const skeleton = (word: string): string => word[0] + word.slice(1).replace(/[AEIOU]/g, "");

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const was = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = was;
    }
  }
  return row[b.length];
}

/**
 * The same word, written the way an order form writes it.
 *
 * Exactly; or abbreviated by dropping vowels, which is what "COUNTRBLNCE" is; or one slip in a long
 * word, which is what "GRAHIC" and "GPAPHIC" are. Short words must match exactly — "X" and "V" are
 * whole model names on this range, and one letter off is a different board.
 */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 5 && b.length >= 5 && skeleton(a) === skeleton(b)) return true;
  return a.length >= 6 && b.length >= 6 && editDistance(a, b) <= 1;
}

const isPlaceholder = (word: string): boolean => PLACEHOLDER.some((p) => sameWord(word, p));

function expand(words: string[]): string[] {
  return words.flatMap((w) => SHORTHAND[w] ?? [w]);
}

// ---------------------------------------------------------------------------------------------
// The reference sheet
// ---------------------------------------------------------------------------------------------

interface Reference {
  spec: CanonicalLineItem;
  code: string;
  required: string[];
  optional: string[];
  gender: "MENS" | "WOMENS" | "KIDS" | "";
}

function genderOf(name: string): Reference["gender"] {
  const first = tokens(name)[0] ?? "";
  if (first === "MENS" || first === "MEN") return "MENS";
  if (first === "WOMENS" || first === "WOMEN") return "WOMENS";
  if (["KIDS", "KID", "BOYS", "GIRLS", "YOUTH", "JUNIOR"].includes(first)) return "KIDS";
  return "";
}

function referenceOf(spec: CanonicalLineItem): Reference {
  const core = tokens(spec.title).filter((w) => !GENDER.has(w) && !KIND.has(w));
  return {
    spec,
    code: spec.modelCode.replace(/\s+/g, "").toUpperCase(),
    required: core.filter((w) => !OPTIONAL.has(w)),
    optional: core.filter((w) => OPTIONAL.has(w)),
    gender: genderOf(spec.title),
  };
}

/**
 * The catalogue name as the shop titles it.
 *
 * Their 2027 boards are "Custom 2027", "Custom X 2027", "Process 2027", "Yeasayer 2027" — the model,
 * then the season. So from "Men's Custom Camber Snowboard" the gender goes, the kind of thing goes,
 * and the bend goes when it is the default one nobody writes. The season is added later, where every
 * other product gets it, so it is not added here.
 */
export function shopName(catalogueName: string): string {
  let words = catalogueName.replace(/\s+/g, " ").trim().split(" ");
  while (words.length > 1 && GENDER.has(tokens(words[0])[0] ?? "")) words = words.slice(1);
  while (words.length > 1 && KIND.has(tokens(words[words.length - 1])[0] ?? "")) words = words.slice(0, -1);
  while (words.length > 1 && OPTIONAL.has(tokens(words[words.length - 1])[0] ?? "")) words = words.slice(0, -1);
  return words.join(" ");
}

// ---------------------------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------------------------

export interface LineMatch {
  spec: CanonicalLineItem;
  how: "code" | "name" | "model";
  /** What was left of the order's wording once the model's own words were taken out: the graphic. */
  graphic: string;
}

/**
 * Which reference row an order line is, or why none.
 *
 * By code first. Burton's MATERIAL is the Model # with a colour on the end — 106881A97DRG is model
 * 10688 in colourway 1A97DRG — so a reference code that starts the line's code is that model. The
 * longest such code wins, so a sheet listing both 1068 and 10688 cannot put 106881A97DRG on the wrong
 * one.
 *
 * Then by name, and only for lines that carry no code at all. A line WITH a code that matches no
 * reference row is a model the reference sheet does not cover — "CUSTOM FLYING V JUNGLE" is 10707,
 * and Burton's description list has no 10707 — and giving it the nearest name would give it another
 * board's description.
 *
 * By name, a reference row matches when every one of its model words is on the line (its bend may be
 * missing), and whatever is left on the line is not a model word itself. That second half is the
 * one that matters: "CUSTOM X NEW GRAPHIC" contains every word of "Custom Camber", and the X left
 * over is a word from another model's name, so it is not that board. The most specific match wins,
 * and a tie is refused rather than guessed.
 */
export function matchLine(line: CanonicalLineItem, refs: Reference[], vocabulary: Set<string>, sharedCodes = true, strict = false): LineMatch | { reason: string } {
  const code = (line.modelCode || line.sku).replace(/\s+/g, "").toUpperCase();
  const coded = refs.filter((r) => r.code);
  if (code && coded.length > 0) {
    // The sheet's code may be shorter than the order's (a PIM keys the model, "V2610134"; the order
    // says "V2610134.000") or LONGER (a barcode list keys the length, "V2610134.000.179"), and both
    // are the same model. Longer only where it extends the order's code at a separator, so that
    // "V26101" does not claim "V2610134".
    const extends_ = (r: Reference) => r.code.length > code.length && r.code.startsWith(code) && /^[.\-/]/.test(r.code.slice(code.length));
    const hits = coded.filter((r) => code === r.code || (r.code.length >= 4 && code.startsWith(r.code)) || extends_(r));
    const longest = Math.max(0, ...hits.filter((r) => !extends_(r)).map((r) => r.code.length));
    const exact = hits.filter((r) => !extends_(r) && r.code.length === longest);
    const best = exact.length > 0 ? exact : hits;
    // Several rows under ONE code are one model — a spec export has a row per length, five for the
    // M7 Mantra — not five candidates. Only different codes of the same length are a real tie. Rows
    // under a longer code (a row per length AND per colour) are one model when they share a name.
    const codes = new Set(best.map((r) => r.code));
    const names = new Set(best.map((r) => shopName(r.spec.title).toUpperCase()));
    if (codes.size === 1 || (exact.length === 0 && names.size === 1)) {
      const named = best.find((r) => r.spec.description.trim()) ?? best[0];
      return { spec: named.spec, how: "code", graphic: graphicOf(line.title, named, vocabulary) };
    }
    if (codes.size > 1) return { reason: `code ${code} fits ${names.size} different models on the reference sheet` };
    // Not on the sheet by its code. Where OTHER lines' codes do hit it the two share a code system,
    // so this one is simply not on it — Burton's splitboard has a code the list lacks, and matched
    // by name it became the Fish 3D snowboard. Only where no code of the order is on the sheet at
    // all are they different systems, and the wording is the one key they have in common.
    if (sharedCodes) return { reason: `code ${code} is not on the reference sheet` };
  }

  const words = expand(tokens(line.title));
  if (words.length === 0) return { reason: "the line has no name to match on" };
  const lineGender = genderOf(line.gender || "");

  type Scored = { ref: Reference; required: number; missingOptional: number };
  const scored: Scored[] = [];
  for (const ref of refs) {
    if (ref.required.length === 0) continue;
    if (!ref.required.every((w) => words.some((x) => sameWord(x, w)))) continue;
    // A glove is never a mitten, whatever else the two names share.
    if (kindsDisagree(words, tokens(ref.spec.title))) continue;
    // Whatever is left must be graphic words, not another model's name.
    const left = words.filter((x) => !ref.required.some((w) => sameWord(x, w)) && !ref.optional.some((w) => sameWord(x, w)));
    if (left.some((x) => [...vocabulary].some((v) => sameWord(x, v)))) continue;
    // Against the shop's own listings nothing is a graphic: "HIGHSHOT XPRO SO" is not the Highshot,
    // whatever XPRO might be, and the price of a wrong match there is the wrong listing updated.
    if (strict && left.some((x) => !isPlaceholder(x) && !COLOUR_WORDS.has(x) && !KIND.has(x) && !GENDER.has(x))) continue;
    // A women's board is not a kids' one. Only where both sides say: a catalogue name with no
    // gender on it is a unisex model, and fits a line of any gender.
    if (lineGender && ref.gender && ref.gender !== lineGender) continue;
    scored.push({ ref, required: ref.required.length, missingOptional: ref.optional.filter((w) => !words.some((x) => sameWord(x, w))).length });
  }
  if (scored.length === 0) return { reason: "no model on the reference sheet has this name" };
  scored.sort((a, b) => b.required - a.required || a.missingOptional - b.missingOptional);
  const [top, next] = scored;
  if (next && next.required === top.required && next.missingOptional === top.missingOptional && next.ref.code !== top.ref.code) {
    return { reason: `it fits both ${top.ref.spec.title} and ${next.ref.spec.title}` };
  }
  return { spec: top.ref.spec, how: "name", graphic: graphicOf(line.title, top.ref, vocabulary) };
}

/** The graphic: the line's words that are not the model's, less the placeholders. */
function graphicOf(title: string, ref: Reference, vocabulary: Set<string>): string {
  const words = expand(tokens(title));
  // Every word of the catalogue's own name, "JUNIOR" included, and every bend or fitting word:
  // Volkl's "BLAZE 94 BLACK FLAT" is the flat (no binding) Blaze 94 Black, not one in a colour "Flat".
  const own = tokens(ref.spec.title);
  const left = words.filter((x) =>
    !own.some((w) => sameWord(x, w))
    && !OPTIONAL.has(x)
    && ![...vocabulary].some((v) => sameWord(x, v))
    && !isPlaceholder(x));
  return left.map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");
}

// ---------------------------------------------------------------------------------------------
// Resolving
// ---------------------------------------------------------------------------------------------

export interface Resolution {
  items: CanonicalLineItem[];
  /** Per line, in order: the reference it was joined to, or why not. */
  joined: Array<{ line: string; to: string; how: LineMatch["how"] } | { line: string; reason: string }>;
}

/**
 * Join every order line to its reference row, and take what the reference knows.
 *
 * What a joined line takes: the catalogue's name, as the shop titles it; the reference's model code,
 * so every line of one model groups into one product however the form spelled it; the season, which
 * the order never states; the kind of product, read off the catalogue name ("Snowboard"), because
 * the order's "CUSTOM" says nothing about what a Custom is; and the graphic as the colour when the
 * graphic has a name ("Jungle"), not when it is Burton's "NEW GRAPHIC" placeholder.
 *
 * A line the reference sheet does not cover is left exactly as it was, and listed.
 */
export function resolveAgainstReference(
  items: CanonicalLineItem[],
  specs: CanonicalLineItem[],
  rules: CategoryRuleLike[],
  decided: Map<number, CanonicalLineItem> = new Map(),
  /** Which file a reference row came from. Lines are only filled in from lines joined to the same one. */
  sourceOf: (spec: CanonicalLineItem) => string = () => "",
  /** Refuse a name match with any word left over. For the shop's own listings; see matchLine. */
  strict = false,
): Resolution {
  const sources: string[] = [];
  const refs = specs.filter((s) => s.title.trim()).map(referenceOf);
  // Every word that is part of SOME model's name on this sheet. A word left over on a line that is
  // in here means the line is about another model.
  const vocabulary = new Set(refs.flatMap((r) => r.required));
  const joined: Resolution["joined"] = [];
  // Do the order's codes and the sheet's codes come from one system? If any line's code is on the
  // sheet, they do. See matchLine.
  const sharedCodes = items.some((line) => {
    const code = (line.modelCode || line.sku).replace(/\s+/g, "").toUpperCase();
    return code !== "" && refs.some((r) => r.code && (code === r.code || (r.code.length >= 4 && code.startsWith(r.code)) || (r.code.startsWith(code) && /^[.\-/]/.test(r.code.slice(code.length)))));
  });
  const named = colourways(refs.map((r) => shopName(r.spec.title)));
  const out = items.map((line, index) => {
    const pre = decided.get(index);
    const found = pre ? { spec: pre, how: "model" as const, graphic: graphicOf(line.title, referenceOf(pre), vocabulary) } : matchLine(line, refs, vocabulary, sharedCodes, strict);
    if ("reason" in found) {
      joined.push({ line: line.title || line.sku, reason: found.reason });
      return widen(line, rules);
    }
    const spec = found.spec;
    sources[index] = sourceOf(spec);
    joined.push({ line: line.title || line.sku, to: spec.title, how: found.how });
    const name = shopName(spec.title);
    const way = named.get(name) ?? peelColour(name, spec.colour);
    const next: CanonicalLineItem = {
      ...line,
      title: way?.model ?? name,
      modelCode: spec.modelCode || line.modelCode,
      // The supplier's own per-colour code is still the line's identity; keep it where it was.
      sku: line.sku || line.modelCode,
      // Only a season that reads as a year. Volkl writes "26/27"; left as it is it became a tag.
      season: line.season || (/^20\d{2}$/.test(seasonFrom(spec.season)) ? seasonFrom(spec.season) : ""),
      gender: tidyGender(line.gender) || tidyGender(spec.gender) || tidyGender(genderOf(spec.title)),
      colour: line.colour || found.graphic || way?.colour || "",
      terrain: line.terrain || spec.terrain,
    };
    // What kind of product this is, from the catalogue's full name rather than the short one.
    const rule = detectCategory({ ...next, title: spec.title, description: "" }, rules);
    if (rule) {
      next.category = rule.category;
      next.productType = next.productType || rule.productType;
    }
    return widen(next, rules);
  });
  return { items: oneProductPerName(fillFromSiblings(out, joined, sources, rules)).map((i) => widen(i, rules)), joined };
}

/**
 * A catalogue name that ends in a colour, split into the model and the colour.
 *
 * Volkl's export names each colourway as its own row: "BLAZE 94 BLACK", "BLAZE 94 ROSE". The shop
 * titles the model once — "Blaze 94 2027" — with the colour as its option. A trailing colour word is
 * only peeled off when the sheet lists the same model in another colour, or when the row's own
 * colour column says the same word; a name that merely ends in a colour stays whole.
 */
function colourways(names: string[]): Map<string, { model: string; colour: string }> {
  const byModel = new Map<string, Set<string>>();
  for (const name of names) {
    const split = trailingColour(name);
    if (!split) continue;
    const set = byModel.get(split.model.toUpperCase()) ?? new Set<string>();
    set.add(split.colour.toUpperCase());
    byModel.set(split.model.toUpperCase(), set);
  }
  const out = new Map<string, { model: string; colour: string }>();
  for (const name of names) {
    const split = trailingColour(name);
    if (split && (byModel.get(split.model.toUpperCase())?.size ?? 0) > 1) out.set(name, split);
  }
  return out;
}

function peelColour(name: string, colourColumn: string): { model: string; colour: string } | null {
  const split = trailingColour(name);
  return split && tokens(colourColumn).includes(tokens(split.colour)[0]) ? split : null;
}

function trailingColour(name: string): { model: string; colour: string } | null {
  const words = name.trim().split(/\s+/);
  const last = tokens(words[words.length - 1] ?? "")[0] ?? "";
  if (words.length < 2 || !COLOUR_WORDS.has(last)) return null;
  return { model: words.slice(0, -1).join(" "), colour: last.charAt(0) + last.slice(1).toLowerCase() };
}

/**
 * One model, one product, whatever the supplier's article numbers say.
 *
 * Volkl gives each colourway its own article: the Blaze 94 in black is V2610134 and in rose is
 * V2610135. Grouped on those codes, one order built two products both called "Blaze 94 2027". The
 * shop lists a model once with the colour as its option — "Process 2027" in Bad Dog — so lines that
 * came out with the same name and season are given one code between them, and the colour, which
 * the join already took off the line, is what tells them apart.
 */
function oneProductPerName(items: CanonicalLineItem[]): CanonicalLineItem[] {
  const codeFor = new Map<string, string>();
  return items.map((item) => {
    if (!item.modelCode) return item;
    const key = `${item.title.trim().toLowerCase()}\u0000${item.season}\u0000${item.brand.trim().toLowerCase()}`;
    const code = codeFor.get(key);
    if (!code) { codeFor.set(key, item.modelCode); return item; }
    return code === item.modelCode ? item : { ...item, modelCode: code };
  });
}

/**
 * What a line the reference sheet does not cover can still be told by the lines around it.
 *
 * Burton's list describes the Custom, the Process and the Yeasayer and not the women's Feelgood, so
 * the Feelgood line came out with no season, no Type and "NEW GRAPHIC" in its name — a board filed
 * nowhere, in no year. Every other line on the same order is a 2027 snowboard; so is it. Only where
 * the joined lines AGREE: an order of boards and bindings says nothing about a third thing.
 */
function fillFromSiblings(items: CanonicalLineItem[], joined: Resolution["joined"], sources: string[], rules: CategoryRuleLike[]): CanonicalLineItem[] {
  /**
   * What the lines beside this one agree on — at least two of them, and none disagreeing.
   *
   * A joined line looks only at lines joined to the SAME reference file: Volkl's Blaze 94 was
   * joined to the ski export, where every other line is a ski, and takes Skis from them — while the
   * Griffon beside it was joined to the barcode list, which says nothing about what anything is, and
   * is left as it was rather than filed as a ski. A line nothing joined looks at everything joined.
   */
  const agreed = (peers: CanonicalLineItem[], pick: (i: CanonicalLineItem) => string): string => {
    const values = peers.map(pick).filter(Boolean);
    return values.length >= 2 && new Set(values).size === 1 ? values[0] : "";
  };
  const known = (item: CanonicalLineItem) => Boolean(item.category || detectCategory(item, rules));
  return items.map((item, i) => {
    const isJoined = "to" in joined[i];
    const peers = items.filter((other, k) => k !== i && "to" in joined[k] && known(other) && (!isJoined || sources[k] === sources[i]));
    const category = agreed(peers, (x) => x.category);
    const productType = agreed(peers, (x) => x.productType);
    const season = agreed(peers, (x) => x.season);
    if (isJoined) {
      if (known(item)) return item;
      return { ...item, category: category || item.category, productType: item.productType || productType, season: item.season || season };
    }
    const words = item.title.split(/\s+/).filter((w) => w && !isPlaceholder(tokens(w)[0] ?? ""));
    return {
      ...item,
      // "FEELGOOD NEW GRAPHIC" is the Feelgood. The placeholder is not part of any board's name.
      title: words.join(" ") || item.title,
      gender: tidyGender(item.gender),
      category: item.category || (known(item) ? "" : category),
      productType: item.productType || (known(item) ? "" : productType),
      season: item.season || season,
    };
  });
}

function tidyGender(value: string): string {
  // Völkl's PIM writes "Unisex/Men" for a men's ski: the more specific word is the answer.
  const all = tokens(value);
  if (all.includes("UNISEX") && all.length > 1) return tidyGender(all.filter((w) => w !== "UNISEX").join(" "));
  const t = all[0] ?? "";
  if (t === "MENS" || t === "MEN") return "Mens";
  if (t === "WOMENS" || t === "WOMEN") return "Womens";
  if (t === "UNISEX") return "Unisex";
  if (["KIDS", "KID", "YOUTH", "BOYS", "GIRLS", "JUNIOR"].includes(t)) return "Kids";
  return value.trim();
}

/**
 * A wide board's length, written in full.
 *
 * Burton's form writes 158 Wide as "58W" — the last two digits and a W. The shop writes "158W" on
 * every wide board it lists, and a board or ski is never under a metre, so on those a two-digit
 * wide length is the hundreds dropped.
 */
function widen(item: CanonicalLineItem, rules: CategoryRuleLike[]): CanonicalLineItem {
  const size = item.size.trim();
  const length = item.length.trim();
  const isBoard = (item.category === "snowboards" || item.category === "skis")
    || ["snowboards", "skis"].includes(detectCategory(item, rules)?.category ?? "");
  if (!isBoard) return item;
  const fix = (v: string) => (/^\d{2}W$/i.test(v) ? `1${v.toUpperCase()}` : v);
  // On a board the SIZE column is the length. Left as a size as well, it became a second option —
  // "Length / Size", both saying 158W — where every board the shop lists has Length alone.
  if (size && !length) return { ...item, size: "", length: fix(size) };
  return { ...item, size: fix(size), length: fix(length) };
}
