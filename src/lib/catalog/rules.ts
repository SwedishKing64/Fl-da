// Tag / collection / product-type / metafield rules. Pure so the Rules page can preview
// matches in the browser and the pipeline can apply them when products are built and exported.

export interface TagRuleLike {
  id: string;
  name: string;
  matchField: string; // any | title | brand | category | productType | sku | tags
  pattern: string;
  addTags: string;
  addCollections: string;
  setProductType: string;
  setMetafields: string | Record<string, string>;
  priority: number;
  active: boolean;
}

export interface RuleTarget {
  title: string;
  vendor: string;
  category: string;
  productType: string;
  skus: string[];
  tags: string[];
  collections: string[];
  metafields: Record<string, string>;
}

export interface RuleOutcome {
  tags: string[];
  collections: string[];
  productType: string;
  metafields: Record<string, string>;
  matched: Array<{ id: string; name: string }>;
}

export const MATCH_FIELDS: Array<{ key: string; label: string }> = [
  { key: "any", label: "Anything (title, brand, category, type, SKU, tags)" },
  { key: "title", label: "Title" },
  { key: "brand", label: "Brand / vendor" },
  { key: "category", label: "Category" },
  { key: "productType", label: "Product type" },
  { key: "sku", label: "SKU" },
  { key: "tags", label: "Existing tags" },
];

function splitList(s: string): string[] {
  return s.split(",").map((t) => t.trim()).filter(Boolean);
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Compile a rule pattern: a regex when valid, otherwise a literal, case-insensitive search. */
export function compilePattern(pattern: string): RegExp {
  try {
    return new RegExp(pattern, "i");
  } catch {
    return new RegExp(escapeRegExp(pattern), "i");
  }
}

export function fieldText(target: RuleTarget, field: string): string {
  switch (field) {
    case "title": return target.title;
    case "brand": return target.vendor;
    case "category": return target.category;
    case "productType": return target.productType;
    case "sku": return target.skus.join(" ");
    case "tags": return target.tags.join(", ");
    default:
      return [target.title, target.vendor, target.category, target.productType, target.skus.join(" "), target.tags.join(", ")].join(" | ");
  }
}

export function ruleMatches(rule: TagRuleLike, target: RuleTarget): boolean {
  if (!rule.active || !rule.pattern.trim()) return false;
  return compilePattern(rule.pattern).test(fieldText(target, rule.matchField));
}

/**
 * Apply every rule that matches, most important first.
 *
 * Tags and collections are added up: order changes nothing, because two rules adding tags simply
 * both get their way. Order decides one thing only — what happens when two rules disagree about
 * the product type or a metafield — and there the more important rule wins.
 *
 * That is worth stating because it used to work the other way round. Rules ran most-important
 * first but each one overwrote what the last had set, so the least important rule had the final
 * say: a rule at 90 saying "Womens Skis" lost to a rule at 10 saying "Skis". Now the first rule to
 * answer a question owns the answer, and the rules below it can still fill in what it left alone.
 */
export function applyTagRules(target: RuleTarget, rules: TagRuleLike[]): RuleOutcome {
  const tags = new Set(target.tags);
  const collections = new Set(target.collections);
  const metafields = { ...target.metafields };
  let productType = target.productType;
  let typeDecided = false;
  const decided = new Set<string>();
  const matched: RuleOutcome["matched"] = [];
  // Order has nothing to do with tags. A tag is a yes or a no: every rule that matches adds its
  // tags, as many as it likes, and no rule's tags ever displace another's — there is no cap and
  // no contest. Weight decides only the two things a product can hold exactly one of, its Type
  // and a given metafield, where the heavier rule answers first and keeps the answer. A rule that
  // adds tags alone is unaffected by where it sits.
  const ordered = [...rules].filter((r) => r.active).sort((a, b) => b.priority - a.priority);
  for (const rule of ordered) {
    if (!ruleMatches(rule, { ...target, productType, tags: Array.from(tags) })) continue;
    matched.push({ id: rule.id, name: rule.name });
    for (const t of splitList(rule.addTags)) tags.add(t);
    for (const c of splitList(rule.addCollections)) collections.add(c);
    if (rule.setProductType.trim() && !typeDecided) {
      productType = rule.setProductType.trim();
      typeDecided = true;
    }
    const mf = typeof rule.setMetafields === "string" ? safeParse(rule.setMetafields) : rule.setMetafields;
    for (const [k, v] of Object.entries(mf)) {
      if (!v || decided.has(k)) continue;
      metafields[k] = v;
      decided.add(k);
    }
  }
  return { tags: Array.from(tags), collections: Array.from(collections), productType, metafields, matched };
}

function safeParse(s: string): Record<string, string> {
  try {
    const v = JSON.parse(s || "{}");
    return v && typeof v === "object" ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/**
 * Rules every new copy starts with: none. Flöda used to seed a ski shop's own rules (gender tags,
 * terrain, a list of binding models) into every install; a shop now writes its own on Teach Flöda,
 * and the ones an older install was seeded with stay as the shop's to keep or delete.
 */
export const DEFAULT_TAG_RULES: Array<Omit<TagRuleLike, "id">> = [];
