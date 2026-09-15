// Category detection and enrichment rules: product type, collections, tags, which canonical
// attributes become Shopify options vs metafields, and title clean-up.

import { SKI_METAFIELDS, metafieldColumn, type CanonicalLineItem, type Category } from "./types";

export interface CategoryRuleLike {
  category: string;
  pattern: string;
  productType: string;
  collections: string;
  tags: string;
  option1?: string | null;
  option2?: string | null;
  option3?: string | null;
  priority: number;
  active: boolean;
}

/** Seeded defaults; editable in Settings. Order matters (boots before skis so "ski boot" wins). */
export const DEFAULT_CATEGORY_RULES: CategoryRuleLike[] = [
  { category: "boots", pattern: String.raw`\bboots?\b|\bhawx\b|\bmondo`, productType: "Ski Boots", collections: "Ski Boots", tags: "boots", option1: "size", option2: "width", option3: "colour", priority: 100, active: true },
  { category: "bindings", pattern: String.raw`\bbindings?\b|\bdin\b`, productType: "Ski Bindings", collections: "Bindings", tags: "bindings", option1: "size", option2: "colour", option3: null, priority: 95, active: true },
  { category: "poles", pattern: String.raw`\bpoles?\b`, productType: "Ski Poles", collections: "Poles", tags: "poles", option1: "length", option2: "colour", option3: null, priority: 90, active: true },
  { category: "helmets", pattern: String.raw`\bhelmets?\b`, productType: "Helmets", collections: "Helmets", tags: "helmets, protection", option1: "size", option2: "colour", option3: null, priority: 85, active: true },
  { category: "goggles", pattern: String.raw`\bgoggles?\b|\blens\b`, productType: "Goggles", collections: "Goggles", tags: "goggles", option1: "colour", option2: "size", option3: null, priority: 84, active: true },
  { category: "snowboards", pattern: String.raw`\bsnowboards?\b|\bboard\b`, productType: "Snowboards", collections: "Snowboards", tags: "snowboards", option1: "length", option2: "colour", option3: null, priority: 80, active: true },
  // Clothing by garment, not as one lump. "Apparel" was never a Type this shop uses — no product
  // in the catalogue carries it — and a garment's Type is Snow Clothing, which these leaves resolve
  // to, while the leaf itself rides along as the tag.
  { category: "apparel", pattern: String.raw`\bsocks?\b`, productType: "Snow Socks", collections: "Snow Clothing", tags: "socks", option1: "size", option2: "colour", option3: null, priority: 79, active: true },
  { category: "apparel", pattern: String.raw`\bjackets?\b|\bshell\b|\banorak\b`, productType: "Snow Jackets", collections: "Snow Clothing", tags: "snow jackets", option1: "size", option2: "colour", option3: null, priority: 78, active: true },
  { category: "apparel", pattern: String.raw`\bpants?\b|\bbibs?\b`, productType: "Snow Pants", collections: "Snow Clothing", tags: "snow pants", option1: "size", option2: "colour", option3: null, priority: 77, active: true },
  { category: "apparel", pattern: String.raw`\bbase ?layer|\bthermal`, productType: "Baselayers", collections: "Snow Clothing", tags: "baselayers", option1: "size", option2: "colour", option3: null, priority: 76, active: true },
  { category: "apparel", pattern: String.raw`\bmidlayer|\bfleece|\bhoodie`, productType: "Midlayers", collections: "Snow Clothing", tags: "midlayers", option1: "size", option2: "colour", option3: null, priority: 75, active: true },
  { category: "apparel", pattern: String.raw`\bgloves?\b|\bmitts?\b`, productType: "Gloves", collections: "Clothing Accessories", tags: "gloves", option1: "size", option2: "colour", option3: null, priority: 74, active: true },
  { category: "accessories", pattern: String.raw`\bbeanie|\bwax\b|\btune|\bbag\b|\block\b|\bleash|\bstrap|\bneck ?warmer|\bbalaclava|\btool\b`, productType: "Accessories", collections: "Accessories", tags: "accessories", option1: "size", option2: "colour", option3: null, priority: 70, active: true },
  { category: "skis", pattern: String.raw`\bskis?\b|\bmantra\b|\bbent\b|\benforcer\b|\brustler\b|\bkore\b|\bexperience\b|\bmaverick\b`, productType: "Skis", collections: "Skis", tags: "skis", option1: "length", option2: "colour", option3: null, priority: 60, active: true },
];

export const CATEGORY_LABELS: Record<Category, string> = {
  skis: "Skis", snowboards: "Snowboards", boots: "Ski Boots", bindings: "Bindings", poles: "Poles",
  helmets: "Helmets", goggles: "Goggles", apparel: "Snow Clothing", accessories: "Accessories", other: "Other",
};

export function detectCategory(item: CanonicalLineItem, rules: CategoryRuleLike[]): CategoryRuleLike | null {
  const stated = (item.category || "").trim().toLowerCase();
  const active = rules.filter((r) => r.active).sort((a, b) => b.priority - a.priority);
  if (stated) {
    const direct = active.find((r) => r.category === stated) ?? active.find((r) => new RegExp(r.pattern, "i").test(stated));
    if (direct) return direct;
  }
  const haystack = [item.productType, item.title, item.description].filter(Boolean).join(" \n ");
  for (const rule of active) {
    try {
      if (new RegExp(rule.pattern, "i").test(haystack)) return rule;
    } catch {
      // bad user regex: skip rule
    }
  }
  return null;
}

const LENGTH_IN_TITLE = /\b(1[0-9]{2}|2[01][0-9])\s?(?:cm)?\s*$|\b(1[0-9]{2}|2[01][0-9])\s?cm\b/i;
const BOOT_SIZE_IN_TITLE = /\b(?:size|sz|mp|mondo)?\s*:?\s*(2[0-9](?:\.[05])?|3[0-3](?:\.[05])?)\s*$/i;
const LETTER_SIZE_IN_TITLE = /[\s\-/,]*\b(?:size|sz)?\s*:?\s*(XXS|XS|S|M|L|XL|XXL|3XL|OSFA|One Size)\s*$/i;
const MM_IN_TITLE = /\b(\d{2,3})\s?mm\s*$/i;
const YEAR_IN_TITLE = /\b(20[2-3][0-9])\b/;

/**
 * Normalise attributes for the category and pull length/size/season/colour out of a title
 * when the supplier crams them together. Returns a copy.
 */
export function enrichFromTitle(item: CanonicalLineItem, category: string): CanonicalLineItem {
  const out = { ...item, imageUrls: [...item.imageUrls] };
  let title = out.title.trim();
  const lengthy = category === "skis" || category === "snowboards" || category === "poles";

  // Supplier "size" columns often hold ski lengths, and vice versa.
  if (lengthy && !out.length && /^\d{3}$/.test(out.size.trim())) { out.length = out.size.trim(); out.size = ""; }
  if (category === "bindings" && !out.size && out.length) { out.size = out.length; out.length = ""; }
  if ((category === "boots" || category === "apparel" || category === "helmets" || category === "goggles" || category === "accessories") && !out.size && /^\d{2}(\.\d)?$/.test(out.length.trim())) { out.size = out.length.trim(); out.length = ""; }

  if (!out.season) {
    const y = YEAR_IN_TITLE.exec(title);
    if (y) out.season = y[1];
  }
  if (lengthy) {
    const m = LENGTH_IN_TITLE.exec(title);
    if (m) {
      const found = m[1] ?? m[2];
      if (!out.length || out.length.replace(/cm/i, "").trim() === found) {
        out.length = found;
        title = title.replace(m[0], "").trim();
      }
    }
  }
  if (category === "bindings") {
    const m = MM_IN_TITLE.exec(title);
    if (m) {
      if (!out.size) out.size = `${m[1]}mm`;
      title = title.replace(m[0], "").trim();
    }
  }
  if (category === "boots") {
    const m = BOOT_SIZE_IN_TITLE.exec(title);
    if (m && (!out.size || out.size === m[1])) {
      out.size = m[1];
      title = title.replace(m[0], "").trim();
    }
  }
  if (category !== "boots" && category !== "skis" && category !== "snowboards") {
    const m = LETTER_SIZE_IN_TITLE.exec(title);
    if (m && (!out.size || out.size.toLowerCase() === m[1].toLowerCase())) {
      out.size = m[1].toUpperCase() === "ONE SIZE" ? "One Size" : m[1].toUpperCase();
      title = title.replace(m[0], "").trim();
    }
  }
  if (out.length) out.length = out.length.replace(/cm/i, "").trim();
  if (out.colour) {
    const re = new RegExp(String.raw`[\s\-/,]*\b${escapeRegExp(out.colour)}\b\s*$`, "i");
    title = title.replace(re, "").trim();
    // colour may sit before a size token that was stripped above
    const inner = new RegExp(String.raw`\s+${escapeRegExp(out.colour)}\s*$`, "i");
    title = title.replace(inner, "").trim();
  }
  if (category === "apparel" || category === "accessories" || category === "bindings" || category === "helmets" || category === "goggles") {
    const m = LETTER_SIZE_IN_TITLE.exec(title);
    if (m && out.size && out.size.toLowerCase() === m[1].toLowerCase()) title = title.replace(m[0], "").trim();
  }
  out.title = title.replace(/[\s\-/,:]+$/g, "").replace(/\s+(size|sz)$/i, "").trim();
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const OPTION_LABELS: Record<string, string> = {
  length: "Length",
  size: "Size",
  width: "Width",
  colour: "Colour",
};

/** Decide option names for a product group given its category rule and which attributes vary. */
export function chooseOptions(rule: CategoryRuleLike | null, items: CanonicalLineItem[]): Array<keyof CanonicalLineItem> {
  const preferred = ((rule ? [rule.option1, rule.option2, rule.option3] : ["size", "colour"]).filter(Boolean) as Array<keyof CanonicalLineItem>);
  const fallback: Array<keyof CanonicalLineItem> = ["length", "size", "width", "colour"];
  const present = (key: keyof CanonicalLineItem) => items.some((i) => String(i[key] ?? "").trim() !== "");
  const chosen = preferred.filter(present);
  for (const key of fallback) {
    if (chosen.length >= 3) break;
    if (!chosen.includes(key) && present(key)) {
      // only add a fallback attribute if it actually distinguishes variants
      const values = new Set(items.map((i) => String(i[key] ?? "").trim()));
      if (values.size > 1) chosen.push(key);
    }
  }
  return chosen.slice(0, 3);
}

/** Metafield column values for a product, from the first item carrying each attribute. */
export function metafieldsFor(items: CanonicalLineItem[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const def of SKI_METAFIELDS) {
    const values = Array.from(new Set(items.map((i) => String(i[def.source] ?? "").trim()).filter(Boolean)));
    if (values.length === 0) continue;
    out[def.key] = def.key === "length_cm" ? values.join(", ") : values[0];
  }
  return out;
}

export function metafieldColumns(metafields: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const def of SKI_METAFIELDS) {
    if (metafields[def.key]) out[metafieldColumn(def)] = metafields[def.key];
  }
  return out;
}

export function tagsFor(rule: CategoryRuleLike | null, items: CanonicalLineItem[], brand: string): string[] {
  const tags = new Set<string>();
  for (const t of (rule?.tags ?? "").split(",")) if (t.trim()) tags.add(t.trim());
  if (brand) tags.add(brand);
  for (const i of items) {
    for (const t of (i.tags ?? "").split(",")) if (t.trim()) tags.add(t.trim());
    if (i.season) tags.add(i.season);
    if (i.gender) tags.add(i.gender);
    if (i.abilityLevel) tags.add(i.abilityLevel);
    if (i.terrain) tags.add(i.terrain);
  }
  return Array.from(tags);
}

export function collectionsFor(rule: CategoryRuleLike | null, items: CanonicalLineItem[]): string[] {
  const cols = new Set<string>();
  for (const c of (rule?.collections ?? "").split(",")) if (c.trim()) cols.add(c.trim());
  for (const i of items) for (const c of (i.collections ?? "").split(",")) if (c.trim()) cols.add(c.trim());
  return Array.from(cols);
}
