// Group canonical line items into products with variants.

import { buildHandle } from "./handle";
import { chooseOptions, collectionsFor, detectCategory, enrichFromTitle, metafieldsFor, OPTION_LABELS, snowboardType, tagsFor, type CategoryRuleLike } from "./categorize";
import { resolveType } from "./taxonomy";
import { withFit } from "./mapping";
import { normaliseOptionName, optionNamesFor } from "./options";
import { catalogTags } from "./product-tags";
import { asShopWritesIt, productTitle, seasonTagFrom, withoutVendor } from "./titles";
import type { CanonicalLineItem } from "./types";
import { disciplinesFromTerrain, rememberedDisciplines, rememberedType, type Listing } from "./shop-memory";

export interface GroupedVariant {
  item: CanonicalLineItem;
  sourceIndex: number; // index into the input array
  option1Value: string | null;
  option2Value: string | null;
  option3Value: string | null;
}

export interface GroupedProduct {
  key: string;
  handle: string;
  title: string;
  brand: string;
  category: string;
  productType: string;
  tags: string[];
  collections: string[];
  description: string;
  metafields: Record<string, string>;
  option1Name: string | null;
  option2Name: string | null;
  option3Name: string | null;
  imageUrls: string[];
  variants: GroupedVariant[];
}

function normTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Who a line is for, as one of the shop's three shelves, or nothing when the line does not say. */
function audience(gender: string): string {
  const g = gender.trim().toLowerCase();
  if (/^(men|mens|men's|male|m)$/.test(g)) return "mens";
  if (/^(women|womens|women's|ladies|female|w)$/.test(g)) return "womens";
  if (/^(kids|kid|kids'|youth|junior|jr|boys|girls|children)$/.test(g)) return "kids";
  return "";
}

function titleCase(s: string): string {
  return s.replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

/**
 * Suppliers use "model/style code" two ways: shared across sizes (a true model code) or unique
 * per size (really a SKU). Detect the second case per title group and move the code into `sku`.
 */
function normaliseCodes(items: CanonicalLineItem[]): CanonicalLineItem[] {
  const byTitle = new Map<string, CanonicalLineItem[]>();
  for (const item of items) {
    const key = `${item.brand.trim().toLowerCase()}|${normTitle(item.title)}`;
    byTitle.set(key, [...(byTitle.get(key) ?? []), item]);
  }
  for (const group of byTitle.values()) {
    const codes = group.map((i) => i.modelCode.trim()).filter(Boolean);
    if (group.length < 2 || codes.length !== group.length) continue;

    // A code repeating is not evidence it is a real model code. On a size-grid invoice every
    // colourway repeats once per size ordered — 38SA073514-BLK in L and in XL — and requiring all
    // codes to be distinct made this bail on exactly the invoices it exists for, splitting one
    // jacket into one product per colour. What matters is whether the codes differ at all: if
    // they are all identical it is already a model code and there is nothing to strip.
    const distinct = new Set(codes.map((c) => c.toLowerCase()));
    if (distinct.size < 2) continue;

    const prefix = commonPrefix(codes).replace(/[-_/.\s]+$/, "");
    for (const item of group) {
      if (!item.sku) item.sku = item.modelCode.trim();
      item.modelCode = prefix.length >= 4 ? prefix : "";
    }
  }
  return items;
}

function commonPrefix(values: string[]): string {
  let prefix = values[0] ?? "";
  for (const v of values.slice(1)) {
    while (prefix && !v.toLowerCase().startsWith(prefix.toLowerCase())) prefix = prefix.slice(0, -1);
  }
  return prefix;
}

export function groupLineItems(rawItems: CanonicalLineItem[], rules: CategoryRuleLike[], opts: { builtBy?: string; listings?: Listing[] } = {}): GroupedProduct[] {
  const groups = new Map<string, { rule: CategoryRuleLike | null; entries: Array<{ item: CanonicalLineItem; index: number }> }>();

  const enriched = rawItems.map((raw) => {
    // Nothing on the order says what it is: the shop's own filing of the model does. See shop-memory.
    const remembered = rememberedType({ title: raw.title, brand: raw.brand }, opts.listings ?? []);
    const rule = detectCategory(raw, rules)
      ?? (remembered ? rules.find((r) => r.active && (r.productType === remembered || r.category === remembered.toLowerCase())) ?? null : null);
    return { rule, item: withFit(enrichFromTitle(raw, rule?.category ?? "other")) };
  });
  normaliseCodes(enriched.map((e) => e.item));

  enriched.forEach(({ rule, item }, index) => {
    const brand = item.brand.trim();
    const keyBase = item.modelCode.trim() ? `model:${item.modelCode.trim().toLowerCase()}` : `title:${normTitle(item.title)}`;
    // Who it is for is part of what it is: Burton's men's and women's Step On bindings share a name
    // and a code prefix, and the shop lists them as two products. See audience.
    const key = `${brand.toLowerCase()}|${keyBase}${audience(item.gender) ? `|${audience(item.gender)}` : ""}`;
    const group = groups.get(key) ?? { rule, entries: [] };
    group.entries.push({ item, index });
    groups.set(key, group);
  });

  const products: GroupedProduct[] = [];
  for (const [key, group] of groups) {
    const entries = group.entries;
    const first = entries[0].item;
    const brand = entries.map((e) => e.item.brand.trim()).find(Boolean) ?? "";
    const baseTitle = entries.map((e) => e.item.title.trim()).find(Boolean) ?? first.modelCode ?? "Untitled";
    // The Title column does not carry the brand — not one of the shop's 827 products begins with
    // its own vendor. The brand belongs in the Vendor column and in the SEO title.
    // Without the punctuation a size left behind when it was lifted out: "GRIFFON 13 MN; 100MM".
    const title = withoutVendor(brand, baseTitle).replace(/[\s;,:–-]+$/, "");
    const items = entries.map((e) => e.item);
    // Men's and women's of one model, under one shorthand name on the order, are two products that
    // would otherwise share a title and so a handle. The shop's own way of telling them apart is on
    // the front of the name: "Men's GORE-TEX Gloves", "Women's GORE-TEX Gloves", "Kids Gore-Tex Gloves".
    const shared = [...groups.entries()].filter(([k, g]) => k !== key && (g.entries.map((e) => e.item.brand.trim()).find(Boolean) ?? "") === brand && normTitle(withoutVendor(brand, g.entries.map((e) => e.item.title.trim()).find(Boolean) ?? "")) === normTitle(title));
    const who = audience(first.gender);
    const titled = shared.length > 0 && who && !/^(men'?s|women'?s|kids|youth|junior)\b/i.test(title)
      ? `${{ mens: "Men's", womens: "Women's", kids: "Kids" }[who]} ${asShopWritesIt(title)}`
      : title;
    // A snowboard brand's boots are snowboard boots, whatever the boots rule says. See snowboardType.
    const snowboard = snowboardType(group.rule, items);
    // A supplier's own kind word is a Type only when it is one the shop uses: "FREERIDE" is not.
    const productType = snowboard ?? group.rule?.productType ?? resolveType(first.productType) ?? "";
    // What varies decides which options exist; the shop's own habit decides the order they are
    // read in. A jacket is colour then size on forty-one of forty-three products, a ski is length
    // first, and a sleeping bag is size, loft, then which side the zip is on.
    const optionKeys = orderByConvention(productType, chooseOptions(group.rule, items));
    const names = optionKeys.map((k) => normaliseOptionName(OPTION_LABELS[k] ?? titleCase(String(k))));
    const seenCombos = new Set<string>();
    const variants: GroupedVariant[] = [];
    for (const e of entries) {
      const values = optionKeys.map((k) => String(e.item[k] ?? "").trim() || null);
      const combo = values.map((v) => (v ?? "").toLowerCase()).join("|");
      // Duplicate option combos in the same group are kept as separate variants so the
      // review grid can flag them, unless the SKUs are identical (true duplicate line).
      const skuKey = `${combo}#${e.item.sku.toLowerCase()}`;
      if (e.item.sku && seenCombos.has(skuKey)) {
        const existing = variants.find((v) => v.item.sku.toLowerCase() === e.item.sku.toLowerCase());
        if (existing) {
          existing.item.quantity = (existing.item.quantity ?? 0) + (e.item.quantity ?? 0);
          continue;
        }
      }
      seenCombos.add(skuKey);
      variants.push({ item: e.item, sourceIndex: e.index, option1Value: values[0] ?? null, option2Value: values[1] ?? null, option3Value: values[2] ?? null });
    }
    const description = items.map((i) => i.description.trim()).find(Boolean) ?? "";
    const general = catalogTags({ productType, brand, items, ruleTags: tagsFor(group.rule, items, brand), describedAs: `${titled} ${description}`, ...(opts.builtBy ? { builtBy: opts.builtBy } : {}) });
    // The riding-style shelves: what the shop gave this model last season, and only for a model it
    // has never listed, what the supplier calls it. See shop-memory.
    const remembered = rememberedDisciplines({ title: titled, brand }, opts.listings ?? []);
    const styles = remembered.length > 0 ? remembered : disciplinesFromTerrain(productType, items.map((i) => i.terrain).join(" "));
    const tags = [...general, ...styles.filter((t) => !general.includes(t))];
    products.push({
      key,
      // Built from the name the product will actually carry, season and all. Shopify derives a
      // handle from the title ONCE, when the product is created, and never again — so a year added
      // to the name afterwards leaves the URL a season behind for good, and it cannot be put right
      // by re-importing, because the importer matches on the handle. The shop's own catalogue
      // settles it: of the 259 products whose name carries a year, 242 carry it in the handle too.
      // And not the brand: 845 of its 928 products with a vendor have no vendor in the handle
      // ("custom-2027", "m7-mantra"), and a handle is how Shopify and the reconciler recognise a
      // listing the shop already has — "burton-custom-2027" was a duplicate of custom-2027.
      handle: buildHandle({ title: productTitle(titled, seasonTagFrom(tags)) }),
      title: titled,
      brand,
      category: group.rule?.category ?? (first.category || "other"),
      productType,
      tags,
      collections: snowboard ? [snowboard] : collectionsFor(group.rule, items),
      description,
      metafields: metafieldsFor(items),
      option1Name: names[0] ?? null,
      option2Name: names[1] ?? null,
      option3Name: names[2] ?? null,
      imageUrls: Array.from(new Set(items.flatMap((i) => i.imageUrls))),
      variants,
    });
  }
  return products;
}

/**
 * The same option keys, in the order the shop reads them for this kind of product. Anything the
 * convention has no opinion about keeps the order it arrived in.
 */
function orderByConvention(productType: string, keys: Array<keyof CanonicalLineItem>): Array<keyof CanonicalLineItem> {
  if (keys.length < 2) return keys;
  const label = (k: keyof CanonicalLineItem) => normaliseOptionName(OPTION_LABELS[k] ?? titleCase(String(k)));
  const wanted = optionNamesFor(productType, keys.map(label));
  return [...keys].sort((a, b) => {
    const ia = wanted.indexOf(label(a));
    const ib = wanted.indexOf(label(b));
    return (ia === -1 ? wanted.length : ia) - (ib === -1 ? wanted.length : ib);
  });
}
