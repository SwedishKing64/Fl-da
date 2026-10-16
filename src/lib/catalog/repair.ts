/**
 * Make a batch exportable, rather than refusing to export it.
 *
 * Five things used to stop a CSV being built: no title, a bad handle, a handle used twice, a SKU
 * used twice, and a missing or repeated set of option values. Every one of them is real — Shopify
 * rejects the import otherwise — and not one of them is something the operator can usefully be
 * asked about, because every one has an obvious correct answer.
 *
 * The duplicate SKU is the clearest case. A Boardriders invoice codes a colourway, not a size:
 * 38SA073514-BLK is the black Leader Jacket in every size ordered. Six sizes therefore arrive
 * carrying one code, the batch is "invalid", and the operator is told to go and fix six rows by
 * hand — when the answer is the one any retailer would write: 38SA073514-BLK-L.
 *
 * So this repairs, and says what it repaired. Nothing here guesses at anything a person would
 * disagree with, and everything it does is visible in the grid afterwards.
 */

import { isValidHandle, slugify } from "./handle";
import { isPublicHttpsUrl, type CsvProduct, type CsvVariant } from "./csv";

export interface Repair {
  handle: string;
  what: string;
}

const clean = (value: string | null | undefined): string => (value ?? "").trim();

/** A slug fragment for a SKU suffix: "XXL" -> "xxl", "Storm Melange" -> "storm-melange". */
function suffix(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function optionValues(v: CsvVariant): string[] {
  return [v.option1Value, v.option2Value, v.option3Value].map(clean);
}

function comboKey(v: CsvVariant): string {
  return optionValues(v).join("|").toLowerCase();
}

/**
 * Give a product its options back.
 *
 * An option position the product names but no variant fills is dropped — a "Size" column where
 * nothing was read is worse than no column. A position some variants fill and others do not gets
 * "One Size" in the gaps, which is what the shop's own catalogue uses and what Shopify expects.
 */
function repairOptions(p: CsvProduct, note: (what: string) => void): void {
  const names = [clean(p.option1Name), clean(p.option2Name), clean(p.option3Name)];
  const keep: Array<{ name: string; values: string[] }> = [];

  for (let i = 0; i < 3; i++) {
    if (!names[i]) continue;
    const values = p.variants.map((v) => optionValues(v)[i]);
    if (values.every((value) => !value)) {
      note(`"${names[i]}" was named as an option but no variant had a value, so the column was dropped`);
      continue;
    }
    if (values.some((value) => !value)) note(`${values.filter((value) => !value).length} variant(s) had no ${names[i]} — filled with "One Size"`);
    keep.push({ name: names[i], values: values.map((value) => value || "One Size") });
  }

  // A product with no options at all is Shopify's "Title / Default Title".
  if (keep.length === 0) {
    keep.push({ name: "Title", values: p.variants.map(() => "Default Title") });
    if (p.variants.length > 1) note(`no options could be read, so its ${p.variants.length} rows were left under one "Default Title" variant`);
  }

  p.option1Name = keep[0]?.name ?? null;
  p.option2Name = keep[1]?.name ?? null;
  p.option3Name = keep[2]?.name ?? null;
  p.variants.forEach((v, row) => {
    v.option1Value = keep[0] ? keep[0].values[row] : null;
    v.option2Value = keep[1] ? keep[1].values[row] : null;
    v.option3Value = keep[2] ? keep[2].values[row] : null;
  });
}

/** Two rows describing the same variant are one variant, and their quantities add up. */
function mergeDuplicateVariants(p: CsvProduct, note: (what: string) => void): void {
  const byCombo = new Map<string, CsvVariant>();
  const merged: CsvVariant[] = [];
  let dropped = 0;
  for (const v of p.variants) {
    const key = comboKey(v);
    const seen = byCombo.get(key);
    if (!seen) {
      byCombo.set(key, v);
      merged.push(v);
      continue;
    }
    seen.quantity = (seen.quantity ?? 0) + (v.quantity ?? 0);
    // Anything the first row left blank, the second may still know.
    if (!clean(seen.sku) && clean(v.sku)) seen.sku = v.sku;
    if (!(seen.price > 0) && v.price > 0) seen.price = v.price;
    if (!seen.imageUrl && v.imageUrl) seen.imageUrl = v.imageUrl;
    dropped++;
  }
  if (dropped > 0) {
    note(`${dropped} repeated row(s) merged into the variant they duplicated, quantities added up`);
    p.variants = merged;
  }
}

/**
 * Repair a batch into something Shopify will accept.
 *
 * Returns the same products, changed in place-safe copies, and a plain list of what was done.
 */
export function repairForExport(products: CsvProduct[]): { products: CsvProduct[]; repairs: Repair[] } {
  const repairs: Repair[] = [];
  const out = products.map((p) => ({ ...p, variants: p.variants.map((v) => ({ ...v })) }));

  // --- titles -------------------------------------------------------------
  for (const p of out) {
    if (clean(p.title)) continue;
    const fallback = clean(p.variants.find((v) => clean(v.sku))?.sku) || clean(p.handle).replace(/-/g, " ");
    const title = fallback ? fallback.replace(/\b\w/g, (c) => c.toUpperCase()) : "Untitled product";
    repairs.push({ handle: p.handle, what: `had no title — named "${title}" from what was on the row` });
    p.title = title;
  }

  // --- handles ------------------------------------------------------------
  const usedHandles = new Set<string>();
  for (const p of out) {
    let handle = clean(p.handle);
    if (!handle || !isValidHandle(handle)) {
      const rebuilt = slugify(p.title) || "product";
      repairs.push({ handle: handle || "(none)", what: `had an unusable handle — rewritten as "${rebuilt}"` });
      handle = rebuilt;
    }
    if (usedHandles.has(handle)) {
      const base = handle;
      let n = 2;
      while (usedHandles.has(`${base}-${n}`)) n++;
      handle = `${base}-${n}`;
      repairs.push({ handle: base, what: `shared a handle with another product — this one became "${handle}"` });
    }
    usedHandles.add(handle);
    p.handle = handle;
  }

  // --- options, then repeated rows ----------------------------------------
  for (const p of out) {
    repairOptions(p, (what) => repairs.push({ handle: p.handle, what }));
    mergeDuplicateVariants(p, (what) => repairs.push({ handle: p.handle, what }));
  }

  // --- SKUs ---------------------------------------------------------------
  //
  // Across the whole batch, because Shopify's uniqueness is store-wide. A colourway code shared by
  // every size ordered is the normal case, not a mistake, so the size is appended rather than a
  // number: 38SA073514-BLK in L and XL becomes 38SA073514-BLK-l and 38SA073514-BLK-xl.
  const usedSkus = new Set<string>();
  for (const p of out) {
    for (const v of p.variants) {
      const sku = clean(v.sku);
      if (!sku) continue; // an empty SKU is a warning, not a clash — Shopify allows it
      if (!usedSkus.has(sku.toLowerCase())) {
        usedSkus.add(sku.toLowerCase());
        v.sku = sku;
        continue;
      }
      const parts = optionValues(v).map(suffix).filter(Boolean);
      let candidate = parts.length ? `${sku}-${parts.join("-")}` : sku;
      if (usedSkus.has(candidate.toLowerCase())) {
        const base = candidate;
        let n = 2;
        while (usedSkus.has(`${base}-${n}`.toLowerCase())) n++;
        candidate = `${base}-${n}`;
      }
      repairs.push({ handle: p.handle, what: `"${sku}" was on more than one variant — this one became "${candidate}"` });
      usedSkus.add(candidate.toLowerCase());
      v.sku = candidate;
    }
  }

  // --- pictures -----------------------------------------------------------
  //
  // Shopify fetches each picture from the address in the file, so one it cannot reach — a copy's
  // own 127.0.0.1, a path with no host — is no picture at all. It is left off and said, rather
  // than left in to fail the import; the listing goes up and the picture is added in Shopify.
  for (const p of out) {
    const kept = p.images.filter((img) => isPublicHttpsUrl(img.url));
    if (kept.length < p.images.length) {
      const gone = p.images.filter((img) => !isPublicHttpsUrl(img.url)).map((img) => img.url);
      repairs.push({ handle: p.handle, what: `${gone.length === 1 ? "a picture was" : `${gone.length} pictures were`} at an address Shopify cannot fetch (${gone[0]}${gone.length > 1 ? ", …" : ""}) — left off; add ${gone.length === 1 ? "it" : "them"} in Shopify` });
      p.images = kept.map((img, i) => ({ ...img, position: i + 1 }));
    }
    for (const v of p.variants) {
      if (v.imageUrl && !isPublicHttpsUrl(v.imageUrl)) {
        repairs.push({ handle: p.handle, what: `${v.sku || "a variant"}'s picture was at an address Shopify cannot fetch — left off` });
        v.imageUrl = null;
      }
    }
  }

  return { products: out, repairs };
}
