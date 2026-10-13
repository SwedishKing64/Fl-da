/**
 * Merging a supplier's spec sheet into the products an order builds.
 *
 * Its own module, and pure, because two different callers need it: the import batch on the server,
 * and a delivery being matched against an export in the browser. Nothing here touches the database
 * — it takes the products, takes the spec rows, and returns the products with what the sheet added.
 */

import { houseBody, isPlaceholderBody } from "./body";
import { disciplinesFromTerrain, isDisciplineTag } from "./shop-memory";
import { FEATURE_COLUMN, type CanonicalLineItem } from "./types";

export const normKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * The Tech Specs lines for a product, from the columns a supplier's spec sheet carries.
 *
 * Written `LABEL: value` in capitals, which is how the shop's own products read — "SIZE:  158,
 * 165, 172", "MATERIAL:  70% Mohair / 30% Nylon". Until now these columns reached the metafields
 * and stopped there, so nothing a supplier stated about a ski ever appeared where a customer
 * reads it.
 */
/**
 * The supplier's own feature bullets, in the order the sheet numbers them, or none.
 *
 * Where a sheet has them they ARE the tech specs, written by the brand: the shop's Custom X 2027
 * listing is Burton's Bullet 1 to 7 word for word under its Tech Specs heading. A "KEY: value" line
 * built from the other columns would say the same thing worse, so bullets replace them rather than
 * joining them.
 */
function featureBullets(spec: CanonicalLineItem): string[] {
  return Object.entries(spec.extras ?? {})
    .filter(([k, v]) => FEATURE_COLUMN.test(k) && v.trim())
    .sort(([a], [b]) => Number(/\d+/.exec(a)?.[0] ?? 0) - Number(/\d+/.exec(b)?.[0] ?? 0))
    .map(([, v]) => v.trim());
}

function specLines(spec: CanonicalLineItem): string[] {
  const bullets = featureBullets(spec);
  if (bullets.length > 0) return bullets;
  const fields: Array<[string, string]> = [
    ["LENGTH", spec.length],
    ["WAIST WIDTH", spec.width],
    ["FLEX", spec.flex],
    ["DIN RANGE", spec.dinRange],
    ["ABILITY", spec.abilityLevel],
    ["TERRAIN", spec.terrain],
    ["GENDER", spec.gender],
  ];
  // Then the supplier's own columns, in the order the sheet prints them. Volkl's spec export
  // carries the tip and tail widths, three sidecut radii, the core and the key technologies —
  // the things a customer actually asks about — and none of them fits a canonical field.
  const extra = Object.entries(spec.extras ?? {})
    .filter(([, v]) => v && v.trim() && v.trim().length <= 120)
    .map(([k, v]) => [k.toUpperCase().replace(/\s+/g, " ").trim(), v.trim()] as [string, string]);
  const seen = new Set(fields.map(([k]) => k));
  return [...fields, ...extra.filter(([k]) => !seen.has(k))]
    .filter(([, v]) => v && v.trim())
    .map(([k, v]) => `${k}: ${v.trim()}`);
}

/**
 * Which columns of a spec sheet are worth showing, and which are the supplier's paperwork.
 *
 * Customs codes, FEDAS numbers, carton counts and "changes vs. previous season" are real columns
 * on a real export and mean nothing to anyone buying a ski. They are kept off the page rather
 * than dropped from the data, so a metafield that turns out to matter can still be found.
 */
const PAPERWORK = /customs|hts|fedas|ctn|carton|country of origin|changes vs|inline\/smu|unit of measure|rental|\bseo\b|short description|highlight|behind the graphic|fine print|warranty|season indicator/i;

const forCustomers = (extras: Record<string, string> | undefined): Record<string, string> =>
  Object.fromEntries(Object.entries(extras ?? {}).filter(([k]) => !PAPERWORK.test(k)));

/** Merge spec-sheet rows into matching products: descriptions, specs, tags, images, RRP. */
export function enrichFromSpecs<T extends { title: string; brand: string; description: string; tags: string[]; imageUrls: string[]; metafields: Record<string, string>; variants: Array<{ item: CanonicalLineItem }> }>(products: T[], specs: CanonicalLineItem[]): T[] {
  if (specs.length === 0) return products;

  /**
   * Barcodes, per variant rather than per product.
   *
   * A barcode belongs to one length of one ski, so it cannot be merged the way a description is.
   * Their three Volkl files join exactly here: the order form writes the item code per length —
   * "V2610112.000.170" — which is the same spelling the spec export uses in its "SKU no. //
   * LENGTH" column and what the barcode sheet keys on. Matched on the SKU first and then on the
   * model code plus the length, because a supplier does not always write the compound one.
   */
  const bySku = new Map<string, CanonicalLineItem>();
  const byCodeLength = new Map<string, CanonicalLineItem>();
  const byCode = new Map<string, CanonicalLineItem>();
  for (const spec of specs) {
    // A barcode list keys its rows by the compound code ("V2610155.000.182") in its article column
    // and has no SKU column at all, so that code is a SKU here too.
    for (const key of [spec.sku, spec.modelCode]) {
      const sku = normKey(key);
      if (sku && spec.barcode.trim() && !bySku.has(sku)) bySku.set(sku, spec);
    }
    const code = normKey(spec.modelCode);
    const length = spec.length.replace(/[^\d.]/g, "");
    if (code && length && spec.barcode.trim()) byCodeLength.set(`${code} ${length}`, spec);
    // A binding or an accessory has no length, and its barcode sheet is keyed on the code alone.
    if (code && !length && spec.barcode.trim() && !byCode.has(code)) byCode.set(code, spec);
  }
  for (const product of products) {
    for (const v of product.variants) {
      if (v.item.barcode.trim()) continue;
      const length = (v.item.length || v.item.size).replace(/[^\d.]/g, "");
      const code = normKey(v.item.modelCode) || normKey(v.item.sku);
      const hit = bySku.get(normKey(v.item.sku))
        ?? (length ? byCodeLength.get(`${code} ${length}`) : undefined)
        ?? (length ? undefined : byCode.get(code));
      if (hit) v.item.barcode = hit.barcode.trim();
    }
  }

  /**
   * Products whose body this pass has already written.
   *
   * A spec export has a row per LENGTH — five for the M7 Mantra — and every one of them matches
   * the same product. Letting each rewrite the body left the last row's numbers on it, so a ski
   * ordered in 170 and 177 described itself as a 191.
   */
  const written = new Set<T>();
  /** Of those, the ones whose body carries the sheet's prose: a list of numbers gives way to words. */
  const prosed = new Set<T>();

  for (const spec of specs) {
    const code = normKey(spec.modelCode);
    const title = normKey(spec.title);
    const brand = normKey(spec.brand);
    /**
     * Which product a spec row belongs to, exactly before loosely.
     *
     * The loose match is how "MANTRA 88" came to describe the MANTRA 88 W: one title contains the
     * other, and the women's ski took the men's waist width, ability and gender. So a code match
     * wins, then a title that is the same name, and only then one that merely contains it — and a
     * loose match that fits more than one product is dropped rather than given to the first, the
     * same rule the invoice matcher follows for the same reason.
     */
    const sameBrand = (p: T) => !(brand && normKey(p.brand) && normKey(p.brand) !== brand);
    const byCodeHit = code ? products.find((p) => sameBrand(p) && p.variants.some((v) => {
      const vc = normKey(v.item.modelCode);
      return vc === code || vc.startsWith(`${code} `);
    })) : undefined;
    const exact = title ? products.filter((p) => sameBrand(p) && normKey(p.title) === title) : [];
    const loose = title ? products.filter((p) => {
      if (!sameBrand(p)) return false;
      const pt = normKey(p.title);
      return pt.includes(title) || title.includes(pt.replace(brand, "").trim());
    }) : [];
    // A spec row that carries a model code is matched on that code and nothing else. The supplier
    // gave a precise key, so a code that fits no product means this row is about a different
    // article — "MANTRA 88" is not the "MANTRA 88 W", however much the names overlap, and reading
    // one onto the other put a men's waist width and gender on a women's ski.
    const target = code ? byCodeHit : (exact.length === 1 ? exact[0] : loose.length === 1 ? loose[0] : undefined);
    if (!target) continue;
    // The invoice writes its own line into the description so the column is not blank, so the
    // test cannot be "is it empty" — it never is, and every description on a spec sheet was being
    // dropped on the floor. Same fault, and the same test, as the web lookup.
    // Only when the sheet actually carries prose. A body built from spec lines alone would have
    // no description in it and would still read as "already written" to the web lookup — because
    // it carries a list — so the product could never be filled in later. Specs with no prose go
    // to the metafields below and wait.
    /**
     * The lengths in the body are the product's own, not the spec row's.
     *
     * A spec sheet describes a model, one row per length; the product being built carries the
     * lengths that were actually ordered. Their own listings write it as the shop does — "SIZE:
     * 158, 165, 172" — so the list is the variants, in the order they were bought.
     */
    const lengths = [...new Set(target.variants.map((v) => (v.item.length || v.item.size).trim()).filter(Boolean))];
    const lines = specLines({
      ...spec,
      length: lengths.length > 0 ? lengths.join(", ") : spec.length,
      extras: forCustomers(spec.extras),
    });
    // The specs go on now even where the sheet carries no prose, because a supplier's export
    // almost never does and the numbers are most of what a customer wants. A body that is only a
    // Tech Specs list still reads as unwritten to the web lookup, so the prose can arrive later
    // without either one having to wait for the other. See isPlaceholderBody.
    // A row with prose takes over a body that only a bare row's numbers wrote: Burton's order
    // form, loaded first, says "SIZE: M" of a binding that its description list then describes.
    const prose = spec.description.trim() !== "";
    const unwritten = isPlaceholderBody(target.description) && !written.has(target);
    const numbersOnly = written.has(target) && !prosed.has(target);
    if ((prose || lines.length > 0) && (unwritten || (prose && numbersOnly))) {
      target.description = houseBody(spec.description, lines);
      written.add(target);
      if (prose) prosed.add(target);
    }
    for (const t of spec.tags.split(",").map((x) => x.trim()).filter(Boolean)) if (!target.tags.includes(t)) target.tags.push(t);
    for (const u of spec.imageUrls) if (!target.imageUrls.includes(u)) target.imageUrls.push(u);
    const fill: Array<[string, string]> = [["flex", spec.flex], ["ability_level", spec.abilityLevel], ["din_range", spec.dinRange], ["terrain", spec.terrain], ["waist_width", spec.width], ["gender", spec.gender], ["season", spec.season]];
    for (const [k, v] of fill) if (v && !target.metafields[k]) target.metafields[k] = v;
    // The supplier's riding style, for a model with no shelf yet — the shop's own memory of the
    // model, applied when it was grouped, always comes first. See shop-memory.
    if (spec.terrain && !target.tags.some(isDisciplineTag)) {
      for (const t of disciplinesFromTerrain((target as { productType?: string }).productType ?? "", spec.terrain)) if (!target.tags.includes(t)) target.tags.push(t);
    }
    for (const [k, v] of Object.entries(forCustomers(spec.extras))) {
      const key = normKey(k).replace(/ /g, "_");
      if (key && !target.metafields[key]) target.metafields[key] = v;
    }
    for (const v of target.variants) {
      if (spec.rrp && !v.item.rrp) v.item.rrp = spec.rrp;
      if (spec.flex && !v.item.flex) v.item.flex = spec.flex;
      if (spec.description && isPlaceholderBody(v.item.description)) v.item.description = spec.description;
    }
  }
  return products;
}
