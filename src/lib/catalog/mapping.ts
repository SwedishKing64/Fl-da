// Supplier column mapping: suggest a mapping from source headers to canonical fields,
// fingerprint header rows so a saved template is auto-detected next time, and apply a
// mapping to raw rows to produce CanonicalLineItems.

import { createHash } from "node:crypto";
import { CANONICAL_FIELDS, emptyLineItem, type CanonicalLineItem } from "./types";
import { parseIntSafe, parseMoney } from "./money";

export type Mapping = Record<string, keyof CanonicalLineItem | "">;

export interface MappingOptions {
  /** Values applied to every row when the file doesn't carry them (brand, category, season...). */
  fixed?: Partial<Record<keyof CanonicalLineItem, string>>;
  /** Multiply cost by this if the supplier prints line totals instead of unit prices. */
  costIsLineTotal?: boolean;
}

function norm(h: string): string {
  return h.toLowerCase().replace(/[_\-./()]/g, " ").replace(/\s+/g, " ").trim();
}

/** Best-effort mapping suggestion from header names via the synonym lists in CANONICAL_FIELDS. */
export function suggestMapping(headers: string[]): Mapping {
  const mapping: Mapping = {};
  const used = new Set<string>();
  const canonicalKeys = new Set(CANONICAL_FIELDS.map((f) => f.key as string));

  // Pass 1: exact canonical key or exact synonym matches.
  for (const header of headers) {
    const n = norm(header);
    if (canonicalKeys.has(header) && !used.has(header)) {
      mapping[header] = header as keyof CanonicalLineItem;
      used.add(header);
      continue;
    }
    const exact = CANONICAL_FIELDS.find((f) => !used.has(f.key) && f.synonyms.includes(n));
    if (exact) {
      mapping[header] = exact.key;
      used.add(exact.key);
    }
  }
  // Pass 2: header contains a synonym (longest synonym wins).
  for (const header of headers) {
    if (mapping[header]) continue;
    const n = norm(header);
    let best: { key: keyof CanonicalLineItem; len: number } | null = null;
    for (const f of CANONICAL_FIELDS) {
      if (used.has(f.key)) continue;
      for (const s of f.synonyms) {
        if (s.length >= 3 && (n.includes(` ${s} `) || n.startsWith(`${s} `) || n.endsWith(` ${s}`) || n === s)) {
          if (!best || s.length > best.len) best = { key: f.key, len: s.length };
        }
      }
    }
    if (best) {
      mapping[header] = best.key;
      used.add(best.key);
    } else mapping[header] = "";
  }
  return mapping;
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
  if (item.quantity === null) item.quantity = 1;
  item.imageUrls = Array.from(new Set(item.imageUrls));
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
