// Supplier column mapping: suggest a mapping from source headers to canonical fields,
// fingerprint header rows so a saved template is auto-detected next time, and apply a
// mapping to raw rows to produce CanonicalLineItems.

import { createHash } from "node:crypto";
import { CANONICAL_FIELDS, FEATURE_COLUMN, emptyLineItem, type CanonicalLineItem } from "./types";
export { FEATURE_COLUMN };
import { parseIntSafe, parseMoney } from "./money";
import { seasonFrom } from "./season";
import { terrainColumn } from "./shop-memory";

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
const NEEDS_CODE_VALUES = /^(material|material number|material no)$/;

/** Best-effort mapping suggestion from header names via the synonym lists in CANONICAL_FIELDS. */
export function suggestMapping(headers: string[], rows: Array<Record<string, string>> = []): Mapping {
  const mapping: Mapping = {};
  const used = new Set<string>();
  // Checked before anything claims a field, so a twin can never take the AUD column's place.
  const skip = new Set(headers.filter((h) => isOtherCurrencyTwin(h, headers)));
  const refused = (header: string, key: string): boolean =>
    key === "modelCode" && NEEDS_CODE_VALUES.test(norm(header)) && !valuesLookLikeCodes(header, rows);
  const canonicalKeys = new Set(CANONICAL_FIELDS.map((f) => f.key as string));

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
    if (skip.has(header)) continue;
    const exact = CANONICAL_FIELDS.find((f) => !used.has(f.key) && f.synonyms.includes(n) && !refused(header, f.key));
    if (exact) {
      mapping[header] = exact.key;
      used.add(exact.key);
    }
  }
  // Pass 2: header contains a synonym (longest synonym wins).
  for (const header of headers) {
    if (mapping[header]) continue;
    if (skip.has(header)) { mapping[header] = ""; continue; }
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
  const numberKeys: Array<keyof CanonicalLineItem> = ["costPrice", "quantity", "rrp", "grams"];

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
      const existing = item[key] as string;
      (item as unknown as Record<string, unknown>)[key] = existing ? `${existing} ${raw}` : raw;
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
  item.imageUrls = Array.from(new Set(item.imageUrls));
  item.season = seasonFrom(item.season);

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
