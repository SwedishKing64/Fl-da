// Supplier column mapping: suggest a mapping from source headers to canonical fields,
// fingerprint header rows so a saved template is auto-detected next time, and apply a
// mapping to raw rows to produce CanonicalLineItems.

import { createHash } from "node:crypto";
import { CANONICAL_FIELDS, FEATURE_COLUMN, emptyLineItem, type CanonicalLineItem } from "./types";
export { FEATURE_COLUMN };
import { parseIntSafe, parseMoney } from "./money";
import { seasonFrom } from "./season";
import { colourName } from "./colour";
import { terrainColumn } from "./shop-memory";
import { isBrand } from "./brands";
import { expandShorthand } from "./shorthand";

export { seasonFrom };

export type Mapping = Record<string, keyof CanonicalLineItem | "">;

export interface MappingOptions {
  /** Values applied to every row when the file doesn't carry them (brand, category, season...). */
  fixed?: Partial<Record<keyof CanonicalLineItem, string>>;
  /** Multiply cost by this if the supplier prints line totals instead of unit prices. */
  costIsLineTotal?: boolean;
}

/** What a saved template stores beside its mapping: the options, and the suggestion it was saved against. */
export type SavedOptions = MappingOptions & { suggestedAtSave?: Mapping };

/** The spelling a heading is compared by: case, punctuation and spacing set aside. */
export function normaliseHeader(h: string): string {
  return norm(h);
}

function norm(h: string): string {
  // "#" is "number". Kept as a symbol, "Model #" read as the bare word "model" and was taken as
  // the product's NAME — on Burton's description list that put 10688 in the title and the real
  // name, in the next column, into the model code, and no description could ever be matched.
  return h.toLowerCase().replace(/#/g, " number ").replace(/[_\-./()]/g, " ").replace(/\s+/g, " ").trim();
}


/** Three-letter currency codes that head a price column: "AUD-RETAIL", "NZD-WHSL". */
const CURRENCY = /^(aud|nzd|usd|eur|gbp|cad|chf|jpy|sek|nok)\s/;

/**
 * Whether a column is another currency's copy of one this shop prices in.
 *
 * Burton's order form carries every price twice — AUD-RETAIL and NZD-RETAIL, AUD-WHSL and NZD-WHSL —
 * and which one a heading match landed on came down to which column happened to come first. For
 * an Australian shop the AUD one is the price, whatever order the columns are in.
 */
function isOtherCurrencyTwin(header: string, headers: string[]): boolean {
  const n = norm(header);
  const m = CURRENCY.exec(n);
  if (!m || m[1] === "aud") return false;
  const rest = n.slice(m[0].length);
  return headers.some((h) => norm(h) === `aud ${rest}`);
}

/**
 * A column whose heading suggests a code is only a code if what is under it looks like one.
 *
 * "Material" is Burton's SAP code column — 106881A97DRG — and an apparel spec sheet's fabric
 * column, "100% polyester". Taken on its heading alone, the second would become every garment's
 * model code and group a whole delivery into one product.
 */
const CODE_LIKE = /^(?=.*\d)[A-Z0-9][A-Z0-9.\-/]{3,}$/i;
function valuesLookLikeCodes(header: string, rows: Array<Record<string, string>>): boolean {
  const values = rows.map((r) => (r[header] ?? "").toString().trim()).filter(Boolean);
  if (values.length === 0) return true;          // nothing to disprove it; an empty column costs nothing
  return values.filter((v) => CODE_LIKE.test(v)).length / values.length >= 0.8;
}
/** "Style", "Model" and "Material" head a code column on one form and a name column on the next. */
const NEEDS_CODE_VALUES = /^(material|style|model)( description| desc| name| text| no| number| code)?$|^ref$/;

/**
 * A column that names a party to the order — who is buying, who is paying, who is selling it —
 * which is never what was bought. Burton's SAP export has Payer Name, Customer Name and a Super Rep
 * on every line, all reading "Alpsport" or a code, and "Payer Name" was taken as the product's name:
 * four hundred lines, all called Alpsport, built as one product.
 */
export const PARTY = /\b(payer|customer|buyer|account|sold to|ship to|bill to|dealer|retailer|client|rep|sales ?person|agent|consignee|store|warehouse)\b/;

/**
 * A heading without the word that says it is a description of something: "Gender Description" is
 * the gender, "Business Area Text" the business area. SAP exports head every column this way, and
 * "gender" was too small a part of "gender description" to be read.
 */
const core = (n: string): string => n.replace(/\s(description|desc|text|name|value)$/, "");

/**
 * A heading without the tax words that qualify it: "Cost Ex GST" is the cost, "RRP Inc GST" the
 * retail. Left on, they made "cost" too small a part of the heading to count, and the column was
 * never read.
 */
const untaxed = (n: string): string => n.replace(/\b(ex|excl|excluding|inc|incl|including|plus|less)\s*(gst|vat|tax|sales tax)\b/g, " ").replace(/\b(gst|vat|tax)\s*(ex|excl|inc|incl)\b/g, " ").replace(/\s+/g, " ").trim();

/** A party heading that is really a price: "Dealer Price", "Retailer Cost". */
const PRICED = /\b(price|cost|net|wholesale|nett)\b/;

/** Who an order line is for, written as a word on its own: Burton's "MENS", "WOMENS", "KIDS". */
const AUDIENCE = /^(mens?|womens?|ladies|kids?|youth|junior|jr|boys?|girls?|unisex|adult)$/i;

/**
 * How a thing fits, as against what size it is: a boot comes Regular or Wide, a goggle Regular or
 * Low Bridge, a helmet Round Fit. A column of these is a fit column whatever it is headed —
 * Burton's is "Size Z Description".
 */
export const FIT_VALUE = /^(regular|standard|std|wide|extra wide|x-?wide|narrow|low bridge( fit)?|asian fit|round fit|oval fit|regular fit|slim( fit)?|relaxed( fit)?|short|long|tall|petite|plus)$/i;
/** A cell that says there is nothing to say. */
export const NOT_A_VALUE = /^(na|n\/a|n\.a\.|none|noc|nil|null|tbc|tba|-|\.|x)$/i;
/** A fit that is simply the default, and says nothing. */
export const DEFAULT_FIT = /^(regular|standard|std|regular fit)$/i;

/**
 * A word that says what KIND of thing a product is, as a supplier's own category columns use them.
 * Burton's "PH2 Description" reads GOGGLES, HELMETS, BAGS, BINDINGS, BOOTS, BOARDS, SOCKS,
 * OUTERWEAR, GLOVES; its "PH3" the kind within that. Neither heading says what the column is for.
 */
export const KIND_VALUE = /\b(goggles?|helmets?|bags?|bindings?|boots?|boards?|snowboards?|skis?|socks?|outerwear|gloves?|mitts?|mittens?|headwear|beanies?|accessories|jackets?|pants?|bibs?|poles?|apparel|clothing|protection|luggage|packs?|footwear|base ?layers?|mid ?layers?|fleece|hoodies?|neckwear|eyewear|sunglasses|skins|wax|tools?|locks?|straps?|leashes|shorts?|tops?|vests?|suits?)\b/i;

/** What is under a heading: its non-empty cells, and how many of them pass a test. */
function share(header: string, rows: Array<Record<string, string>>, test: (v: string) => boolean): { values: string[]; share: number } {
  const values = rows.map((r) => (r[header] ?? "").toString().trim()).filter(Boolean);
  return { values, share: values.length === 0 ? 0 : values.filter(test).length / values.length };
}

/** Best-effort mapping suggestion from header names via the synonym lists in CANONICAL_FIELDS. */
export function suggestMapping(headers: string[], rows: Array<Record<string, string>> = []): Mapping {
  const mapping: Mapping = {};
  const used = new Set<string>();
  // Checked before anything claims a field, so a twin can never take the AUD column's place.
  const skip = new Set(headers.filter((h) => isOtherCurrencyTwin(h, headers)));
  const party = new Set(headers.filter((h) => PARTY.test(norm(h)) && !PRICED.test(norm(h))));
  /**
   * Whether what is under a heading rules out what the heading says.
   *
   * A code column whose cells are words is not a code column; a name column whose cells are all one
   * word, or all numbers, is not naming products; a season column whose cells are not seasons is
   * not one ("Collection" reads NOC on every line of Burton's export, while the season sits under
   * "Selling Season ITM" as 26WIN).
   */
  const refused = (header: string, key: string): boolean => {
    if (key === "modelCode") return NEEDS_CODE_VALUES.test(norm(header)) && !valuesLookLikeCodes(header, rows);
    if (key === "title" || key === "brand" || key === "description") {
      if (party.has(header)) return true;
      if (key !== "title" || rows.length < 5) return false;
      const { values, share: numeric } = share(header, rows, (v) => /^\d+$/.test(v));
      return values.length > 0 && (new Set(values.map((v) => v.toLowerCase())).size < 2 || numeric >= 0.8);
    }
    if (key === "season") {
      const { values, share: seasons } = share(header, rows, (v) => /^20\d{2}$/.test(seasonFrom(v)));
      return values.length > 0 && seasons < 0.5;
    }
    return false;
  };
  const canonicalKeys = new Set(CANONICAL_FIELDS.map((f) => f.key as string));
  const codeField = CANONICAL_FIELDS.find((f) => f.key === "modelCode")!;

  // Pass 1: exact canonical key or exact synonym matches.
  for (const header of headers) {
    const n = norm(header);
    // A header that spells a canonical key maps to itself — except "description", which means
    // two different things in the two vocabularies. Here it is the long body copy; in every
    // supplier export it is the product's NAME ("M7 MANTRA", "SQUIRE 12 TCX 90MM"). Taking it
    // literally put the model name in the body and left the product with no title.
    if (canonicalKeys.has(header) && header !== "description" && !used.has(header)) {
      mapping[header] = header as keyof CanonicalLineItem;
      used.add(header);
      continue;
    }
    if (skip.has(header) || party.has(header)) continue;
    const names = [...new Set([n, core(n), untaxed(n), core(untaxed(n))])];
    const exact = CANONICAL_FIELDS.find((f) => !used.has(f.key) && names.some((x) => f.synonyms.includes(x)) && !refused(header, f.key));
    if (exact) {
      mapping[header] = exact.key;
      used.add(exact.key);
      continue;
    }
    // A code column whose cells are words is the product's name: "Style" is 10688 on one supplier's
    // form and "M4 CYLINDRICAL" on Burton's.
    if (!used.has("title") && names.some((x) => codeField.synonyms.includes(x)) && refused(header, "modelCode") && !refused(header, "title")) {
      mapping[header] = "title";
      used.add("title");
    }
  }
  /**
   * Between the exact pass and the loose one: a column that says it is the CONFIRMED quantity is
   * the quantity, whatever other quantity columns the sheet has and wherever they sit.
   *
   * Burton's confirmation sheet carries Demand Quantity, Confirmed Quantity, Unconfirmed Quantity
   * and Cancel side by side. What is coming is what the supplier confirmed; read by column order
   * the demand was taken, which booked the lines Burton had not confirmed.
   */
  if (!used.has("quantity")) {
    const confirmed = headers.find((h) => !mapping[h] && !skip.has(h) && /(^|\s)confirmed\s.*\b(qty|quantity|units|pcs|pieces)\b/.test(norm(h)) && !/unconfirmed/.test(norm(h)));
    if (confirmed) { mapping[confirmed] = "quantity"; used.add("quantity"); }
  }
  // Pass 2: header contains a synonym (longest synonym wins).
  for (const header of headers) {
    if (mapping[header]) continue;
    if (skip.has(header) || party.has(header)) { mapping[header] = ""; continue; }
    const n = norm(header);
    let best: { key: keyof CanonicalLineItem; len: number } | null = null;
    for (const f of CANONICAL_FIELDS) {
      if (used.has(f.key) || refused(header, f.key)) continue;
      for (const s of f.synonyms) {
        if (s.length < 3) continue;
        if (!(n.includes(` ${s} `) || n.startsWith(`${s} `) || n.endsWith(` ${s}`) || n === s)) continue;
        // The word has to be most of the heading, not a word inside it. "unit of measure" is not
        // a unit cost and "type of wood" is not a product type, but both matched on one short
        // word and quietly set a field from a column that meant something else entirely.
        if (s.length / n.length < 0.4) continue;
        if (!best || s.length > best.len) best = { key: f.key, len: s.length };
      }
    }
    if (best) {
      mapping[header] = best.key;
      used.add(best.key);
    } else mapping[header] = "";
  }
  // Pass 3: the riding style, by what is written under it. Burton heads it "PH3" and Volkl
  // "category"; under both are the words that name a shelf — ALL MOUNTAIN, Freeride, Freestyle —
  // and that is what files a new model on the shop's riding-style shelves.
  if (!used.has("terrain") && rows.length > 0) {
    const styled = terrainColumn(
      headers.filter((h) => mapping[h] === "" || mapping[h] === "category"),
      (h) => rows.map((r) => (r[h] ?? "").toString()),
    );
    if (styled) {
      mapping[styled] = "terrain";
      used.add("terrain");
    }
  }
  /**
   * Pass 4: columns read by what is under them, for the fields a heading seldom names.
   *
   * An SAP export heads its brand column "Business Area Text", its season "Selling Season ITM", its
   * kind "PH2 Description" and its fit "Size Z Description"; a heading match reads none of them.
   * What is under each is unmistakable: a column of brand names is the brand, a column of 26WIN is
   * the season, a column of GOGGLES / HELMETS / BOOTS is the kind, and a column of Regular / Wide /
   * Low Bridge is the fit. Each is claimed by the first column whose cells say so.
   */
  if (rows.length > 0) {
    const open = () => headers.filter((h) => !mapping[h] && !skip.has(h) && !party.has(h));
    const claim = (key: keyof CanonicalLineItem, test: (v: string) => boolean, least: number) => {
      if (used.has(key)) return;
      for (const h of open()) {
        const { values, share: hits } = share(h, rows, test);
        if (values.length === 0 || hits < least) continue;
        mapping[h] = key;
        used.add(key);
        return;
      }
    };
    // A bare number is a line number or a count, never a season, however many of them look like years.
    claim("season", (v) => /^20\d{2}$/.test(seasonFrom(v)) && !/^\d{1,2}$/.test(v), 0.7);
    claim("brand", (v) => isBrand(v), 0.8);
    claim("gender", (v) => AUDIENCE.test(v), 0.8);
    claim("category", (v) => KIND_VALUE.test(v) && v.split(/\s+/).length <= 4 && !/^(hard|soft)goods$/i.test(v), 0.7);
    claim("productType", (v) => KIND_VALUE.test(v) && v.split(/\s+/).length <= 4 && !/^(hard|soft)goods$/i.test(v), 0.7);
    claim("width", (v) => FIT_VALUE.test(v), 0.8);
  }
  return mapping;
}

/**
 * A saved mapping, set against a fresh reading of the file.
 *
 * A template is saved when Save is ticked on the mapping screen — and it is ticked by default — and
 * from then on it was applied to every file with the same headings, without the screen being shown
 * again. So the first reading of Burton's W27 form, made before its columns could be read properly,
 * went on being used after they could: cost from TOTAL $, and the description list with "Model #"
 * as the name, which matched no line and gave no board a description. Fixing the reader changed
 * nothing, because the reader was no longer being asked.
 *
 * So the fresh reading wins, and the template keeps only what somebody actually CHOSE: a column
 * they changed from what was suggested to them. A template records the suggestion it was saved
 * against (`suggestedAtSave`); where the saved choice differs from it, that is a person's decision
 * and it stands, unless the data under the column rules it out. A template saved before that was
 * recorded has no decisions anyone can point to, and fills in only the columns the fresh reading
 * leaves blank.
 */
export function repairTemplate(saved: Mapping, fresh: Mapping, rows: Array<Record<string, string>>, suggestedAtSave?: Mapping): Mapping {
  const values = (header: string) => rows.map((r) => (r[header] ?? "").toString().trim()).filter(Boolean);
  const mostly = (header: string, test: (v: string) => boolean) => {
    const v = values(header);
    return v.length > 0 && v.filter(test).length / v.length >= 0.8;
  };
  // Bare numbers are never a product's name; a price or a count has to be a number.
  const disproved = (header: string, key: string): boolean => {
    if (key === "title") return mostly(header, (v) => /^\d+$/.test(v));
    if (["costPrice", "rrp", "quantity", "grams"].includes(key)) return mostly(header, (v) => parseMoney(v) === null);
    if (key === "barcode") return mostly(header, (v) => !/^'?\d{8,14}$/.test(v));
    return false;
  };
  const out: Mapping = { ...fresh };
  const deliberate = suggestedAtSave
    ? Object.entries(saved).filter(([header, key]) => (key ?? "") !== (suggestedAtSave[header] ?? "") && !(key && disproved(header, key)))
    : [];
  for (const [header, key] of deliberate) {
    // The field goes where the person put it, and nowhere else.
    if (key) for (const other of Object.keys(out)) if (other !== header && out[other] === key) out[other] = "";
    out[header] = key;
  }
  const chosen = new Set(deliberate.map(([header]) => header));
  const used = () => new Set(Object.values(out).filter(Boolean));
  for (const [header, key] of Object.entries(saved)) {
    if (!key || chosen.has(header) || out[header] || used().has(key) || disproved(header, key)) continue;
    out[header] = key;
  }
  return out;
}

/** Hints derived from the header a cost column was mapped from (e.g. "Amount" => line totals). */
export function suggestOptions(mapping: Mapping): MappingOptions {
  const costHeader = Object.entries(mapping).find(([, v]) => v === "costPrice")?.[0] ?? "";
  const quantityMapped = Object.values(mapping).includes("quantity");
  const looksLikeTotal = /\b(total|amount|ext|extended|value)\b/i.test(costHeader) && !/\bunit\b/i.test(costHeader);
  return looksLikeTotal && quantityMapped ? { costIsLineTotal: true } : {};
}

/**
 * A supplier's audience letter taken off the front of a name that a gender column already covers.
 *
 * Burton writes "M GORE GL", "W LIMELIGHT BOA", "K WARMEST MT", "MB DELUXE GORE GLV" (MB: men's
 * Burton), with MENS / WOMENS / KIDS in the column beside. The letter is not part of the model's
 * name — the shop's listing is "Men's Gondy GORE-TEX Leather Gloves" — and left on it, no listing
 * could ever be matched. Only taken off when the gender column agrees with it.
 */
const AUDIENCE_PREFIX: Array<[RegExp, RegExp]> = [
  [/^men'?s?$/i, /^(M|MB|MNS|MENS|MEN'S)\s+/i],
  [/^(women'?s?|ladies)$/i, /^(W|WB|WMS|WMNS|WOMENS|WOMEN'S|LADIES)\s+/i],
  [/^(kids?|youth|junior|jr)$/i, /^(K|KB|KD|KDS|KIDS|JR|YTH|YOUTH)\s+/i],
];
/** Who a shouted name says it is for by its prefix — "M CARTEL X" is men's — or "" when it does not say. */
export function audienceOfPrefix(title: string): string {
  const names = ["Mens", "Womens", "Kids"];
  const at = AUDIENCE_PREFIX.findIndex(([, prefix]) => prefix.test(title.trim()) && title.trim().replace(prefix, "").trim());
  return at >= 0 ? names[at] : "";
}

export function withoutAudiencePrefix(title: string, gender: string): string {
  const g = gender.trim();
  if (!g) return title;
  for (const [who, prefix] of AUDIENCE_PREFIX) {
    if (who.test(g) && prefix.test(title.trim()) && title.trim().replace(prefix, "").trim()) return title.trim().replace(prefix, "").trim();
  }
  return title;
}

/**
 * A fit that is not the default is part of the product, not an option on it.
 *
 * The shop lists "Men's Photon BOA® Wide Snowboard Boots" beside "Men's Photon BOA® Snowboard
 * Boots", and Oakley's "Line Miner (Low Bridge Fit)" beside the Line Miner: one product per fit,
 * with the fit in the name. Burton's order carries it as a column — Regular, Wide, Low Bridge,
 * Round Fit — and read as a Width option it had put a wide boot into the regular boot's listing,
 * and matched the wide boot's line to the regular boot's listing. A measured width ("98mm") is a
 * width and stays one.
 */
const FIT_WORD = /^(wide|extra wide|x-?wide|narrow|low bridge( fit)?|asian fit|round fit|oval fit|slim( fit)?|relaxed( fit)?|short|long|tall|petite|plus)$/i;
export function withFit(item: CanonicalLineItem): CanonicalLineItem {
  const fit = item.width.trim();
  if (!FIT_WORD.test(fit)) return item;
  const title = item.title.trim();
  const already = new RegExp(`\\b${fit.replace(/[^a-z0-9 ]/gi, "")}\\b`, "i").test(title);
  // In the supplier's own case, so that a shouted name is still one word-for-word shout and is
  // cased as one later: "RULER BOA WIDE", not "RULER BOA Wide".
  const spelt = /[a-z]/.test(title) ? fit : fit.toUpperCase();
  return { ...item, title: already ? title : `${title} ${spelt}`.trim(), width: "" };
}

/** How a file's columns differ from a layout remembered for the supplier. */
export interface LayoutDrift {
  templateName: string;
  /** Headings the file has that the remembered layout did not. */
  added: string[];
  /** Headings the remembered layout mapped to a field that the file no longer has. */
  missing: Array<{ header: string; field: string }>;
  /** How many headings the two have in common. */
  shared: number;
}

/**
 * The remembered layout nearest to a file whose headings match none exactly: the one sharing the
 * most headings, as long as it shares at least two. A supplier that adds a column, drops one or
 * renames one gets a different hash, and until now that silently threw the remembered mapping
 * away and read the file from scratch. Now the nearest layout is carried over where its columns
 * still exist, and the difference is said, so the person confirms the columns that moved and
 * nothing else.
 */
export function nearestTemplate<T extends { name: string; mappings: string }>(headers: string[], templates: T[]): { template: T; drift: LayoutDrift } | null {
  const mine = new Set(headers.map(norm));
  let best: { template: T; drift: LayoutDrift } | null = null;
  for (const t of templates) {
    const saved = parseMappingJson(t.mappings);
    const theirs = Object.keys(saved);
    const shared = theirs.filter((h) => mine.has(norm(h))).length;
    if (shared < 2) continue;
    if (best && shared <= best.drift.shared) continue;
    const theirNorms = new Set(theirs.map(norm));
    best = {
      template: t,
      drift: {
        templateName: t.name,
        added: headers.filter((h) => !theirNorms.has(norm(h))),
        missing: theirs.filter((h) => !mine.has(norm(h)) && saved[h]).map((h) => ({ header: h, field: saved[h] as string })),
        shared,
      },
    };
  }
  return best;
}

function parseMappingJson(json: string): Mapping {
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" ? (v as Mapping) : {};
  } catch {
    return {};
  }
}

/**
 * A remembered mapping cut down to the headings a file actually has, re-spelt the way the file
 * spells them. A saved choice for a column that is gone must not be carried over: applied, it
 * would take that field away from whichever column the fresh reading found it in.
 */
export function trimToHeaders(saved: Mapping | undefined, headers: string[]): Mapping | undefined {
  if (!saved) return undefined;
  const byNorm = new Map(headers.map((h) => [norm(h), h]));
  const out: Mapping = {};
  for (const [header, key] of Object.entries(saved)) {
    const actual = byNorm.get(norm(header));
    if (actual !== undefined) out[actual] = key;
  }
  return out;
}

export function headerHash(headers: string[]): string {
  return createHash("sha1").update(headers.map(norm).join("|")).digest("hex").slice(0, 16);
}

function splitList(value: string): string[] {
  return value
    .split(/[|;\n]+|,(?=\s*https?:\/\/)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function applyMapping(row: Record<string, string>, mapping: Mapping, options: MappingOptions = {}): CanonicalLineItem {
  const item = emptyLineItem();
  const numberKeys: Array<keyof CanonicalLineItem> = ["costPrice", "quantity", "rrp", "grams", "cancelled"];

  for (const [header, key] of Object.entries(mapping)) {
    if (!key) continue;
    const raw = (row[header] ?? "").toString().trim();
    if (raw === "") continue;
    if (key === "imageUrls") {
      item.imageUrls.push(...splitList(raw).filter((u) => /^https?:\/\//i.test(u)));
    } else if (numberKeys.includes(key)) {
      const n = key === "quantity" || key === "grams" ? parseIntSafe(raw) : parseMoney(raw);
      (item as unknown as Record<string, unknown>)[key] = n;
    } else {
      // "NA" in a size column and "NOC" under Collection say there is nothing, and were going out
      // as a size and a collection.
      if (NOT_A_VALUE.test(raw)) continue;
      const existing = item[key] as string;
      (item as unknown as Record<string, unknown>)[key] = existing ? `${existing} ${raw}` : raw;
      // A column read as the free option names it — "Volume", "Capacity", "Zip Side" — unless the
      // sheet says the name in a column of its own.
      if (key === "variant" && !item.variantName && !Object.values(mapping).includes("variantName")) item.variantName = header.trim().replace(/\s*\(.*\)$/, "");
    }
  }

  for (const [key, value] of Object.entries(options.fixed ?? {})) {
    if (!value) continue;
    const k = key as keyof CanonicalLineItem;
    if (k === "imageUrls") continue;
    const current = item[k];
    if (current === "" || current === null || current === undefined) (item as unknown as Record<string, unknown>)[k] = numberKeys.includes(k) ? parseMoney(value) : value;
  }

  if (options.costIsLineTotal && item.costPrice !== null && item.quantity && item.quantity > 0) {
    item.costPrice = Math.round((item.costPrice / item.quantity) * 10000) / 10000;
  }
  /**
   * A blank quantity is "not ordered", when the sheet has a quantity column at all.
   *
   * This defaulted every blank to 1, and an order form is mostly blanks: Burton's W27 form is the
   * whole range, 125 rows, with a number in ORDER QTY against the 12 boards that were bought. Every
   * one of the 125 came out ordered, in quantity one. A sheet with no quantity column still gets 1
   * per line — an invoice that lists what was sent and never says how many means one of each.
   */
  if (item.quantity === null && !Object.values(mapping).includes("quantity")) item.quantity = 1;
  // What arrives is the quantity less what the supplier has since cancelled. See `cancelled`.
  if (item.quantity !== null && (item.cancelled ?? 0) > 0) item.quantity = Math.max(0, item.quantity - (item.cancelled ?? 0));
  item.imageUrls = Array.from(new Set(item.imageUrls));
  item.season = seasonFrom(item.season);
  item.colour = colourName(item.colour);
  item.title = expandShorthand(withoutAudiencePrefix(item.title, item.gender));
  // "Regular" is the absence of a fit, and would otherwise become a Width option on every variant.
  if (DEFAULT_FIT.test(item.width.trim())) item.width = "";
  Object.assign(item, withFit(item));

  /**
   * Keep the columns nothing canonical claimed.
   *
   * A supplier's spec export is mostly these, and dropping them was why a Volkl build came out
   * with no specs on it: tip width, tail width, sidecut radii, core, key technologies. Only short
   * values, because a column of prose is a description and belongs in the body, and only where
   * there is something in the cell.
   */
  const extras: Record<string, string> = {};
  for (const [header, key] of Object.entries(mapping)) {
    if (key) continue;
    const raw = (row[header] ?? "").toString().trim();
    // A feature bullet is a sentence by nature and is kept whole. Burton's description list puts
    // its tech specs in "Bullet 1" to "Bullet 8", and the 120-character limit meant for prose was
    // throwing away every one of them — which is most of what the shop's listings say.
    if (!raw || (raw.length > 120 && !FEATURE_COLUMN.test(header.trim()))) continue;
    extras[header.trim()] = raw;
  }
  if (Object.keys(extras).length > 0) item.extras = extras;
  return item;
}

/** Columns the mapping must cover before it can be applied. */
/**
 * What stops a layout being used at all.
 *
 * Only the product name. A cost price used to be required too, which was wrong for this shop: the
 * price they sell at is the supplier's recommended retail, and plenty of suppliers quote only that.
 * Demanding a wholesale column meant those invoices could not be mapped automatically and the
 * operator was sent to a mapping screen to pick a column that was not on the document.
 *
 * Without a cost there is no margin to calculate, which the review grid says as a warning.
 */
export function mappingProblems(mapping: Mapping): string[] {
  const targets = new Set(Object.values(mapping).filter(Boolean));
  const problems: string[] = [];
  if (!targets.has("title")) problems.push("Map a column to Product name.");
  return problems;
}


/**
 * Whether a table is a delivery or something to look things up in.
 *
 * Nothing classified a spreadsheet before this. The document type came only from the model, which
 * reads PDFs and photographs, so every workbook fell through to "invoice" — and a Volkl spec
 * export and a Marker barcode list therefore built 1,608 products between them, burying the nine
 * that were actually ordered and matching none of them to anything.
 *
 * The test is what the columns are for, not what the file is called. An order says what was
 * bought and what it costs; a reference sheet says what things ARE. So a table with no price, no
 * recommended retail and no quantity anywhere in it cannot be a delivery — there is nothing on it
 * to buy — and it is there to be searched rather than imported.
 *
 * Their three files split on this exactly: the order form carries RRP and QTY, the PIM export and
 * the barcode list carry neither and both carry a barcode.
 */
export function looksLikeReference(headers: string[]): boolean {
  if (headers.length === 0) return false;
  const fields = new Set(Object.values(suggestMapping(headers)).filter(Boolean));
  const sellable = fields.has("costPrice") || fields.has("rrp") || fields.has("quantity");
  if (sellable) return false;
  // And it has to identify what it is describing, or it is not a reference for anything.
  return fields.has("barcode") || fields.has("modelCode") || fields.has("sku");
}
