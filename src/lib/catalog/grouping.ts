// Group canonical line items into products with variants.

import { buildHandle } from "./handle";
import { nameLikeSibling } from "./shop-names";
import { csvType } from "./pipeline-pure";
import { chooseOptions, collectionsFor, extraOptions, optionValue, type OptionKey, detectCategory, enrichFromTitle, metafieldsFor, OPTION_LABELS, snowboardType, tagsFor, type CategoryRuleLike } from "./categorize";
import { closestType, houseConventions, isValidType, learnedTypes, packKnowledge, resolveType, snowTrade, typeNamedIn, typesAreKnown } from "./taxonomy";
import { inSizeOrder } from "./size-order";
import { correctedOptionName, correctedProductType } from "./corrections";
import { withFit, withoutGender } from "./mapping";
import { classifyAccessory } from "./trades/snow/accessories";
import { genderedTitle } from "./trades/snow/gender-title";
import { packShelf } from "./packs";
import { integratedBinding } from "./trades/snow/packages";
import { isSnowBag } from "./packs";
import { withoutColour } from "./title-colour";
import { isSnowboardBrand } from "./brands";
import { normaliseOptionName, optionNamesFor } from "./options";
import { catalogTags } from "./product-tags";
import { BAG_TAGS, isSkin } from "./tagging";
import { asShopWritesIt, productTitle, seasonTagFrom, withoutVendor } from "./titles";
import type { CanonicalLineItem } from "./types";
import { disciplinesFromTerrain, rememberedDisciplines, rememberedType, type Listing } from "./shop-memory";

export interface GroupedVariant {
  item: CanonicalLineItem;
  sourceIndex: number; // index into the input array
  option1Value: string | null;
  option2Value: string | null;
  option3Value: string | null;
  /** The variant's own picture — its colour's, where the colour had a page of its own. */
  imageUrl?: string;
}

export interface GroupedProduct {
  key: string;
  handle: string;
  /** Who it is for — mens, womens, kids — which the title no longer says. */
  audience?: string;
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
export function audience(gender: string): string {
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
    // The men's and the women's of one model share a name and are two products with two codes
    // (WS2782 and WS2725W): stripped to what those have in common, "WS27", every model of the
    // range would share one code and be built as one product (found 2026-10-28).
    const key = `${item.brand.trim().toLowerCase()}|${normTitle(item.title)}|${audience(item.gender)}`;
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

/** "OS", "O/S", "OSFA", "One Size", "One Size Fits All", "1SZ": a size that is no size. */
export function isOneSize(size: string | undefined): boolean {
  return /^(os|o\/s|osfa|osfm|one ?size(\s*fits\s*(all|most))?|1 ?sz|1 ?size|one|uni|unisize|no size|n\/s)$/i.test((size ?? "").trim().replace(/\.$/, ""));
}

export function groupLineItems(rawItems: CanonicalLineItem[], rules: CategoryRuleLike[], opts: { builtBy?: string; listings?: Listing[] } = {}): GroupedProduct[] {
  const groups = new Map<string, { rule: CategoryRuleLike | null; entries: Array<{ item: CanonicalLineItem; index: number }> }>();

  const enriched = rawItems.map((raw) => {
    // Nothing on the order says what it is: the shop's own filing of the model does. See shop-memory.
    const remembered = rememberedType({ title: raw.title, brand: raw.brand }, opts.listings ?? []);
    const rule = detectCategory(raw, rules)
      ?? (remembered ? rules.find((r) => r.active && (r.productType === remembered || r.category === remembered.toLowerCase())) ?? null : null);
    const item = withFit(enrichFromTitle(raw, rule?.category ?? "other"));
    // One size is no size (asked 2026-10-20): a product an order calls OS or One Size is not made a
    // Size variant, and has no Size option at all. See isOneSize.
    if (isOneSize(item.size)) item.size = "";
    // No colour in a title (asked 2026-10-20): the order's colour for the line comes out of its name,
    // so every colour of a model is one product under one name. See title-colour.ts.
    item.title = withoutColour(item.title, [item.colour]);
    return { rule, item };
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

  // A supplier's own column that tells one product's lines apart — its Scent, its Capacity — is
  // an option on every product of the batch that has a value under it, the one-line products too:
  // a candle ordered in one scent is still sold by scent, and the next scent joins it as a variant.
  const batchExtras = new Set<OptionKey>();
  for (const g of groups.values()) {
    const its = g.entries.map((e) => e.item);
    for (const k of extraOptions(its, chooseOptions(g.rule, its))) if (String(k).startsWith("extra:")) batchExtras.add(k);
  }

  const products: GroupedProduct[] = [];
  // The ski and snowboard rules below are for a shop that sells skis and snowboards. Elsewhere a
  // boot is a boot and a glove a glove, and the shop's own store says where they go.
  const snow = snowTrade();
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
    // A snowboard brand's boots are snowboard boots, whatever the boots rule says. See snowboardType.
    const snowboard = snow ? snowboardType(group.rule, items) : null;
    // "Accessories" is a rule's word, not a Type the shop has: an accessory is filed under the
    // heading of the sport it serves — a Burton board bag or stomp pad under Snowboard Accessories,
    // a glove or a goggle under Ski Accessories whoever made it, which is where the shop keeps all
    // 27 of its goggles and 127 of its 129 gloves. See classifyAccessory.
    // A pack is filed on the Outdoor menu by what it is, before the accessories rules can read
    // "bag" into it: an Osprey Exos is a hiking pack, not a ski bag. See packs.ts.
    const pack = packShelf(brand, title, first.category, first.productType, first.description);
    const accessory = snow && group.rule?.category === "accessories"
      ? classifyAccessory(items.some((i) => isSnowboardBrand(i.brand) || /\bsnowboard/i.test(`${i.category} ${i.productType} ${i.title}`)) ? "Snowboard" : "Ski", title, first.description, first.category, first.productType).type
      : null;
    // A supplier's own kind word is a Type only when it is one the shop uses: "FREERIDE" is not.
    // A skin no rule knows, said so by the supplier's own section: Black Crows' "PILUS SKINS".
    const skin = snow && !group.rule && isSkin(`${title} ${first.category}`) ? "Skins" : null;
    // The ski shop's bags: any Dakine bag or pack, and a boot or ski bag by anyone, is a Ski
    // Accessory on the Ski & Boot Bags shelf, whatever rule its name tripped (asked 2026-10-20).
    const snowBag = snow && isSnowBag(brand, title, first.category, first.productType) ? "Ski Accessories" : null;
    // And as the shop corrected it: a Type changed on this brand's product before is changed here too.
    // Nothing on the order said what it is: the shop's own listing of the model says, and failing
    // that the shop's Type the name itself carries ("Down Jackets" in "Cirrus Down Jacket").
    // Nothing on the order said what it is in the shop's words: the supplier's own category column
    // may ("HARDTAIL MOUNTAIN BIKES"), then the shop's own listing of the model, then the shop's
    // Type the name itself carries ("Down Jackets" in "Cirrus Down Jacket").
    const fromShop = () => resolveType(first.category) || typeNamedIn(first.category) || rememberedType({ title, brand }, opts.listings ?? []) || typeNamedIn(title) || "";
    const filedAs = correctedProductType(snowBag ?? snowboard ?? pack ?? accessory ?? skin ?? group.rule?.productType ?? resolveType(first.productType) ?? fromShop(), brand);
    // Filed under one of the shop's own types where one is close, rather than asked about.
    const nearest = filedAs && typesAreKnown() && !isValidType(filedAs) ? closestType(filedAs) ?? filedAs : filedAs;
    // A shop that has taught its own Types files under them: a pack's shelf ("Hiking Packs") is not
    // the shop's "Backpacks". Its own listing of the model says which; failing that, the nearest.
    const own = learnedTypes();
    const productType = nearest && own.length > 0 && !own.some((t) => t.toLowerCase() === nearest.toLowerCase())
      ? rememberedType({ title, brand }, opts.listings ?? []) || closestType(nearest, own) || nearest
      : nearest;
    // Who it is for. A shop that writes "Men's …" and "Women's …" on the front of a name (house
    // naming.audience "front") gets that, on everything but hardgoods; every other shop's titles
    // carry no gender at all — the gender goes in the tags, and the handle tells men's and women's
    // of one model apart (the ski shop asked for this, 2026-10-15). Kids' is an age, not a gender.
    const who = audience(first.gender);
    const front = houseConventions().naming.audience === "front";
    // A ski boot is named by its model alone, like a ski: "Zero G Tour Pro 2027", not "Men's Zero
    // G Tour Pro Ski Boots 2027". The gender goes in the tags. (A snowboard boot keeps the shop's
    // "Men's … Snowboard Boots".)
    const skiBoot = /^(ski boots|touring boots|alpine boots|race boots)$/i.test(productType);
    const hardgoods = skiBoot || /^(skis?|snowboards?|poles?|ski poles?)$/i.test(productType) || /^(skis?|snowboards?|poles?|goggles|helmets)$/i.test(group.rule?.category ?? "") || /\b(goggles?|helmets?)\b/i.test(`${title} ${first.category} ${first.productType}`);
    // A name that is the shop's own — the line was joined to a listing — is left as the shop wrote
    // it: "Impact Wrist Guards" and "[ak] Endurance Socks" carry no audience on the shop's shelf.
    const shopNamed = (opts.listings ?? []).some((l) => normTitle(l.title.replace(/\s+20\d{2}$/, "")) === normTitle(title));
    // The kind word comes off a ski boot's name as well, wherever the supplier put it.
    const bare = skiBoot ? title.replace(/\s*\b(ski|touring|alpine|race)?\s*boots?\b/gi, " ").replace(/\s{2,}/g, " ").trim() || title : title;
    // No gender in a title, for any product (asked 2026-10-15): the gender is in the tags, and the
    // handle tells men's and women's of one model apart (see the end of this function). Kids' is an
    // age, not a gender, and still goes on the front where the shop writes it.
    const ungendered = front ? bare : withoutGender(bare).title;
    const titled = front
      ? who && !hardgoods && !shopNamed && !/^(men'?s|women'?s|kids'?|youth|junior)\b/i.test(bare)
        ? `${{ mens: "Men's", womens: "Women's", kids: "Kids'" }[who]} ${asShopWritesIt(bare)}`
        : bare
      : who === "kids" && !hardgoods && !shopNamed && !/^(kids'?|youth|junior)\b/i.test(ungendered)
        ? `Kids' ${asShopWritesIt(ungendered)}`
        : ungendered;
    // A ski the supplier sends already mounted — "HERO FIS GS FAC SPX15" — is a package, and is
    // named as one: "Hero FIS GS Fac 2026 inc SPX 15 Binding Package". See integratedBinding.
    const season = items.map((i) => i.season).find((s) => /^20\d{2}$/.test(s)) ?? "";
    const mounted = snow && /^skis?$/i.test(productType) ? integratedBinding(titled, season) : null;
    const shown = mounted ? mounted.title : titled;
    // What varies decides which options exist; the shop's own habit decides the order they are
    // read in. A jacket is colour then size on forty-one of forty-three products, a ski is length
    // first, and a sleeping bag is size, loft, then which side the zip is on.
    // A supplier's own column joins them where two lines would otherwise be the same variant.
    const chosenKeys = extraOptions(items, chooseOptions(group.rule, items));
    for (const k of batchExtras) if (!chosenKeys.includes(k) && chosenKeys.length < 3 && items.every((i) => optionValue(i, k))) chosenKeys.push(k);
    const optionKeys = orderByConvention(productType, chosenKeys, items);
    const names = optionKeys.map((k) => correctedOptionName(productType, normaliseOptionName(optionLabel(k, items))));
    const seenCombos = new Set<string>();
    const variants: GroupedVariant[] = [];
    for (const e of entries) {
      // A reader puts a board's "158W" under size on one line and under length on the next; a
      // line with the one empty takes the other rather than going out with no option value.
      const values = optionKeys.map((k) => optionValue(e.item, k) || (k === "length" ? e.item.size.trim() : k === "size" && !optionKeys.includes("length") ? e.item.length.trim() : "") || null);
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
    // In the order of the trade's size systems, where the shop's pack has them. See size-order.ts.
    const sizes = packKnowledge()?.sizes ?? [];
    if (sizes.length) variants.splice(0, variants.length, ...inSizeOrder(variants, (v) => [v.option1Value, v.option2Value, v.option3Value], sizes));
    const description = items.map((i) => i.description.trim()).find(Boolean) ?? "";
    const collections = snowBag
      // Only a bag or accessories collection: "boot" in the name can trip the boots rule's "Ski Boots".
      ? collectionsFor(group.rule, items).filter((c) => /\bbags?\b|accessor/i.test(c))
      : snowboard ? [snowboard] : pack ? ["Packs & Bags"] : collectionsFor(group.rule, items);
    // Tagged for the shelf and for the Type it goes out under: a goggle is "Goggles" to the rule
    // and "Ski Accessories" in the file, and the shop writes both (goggles, ski-accessories, ski).
    const general = catalogTags({ productType, filedAs: csvType(productType, collections), brand, items, ruleTags: tagsFor(group.rule, items, brand), describedAs: `${shown} ${description}`, ...(opts.builtBy ? { builtBy: opts.builtBy } : {}) });
    // The riding-style shelves: what the shop gave this model last season, and only for a model it
    // has never listed, what the supplier calls it. See shop-memory.
    const remembered = rememberedDisciplines({ title: shown, brand }, opts.listings ?? []);
    const styles = remembered.length > 0 ? remembered : disciplinesFromTerrain(productType, items.map((i) => i.terrain).join(" "));
    const tags = [...general, ...styles.filter((t) => !general.includes(t))];
    if (snowBag) {
      // Off the Outdoor menu entirely, onto the ski bag and boot bag shelves.
      const outdoor = /\b(outdoor|hiking|daypacks?|travel|duffels?|hydration|packs)\b/i;
      for (let i = tags.length - 1; i >= 0; i--) if (outdoor.test(tags[i].replace(/-/g, " "))) tags.splice(i, 1);
      for (const t of [...BAG_TAGS, "ski-accessories", "ski"]) if (!tags.includes(t)) tags.push(t);
    }
    // The shop tags a ski sold with a binding "ski packages".
    if (mounted && !tags.includes("ski packages")) tags.push("ski packages");
    // The kind on the end of the name, where the order's shorthand left it off: the shop writes
    // "Men's Cartel X Re:Flex Snowboard Bindings", "Men's Highshot Step On® Snowboard Boots",
    // "Men's [ak] Cyclic GORE-TEX 2L Jacket" — on all 20 of its bindings, 14 of 15 boots and its
    // jackets and pants. Only where the name has no kind word of its own, and only the kinds the
    // shop's own listings show it does this for.
    const kindSaid = /\b(snowboards?|boards?|boots?|bindings?|gloves?|mitts?|mittens?|socks?|bags?|jackets?|pants?|bibs?|goggles?|helmets?|beanies?|skis?|poles?|hoodies?|anoraks?|vests?|shorts?|fleece|pullovers?|onesies?|suits?)\b/i;
    // The snow trade's habit, learned from the ski shop's listings; no other trade is assumed to have it.
    const kindSuffix = !snow || kindSaid.test(shown) ? "" :
      /^snowboard bindings$/i.test(productType) ? "Snowboard Bindings" :
      /^snowboard boots$/i.test(productType) ? "Snowboard Boots" :
      tags.includes("snow jackets") ? "Jacket" :
      tags.includes("snow pants") ? "Pants" :
      tags.includes("midlayers") && /\binsulated\b/i.test(shown) ? "Jacket" :
      tags.includes("socks") ? "Socks" : "";
    // Better than any rule: the shop's own name for this model's other listing — the other fit, or
    // last season's — with the fit and the year swapped. See nameLikeSibling.
    const likeSibling = mounted ? null : nameLikeSibling(asShopWritesIt(shown), season, opts.listings ?? [], brand);
    const unnamed = likeSibling ? likeSibling.replace(/\s+20\d\d$/, "") : kindSuffix ? `${asShopWritesIt(shown)} ${kindSuffix}` : shown;
    // The ski shop's snow clothing alone says who it is for, on the front (asked 2026-10-19). See gender-title.ts.
    const named = front ? unnamed : snow ? genderedTitle(withoutGender(unnamed).title, { productType, tags, gender: who }) : withoutGender(unnamed).title;
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
      handle: buildHandle({ title: productTitle(named, seasonTagFrom(tags)) }),
      audience: who,
      title: named,
      brand,
      category: group.rule?.category ?? (first.category || "other"),
      productType,
      tags,
      collections,
      description,
      metafields: metafieldsFor(items),
      option1Name: names[0] ?? null,
      option2Name: names[1] ?? null,
      option3Name: names[2] ?? null,
      imageUrls: Array.from(new Set(items.flatMap((i) => i.imageUrls))),
      variants,
    });
  }
  return distinctHandles(products);
}

/**
 * Two products with one handle are one product to Shopify: the import merges them. With the
 * gender off the titles, the men's and women's of one model share a name, so where handles clash
 * the one that says who it is for takes it into its handle — "mens-exos-58-2027" — out of sight of
 * the shop's customers, who see only the title.
 */
function distinctHandles<P extends { handle: string; title: string; audience?: string }>(products: P[]): P[] {
  const count = new Map<string, number>();
  for (const p of products) count.set(p.handle, (count.get(p.handle) ?? 0) + 1);
  const label: Record<string, string> = { mens: "Mens", womens: "Womens", kids: "Kids" };
  return products.map((p) => {
    if ((count.get(p.handle) ?? 0) < 2 || !p.audience || !label[p.audience]) return p;
    return { ...p, handle: buildHandle({ title: `${label[p.audience]} ${p.handle}` }) };
  });
}

/** What the free option is called on this product: the name its lines give most often, else "Option". */
function variantNameOf(items: CanonicalLineItem[]): string {
  const counts = new Map<string, number>();
  for (const i of items) {
    const n = (i.variantName ?? "").trim();
    if (n) counts.set(titleCase(n.toLowerCase()), (counts.get(titleCase(n.toLowerCase())) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Option";
}

/**
 * The same option keys, in the order the shop reads them for this kind of product. Anything the
 * convention has no opinion about keeps the order it arrived in.
 */
/** What an option is called on the listing: the field's label, or the supplier's own heading. */
function optionLabel(k: OptionKey, items: CanonicalLineItem[]): string {
  const key = String(k);
  if (key === "variant") return variantNameOf(items);
  if (key.startsWith("extra:")) return titleCase(key.slice(6).toLowerCase());
  return OPTION_LABELS[key] ?? titleCase(key);
}

function orderByConvention(productType: string, keys: OptionKey[], items: CanonicalLineItem[]): OptionKey[] {
  if (keys.length < 2) return keys;
  // By the name each option goes out under: a supplier's "variant" column is its Length or its
  // Zip Side, not "Variant", or the type's own order of options could never place it.
  const label = (k: OptionKey) => normaliseOptionName(optionLabel(k, items));
  const wanted = optionNamesFor(productType, keys.map(label));
  return [...keys].sort((a, b) => {
    const ia = wanted.indexOf(label(a));
    const ib = wanted.indexOf(label(b));
    return (ia === -1 ? wanted.length : ia) - (ib === -1 ? wanted.length : ib);
  });
}

/** The options a product is sold by and every value its variants take, for the tags that mirror them. */
export function productOptions(g: Pick<GroupedProduct, "option1Name" | "option2Name" | "option3Name" | "variants">): Array<{ name: string; values: string[] }> {
  const slots: Array<[string | null, (v: GroupedVariant) => string | null]> = [[g.option1Name, (v) => v.option1Value], [g.option2Name, (v) => v.option2Value], [g.option3Name, (v) => v.option3Value]];
  return slots.filter(([name]) => name && name.trim()).map(([name, pick]) => ({ name: name!.trim(), values: [...new Set(g.variants.map((v) => (pick(v) ?? "").trim()).filter(Boolean))] })).filter((o) => o.values.length);
}
