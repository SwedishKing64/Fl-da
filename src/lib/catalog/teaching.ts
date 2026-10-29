/**
 * What Flöda believes about a shop, by the seven things a shop teaches it: how products are filed
 * and tagged, how titles read, how descriptions are written, how variants are made, how prices are
 * set, how SEO titles read, and how each supplier's paperwork reads.
 *
 * Every belief is one sentence, marked by where it came from — the shop's export, its website, the
 * shop itself, a supplier's paperwork, or Flöda's own way — and, where the shop may change it, with
 * what editing it means (`Edit`), so the page can change it in place rather than send the person
 * to a form elsewhere. Pure: the page loads the stores and hands them in, as rulebook.ts does; the
 * sentences themselves are shared with it.
 */

import type { HouseConventions, KindRule } from "./house";
import { fromGrams } from "./house";
import { DEFAULT_TAG_RULES, type TagRuleLike } from "./rules";
import type { ProductTemplateLike } from "./templates";
import type { LearnedVocabulary } from "./taxonomy";
import type { WebsiteCategories } from "./website";
import { describeRecord, type SupplierRecord } from "./supplier-record";
import { describeLayout, describePricingRule, describeTagRule, type LayoutLike, type PricingRuleLike, type SupplierLike } from "./rulebook";

export type AreaKey = "filing" | "titles" | "descriptions" | "variants" | "pricing" | "seo" | "suppliers";
export type Source = "export" | "website" | "you" | "floda" | "supplier";

export interface Choice { key: string; title: string; text: string }

export type Edit =
  | { kind: "house-choice"; path: string; label: string; options: Choice[]; current: string }
  | { kind: "house-text"; path: string; label: string; multiline?: boolean; placeholder?: string }
  | { kind: "year-on"; types: string[]; tags: string[] }
  | { kind: "sections"; sections: Array<{ heading: string; holds: string }> }
  | { kind: "weights"; weights: HouseConventions["weights"] }
  | { kind: "kind"; type: string; field: "tags" | "variesTags" | "titleFormat" | "calledAs"; value: string; label: string }
  | { kind: "tag-rule"; rule: { id: string; matchField: string; pattern: string; addTags: string; setProductType: string; active: boolean } }
  | { kind: "template"; template: { id: string; scope: string; matchValue: string; optionNames: string[]; tags: string[]; productType: string; notes: string; active: boolean } }
  | { kind: "pricing"; rule: PricingRuleLike }
  | { kind: "setting-text"; key: "seoTone" | "seoTitlePattern" | "houseRules"; label: string; multiline?: boolean; placeholder?: string }
  | { kind: "setting-choice"; key: "defaultRoundTo"; label: string; options: Choice[]; current: string }
  | { kind: "setting-number"; key: "minMarginPct"; label: string; suffix: string }
  | { kind: "supplier"; supplier: SupplierLike }
  | { kind: "link"; href: string; label: string };

export interface Belief {
  /** Stable across loads: "house.naming.brand", "tag:<id>". */
  id: string;
  sentence: string;
  source: Source;
  /** A rule switched off: shown struck through, with Switch on. */
  off?: boolean;
  edit?: Edit;
}

export interface Area {
  key: AreaKey;
  title: string;
  blurb: string;
  beliefs: Belief[];
}

export interface TeachingInput {
  house: HouseConventions;
  learned: LearnedVocabulary | null;
  website: WebsiteCategories | null;
  /** The product types in force, as the build checks a Type against. */
  types: string[];
  tagRules: TagRuleLike[];
  templates: ProductTemplateLike[];
  pricingRules: PricingRuleLike[];
  suppliers: SupplierLike[];
  layouts: LayoutLike[];
  records: SupplierRecord[];
  settings: { seoTone: string; seoTitlePattern: string; defaultRoundTo: string; minMarginPct: number; gstRate: number; pricesIncludeGst: boolean; houseRules: string; taxName: string };
  fieldLabels: Record<string, string>;
  /** The options a type is sold by where the shop has said nothing: the trade pack's order. */
  optionPlan: (type: string) => string[];
  shopName: string;
}

export const SOURCE_LABELS: Record<Source, string> = { export: "from your export", website: "from your website", you: "you set this", floda: "Flöda's own", supplier: "from paperwork" };

const quote = (s: string) => `"${s}"`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const andList = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

export const ENDINGS: Choice[] = [
  { key: "NONE", title: "As worked out", text: "To the cent: $87.40 stays $87.40." },
  { key: "0.99", title: "Ending in .99", text: "$87.40 becomes $87.99." },
  { key: "0.95", title: "Ending in .95", text: "$87.40 becomes $87.95." },
  { key: "1.00", title: "Whole dollars", text: "$87.40 becomes $88." },
];

/** A pricing rule the export taught, as against one the shop wrote: named so when it was made. */
export const EXPORT_RULE_PREFIX = "From your export: ";

function filing(input: TeachingInput): Belief[] {
  const { house, website, learned, types } = input;
  const out: Belief[] = [];
  if (website && website.categories.length) {
    out.push({ id: "website.types", source: "website", sentence: `Your website's ${plural(website.categories.length, "product type")} are the types a product can be filed under; one outside them is flagged, never invented.`, edit: { kind: "link", href: "#website", label: "Read the website again" } });
  } else if (learned && learned.types.length) {
    out.push({ id: "learned.types", source: "export", sentence: `Your export taught ${plural(learned.types.length, "product type")}: ${andList(types.slice(0, 8))}${types.length > 8 ? ` and ${types.length - 8} more` : ""}. A Type outside them is flagged.`, edit: { kind: "link", href: "#export", label: "Read another export" } });
  } else {
    out.push({ id: "types.none", source: "floda", sentence: "No product types yet. Read your website or your catalogue export, and every listing's Type is picked from that list.", edit: { kind: "link", href: "#export", label: "Read an export" } });
  }
  if (learned?.sections.length) out.push({ id: "learned.sections", source: "export", sentence: `Menu tags that run across types: ${andList(learned.sections)}. A product gets its type's menu tag as well as its own.` });
  for (const k of house.kinds) {
    const name = k.calledAs || k.type;
    if (k.calledAs && k.calledAs !== k.type) out.push({ id: `kind.calledAs.${k.type}`, source: "export", sentence: `What your export calls ${quote(k.type)} is filed as ${quote(k.calledAs)}.`, edit: { kind: "kind", type: k.type, field: "calledAs", value: k.calledAs, label: `${k.type} is filed as` } });
    out.push({ id: `kind.tags.${k.type}`, source: k.tags.length ? "export" : "floda", sentence: k.tags.length ? `${name}: every one is tagged ${andList(k.tags)}.` : `${name}: no tag every one gets.`, edit: { kind: "kind", type: k.type, field: "tags", value: k.tags.join(", "), label: `Tags every ${name} product gets` } });
    if (k.variesTags?.length) out.push({ id: `kind.varies.${k.type}`, source: "export", sentence: `${name}: some are tagged ${andList(k.variesTags.slice(0, 6))}${k.variesTags.length > 6 ? ` (${k.variesTags.length - 6} more)` : ""}, picked for each product by what it is.`, edit: { kind: "kind", type: k.type, field: "variesTags", value: k.variesTags.join(", "), label: `Tags some ${name} products get` } });
  }
  for (const t of input.templates) {
    if (t.scope === "PRODUCT_TYPE" && !t.tags.length && !t.productType) continue; // its options are said under Variants
    const who = t.scope === "BRAND" ? t.matchValue : t.scope === "PRODUCT_TYPE" ? t.matchValue : `the category ${t.matchValue}`;
    const bits: string[] = [];
    if (t.tags.length) bits.push(`tagged ${andList(t.tags)}`);
    if (t.productType) bits.push(`filed as ${quote(t.productType)}`);
    if (!bits.length) continue;
    out.push({ id: `template:${t.id}`, source: "export", off: !t.active, sentence: `${who}${t.matchProductType ? ` (${t.matchProductType})` : ""}: every product is ${bits.join(" and ")}.`, edit: { kind: "template", template: { id: t.id, scope: t.scope, matchValue: t.matchValue, optionNames: t.optionNames, tags: t.tags, productType: t.productType, notes: t.notes ?? "", active: t.active } } });
  }
  for (const r of [...input.tagRules].sort((a, b) => b.priority - a.priority)) {
    if (/^kind: /.test(r.name)) continue; // said above, by the type
    const packs = DEFAULT_TAG_RULES.some((d) => d.name === r.name && d.pattern === r.pattern);
    out.push({ id: `tag:${r.id}`, source: packs ? "floda" : "you", off: !r.active, sentence: describeTagRule(r).replace(/ \(switched off\)$/, ""), edit: { kind: "tag-rule", rule: { id: r.id, matchField: r.matchField, pattern: r.pattern, addTags: r.addTags, setProductType: r.setProductType, active: r.active } } });
  }
  out.push({ id: "floda.tags.closed", source: "floda", sentence: "Tags are matched, never invented: a tag your shop has never used is taken off the product and proposed to you here; approved, it is one of yours." });
  return out;
}

function titles(input: TeachingInput): Belief[] {
  const n = input.house.naming;
  const own: Source = input.house.savedAt ? "you" : "floda";
  const out: Belief[] = [
    { id: "house.naming.brand", source: own, sentence: n.brandInTitle === "always" ? "Titles start with the brand." : "Titles leave the brand out; it goes in the Vendor column and the SEO title.", edit: { kind: "house-choice", path: "naming.brandInTitle", label: "The brand in the title", options: [{ key: "never", title: "Left out", text: "Talon 22" }, { key: "always", title: "In front", text: "Osprey Talon 22" }], current: n.brandInTitle } },
    { id: "house.naming.season", source: own, sentence: n.season === "always" ? "Every title ends with the model year." : n.season === "never" ? "Titles never carry a model year." : n.season === "chosen" ? `The model year goes on ${andList([...(n.yearOn?.types ?? []), ...(n.yearOn?.tags ?? []).map((t) => `anything tagged ${t}`)]) || "the types you choose"}, and nothing else.` : "A product whose type carries a year tag gets the model year at the end of the title; others do not.", edit: { kind: "house-choice", path: "naming.season", label: "The model year in the title", options: [{ key: "seasonal", title: "Seasonal types", text: "Where the type carries a year tag" }, { key: "always", title: "Always", text: "Talon 22 2026" }, { key: "never", title: "Never", text: "Talon 22" }, { key: "chosen", title: "Only on what I choose", text: "Named types or tags" }], current: n.season } },
  ];
  if (n.season === "chosen") out.push({ id: "house.naming.yearOn", source: "you", sentence: `Year on: ${andList(n.yearOn?.types ?? []) || "no types"}; tagged: ${andList(n.yearOn?.tags ?? []) || "no tags"}.`, edit: { kind: "year-on", types: n.yearOn?.types ?? [], tags: n.yearOn?.tags ?? [] } });
  out.push({ id: "house.naming.casing", source: own, sentence: n.casing === "supplier" ? "Names are written exactly as the supplier writes them, capitals included." : "A supplier's capitals are cased back into mixed case: TALON 22 PACK becomes Talon 22 Pack.", edit: { kind: "house-choice", path: "naming.casing", label: "Capitals", options: [{ key: "shop", title: "Mixed case", text: "Talon 22 Pack" }, { key: "supplier", title: "As the supplier writes", text: "TALON 22 PACK" }], current: n.casing } });
  out.push({ id: "house.naming.audience", source: own, sentence: n.audience === "front" ? "Men's and Women's go on the front of a title; the handle and tags say so too." : "No gender in a title; the gender goes in the tags, and men's and women's of one model are two products.", edit: { kind: "house-choice", path: "naming.audience", label: "Men's and Women's", options: [{ key: "none", title: "Not in the title", text: "Cyclic Jacket" }, { key: "front", title: "On the front", text: "Men's Cyclic Jacket" }], current: n.audience } });
  out.push({ id: "house.naming.example", source: n.example.trim() ? "you" : "floda", sentence: n.example.trim() ? `A typical title of yours reads ${quote(n.example.trim())}; new titles match that shape.` : "No example title yet: paste one of yours and new titles match its shape.", edit: { kind: "house-text", path: "naming.example", label: "A typical title", placeholder: "Osprey Talon 22 2026" } });
  for (const k of input.house.kinds) {
    if (k.titleFormat.trim()) out.push({ id: `kind.title.${k.type}`, source: "export", sentence: `${k.calledAs || k.type}: titles read like ${quote(k.titleFormat.trim())}.`, edit: { kind: "kind", type: k.type, field: "titleFormat", value: k.titleFormat, label: `How a ${k.calledAs || k.type} title reads` } });
  }
  out.push({ id: "floda.title.page", source: "floda", sentence: "A new product takes the supplier page's own title, and no colour: every colour of a model is one product." });
  return out;
}

function descriptions(input: TeachingInput): Belief[] {
  const d = input.house.descriptions;
  const out: Belief[] = [
    { id: "house.descriptions.format", source: d.format.trim() ? "you" : "floda", sentence: d.format.trim() ? `Descriptions are laid out your way: ${d.format.trim()}` : "Descriptions are laid out the plain way: the maker's paragraphs, then a heading, then the details as a list.", edit: { kind: "house-text", path: "descriptions.format", label: "How a description is laid out", multiline: true, placeholder: "Two short paragraphs, then the specs as a bulleted list. Never mention price or stock." } },
    { id: "house.descriptions.heading", source: d.specsHeading.trim() ? "you" : "floda", sentence: d.specsHeading.trim() ? `The details list is headed ${quote(d.specsHeading.trim())}.` : "The details list has no heading.", edit: { kind: "house-text", path: "descriptions.specsHeading", label: "Heading over the details", placeholder: "Tech Specs" } },
    { id: "house.descriptions.sections", source: d.sections?.length ? "you" : "floda", sentence: d.sections?.length ? `After the details come ${andList(d.sections.map((s) => `${quote(s.heading)} (${s.holds})`))}; a section with nothing for it is left out.` : "No further sections after the details.", edit: { kind: "sections", sections: d.sections ?? [] } },
    { id: "house.descriptions.example", source: d.example.trim() ? "you" : "floda", sentence: d.example.trim() ? "One of your own descriptions is given to the writer as the shape to match." : "No example description yet: paste one of yours and new ones match its shape.", edit: { kind: "house-text", path: "descriptions.example", label: "One of your descriptions, pasted", multiline: true } },
  ];
  if (input.house.notes.trim()) out.push({ id: "house.notes", source: "you", sentence: `Standing instruction on every product: ${input.house.notes.trim()}`, edit: { kind: "house-text", path: "notes", label: "Standing instruction", multiline: true } });
  else out.push({ id: "house.notes", source: "floda", sentence: "No standing instruction. Anything the writer should always do or never do goes here.", edit: { kind: "house-text", path: "notes", label: "Standing instruction", multiline: true, placeholder: "Never say 'premium'. Spell it colour. Mention the warranty." } });
  out.push({ id: "floda.no-invention", source: "floda", sentence: "A writer may only use facts it was given: nothing from the paperwork, the brand's page or your notes is ever made up." });
  return out;
}

function variants(input: TeachingInput): Belief[] {
  const out: Belief[] = [];
  const said = new Set<string>();
  for (const t of input.templates) {
    if (t.scope !== "PRODUCT_TYPE" || !t.optionNames.length) continue;
    said.add(t.matchValue.toLowerCase());
    out.push({ id: `template.options:${t.id}`, source: "export", off: !t.active, sentence: `${t.matchValue} are sold by ${andList(t.optionNames)}, in that order.`, edit: { kind: "template", template: { id: t.id, scope: t.scope, matchValue: t.matchValue, optionNames: t.optionNames, tags: t.tags, productType: t.productType, notes: t.notes ?? "", active: t.active } } });
  }
  for (const t of input.templates) {
    if (t.scope !== "BRAND" || !t.optionNames.length || !t.matchProductType) continue;
    said.add(t.matchProductType.toLowerCase());
    out.push({ id: `template.options:${t.id}`, source: "export", off: !t.active, sentence: `${t.matchValue} ${t.matchProductType} are sold by ${andList(t.optionNames)}, in that order.`, edit: { kind: "template", template: { id: t.id, scope: t.scope, matchValue: t.matchValue, optionNames: t.optionNames, tags: t.tags, productType: t.productType, notes: t.notes ?? "", active: t.active } } });
  }
  // The trade's own plan, for the types this shop has (the pack names many more), the shop's name for each where it has one.
  const shopTypes = [...new Set([...(input.website?.categories.map((c) => c.title) ?? []), ...(input.learned?.types.map((t) => t.type) ?? []), ...input.house.kinds.map((k) => k.calledAs || k.type)])];
  const named = new Map(input.house.kinds.map((k) => [k.type.toLowerCase(), k.calledAs || k.type]));
  const planned = shopTypes.map((type) => ({ type: named.get(type.toLowerCase()) ?? type, plan: input.optionPlan(type).filter((o) => !/^(Title|Add Footprint)/i.test(o)) })).filter((p) => p.plan.length && !said.has(p.type.toLowerCase()));
  for (const { type, plan } of planned.slice(0, 30)) {
    out.push({ id: `plan:${type}`, source: "floda", sentence: `${type}: sold by ${andList(plan)} where the lines vary that way.`, edit: { kind: "template", template: { id: "", scope: "PRODUCT_TYPE", matchValue: type, optionNames: plan, tags: [], productType: "", notes: "", active: true } } });
  }
  if (planned.length > 30) out.push({ id: "plan:more", source: "floda", sentence: `${planned.length - 30} more product types are sold by what their trade sells them by; say otherwise for any of them with Add a rule.` });
  if (!shopTypes.length && !said.size) out.push({ id: "plan:none", source: "floda", sentence: "Each product type is sold by what its trade sells it by: size and colour, a length, a capacity. Read your export and each of your types is listed here with its options.", edit: { kind: "link", href: "#export", label: "Read an export" } });
  const id = input.house.identifiers;
  const own: Source = input.house.savedAt ? "you" : "floda";
  out.push({ id: "house.identifiers.sku", source: own, sentence: id.sku === "supplier" ? "The SKU is the supplier's code for the variant." : id.sku === "barcode" ? "The barcode is written as the SKU." : "SKUs are left empty.", edit: { kind: "house-choice", path: "identifiers.sku", label: "The SKU column", options: [{ key: "supplier", title: "Supplier's code", text: "V2610112.172" }, { key: "barcode", title: "The barcode", text: "4045251234567" }, { key: "none", title: "Empty", text: "Never written" }], current: id.sku } });
  out.push({ id: "house.identifiers.barcode", source: own, sentence: id.barcode === "required" ? "Every variant needs a barcode; one without is flagged." : id.barcode === "keep" ? "A barcode is kept when the paperwork has it, and its check digit is checked." : "Barcodes are never written.", edit: { kind: "house-choice", path: "identifiers.barcode", label: "Barcodes", options: [{ key: "keep", title: "Kept when given", text: "From the paperwork" }, { key: "required", title: "Required", text: "Flagged when missing" }, { key: "none", title: "Never", text: "Left empty" }], current: id.barcode } });
  const w = input.house.weights;
  out.push({ id: "house.weights", source: w.mode === "none" ? "floda" : "you", sentence: w.mode === "none" ? "No shipping weight is written." : w.mode === "fixed" ? `Every variant weighs ${fromGrams(w.fixedGrams, w.unit)} ${w.unit}.` : `Weight by type: ${andList(w.byKind.filter((k) => k.type.trim()).map((k) => `${k.type} ${fromGrams(k.grams, w.unit)} ${w.unit}`)) || "none set yet"}.`, edit: { kind: "weights", weights: w } });
  out.push({ id: "floda.variants.onesize", source: "floda", sentence: "One Size is no size: such a product has no Size option. A supplier's own column that tells lines apart — a scent, a capacity, a zip side — becomes an option." });
  return out;
}

function pricing(input: TeachingInput): Belief[] {
  const { settings } = input;
  const out: Belief[] = [];
  for (const r of [...input.pricingRules].sort((a, b) => b.priority - a.priority)) {
    out.push({ id: `pricing:${r.id}`, source: r.name.startsWith(EXPORT_RULE_PREFIX) ? "export" : "you", off: !r.active, sentence: describePricingRule(r, settings.taxName).replace(/ \(switched off\)$/, ""), edit: { kind: "pricing", rule: r } });
  }
  if (!input.pricingRules.length) out.push({ id: "pricing.none", source: "floda", sentence: "No pricing rule yet: the recommended retail on the paperwork or the brand's page is used as it is." });
  out.push({ id: "setting.ending", source: "you", sentence: `Prices end in ${ENDINGS.find((e) => e.key === settings.defaultRoundTo)?.title.toLowerCase().replace("ending in ", "") ?? settings.defaultRoundTo}.`, edit: { kind: "setting-choice", key: "defaultRoundTo", label: "Price endings", options: ENDINGS, current: settings.defaultRoundTo } });
  out.push({ id: "setting.margin", source: "you", sentence: `A margin under ${settings.minMarginPct}% is flagged. There is no ceiling.`, edit: { kind: "setting-number", key: "minMarginPct", label: "Flag a margin under", suffix: "%" } });
  out.push({ id: "setting.gst", source: "you", sentence: `${settings.taxName} is ${Math.round(settings.gstRate * 1000) / 10}%, and retail prices are written ${settings.pricesIncludeGst ? "inclusive" : "exclusive"} of it.`, edit: { kind: "link", href: "/settings", label: "Change on Settings" } });
  out.push({ id: "floda.below-cost", source: "floda", sentence: "A price under the landed cost is flagged as an error, named at the export, and never silently changed." });
  return out;
}

function seo(input: TeachingInput): Belief[] {
  const { settings, shopName } = input;
  const pattern = settings.seoTitlePattern.trim() || "{title} | {shop}";
  const example = pattern.replace("{title}", "Talon 22 2026").replace("{brand}", "Osprey").replace("{type}", "Backpacks").replace("{shop}", shopName || "your shop");
  return [
    { id: "setting.seoTitlePattern", source: settings.seoTitlePattern.trim() ? "you" : "floda", sentence: `SEO titles follow ${quote(pattern)}: ${quote(example)}. Cut to 60 characters.`, edit: { kind: "setting-text", key: "seoTitlePattern", label: "SEO title pattern ({title}, {brand}, {type}, {shop})", placeholder: "{brand} {title} | {shop}" } },
    { id: "setting.tone", source: "you", sentence: `SEO descriptions are written in this tone: ${settings.seoTone.trim() || "(none set)"}`, edit: { kind: "setting-text", key: "seoTone", label: "Tone", multiline: true } },
    { id: "setting.houseRules", source: settings.houseRules.trim() ? "you" : "floda", sentence: settings.houseRules.trim() ? `House rules fed to the writer: ${settings.houseRules.trim()}` : "No house rules for the writer yet.", edit: { kind: "setting-text", key: "houseRules", label: "House rules for the writer", multiline: true, placeholder: "Always name the model year. Say 'batteries not included' where they are not." } },
    { id: "floda.seo.length", source: "floda", sentence: "SEO descriptions run 120 to 155 characters and say who the product suits." },
  ];
}

function suppliers(input: TeachingInput): Belief[] {
  const out: Belief[] = [];
  for (const s of input.suppliers) {
    const bits = [`costs in ${s.defaultCurrency}`, s.defaultGstTreatment === "INCLUSIVE" ? `inclusive of ${input.settings.taxName}` : s.defaultGstTreatment === "NONE" ? `with no ${input.settings.taxName}` : `exclusive of ${input.settings.taxName}`];
    if (s.defaultBrand?.trim()) bits.push(`the brand is ${s.defaultBrand.trim()} unless the file says otherwise`);
    out.push({ id: `supplier:${s.id}`, source: "you", sentence: `${s.name}: ${bits.join(", ")}.`, edit: { kind: "supplier", supplier: s } });
    for (const l of input.layouts.filter((x) => x.supplier === s.name)) out.push({ id: `layout:${l.id}`, source: "supplier", sentence: describeLayout(l, input.fieldLabels) });
    const r = input.records.find((x) => x.supplierId === s.id);
    if (r && r.share !== null) out.push({ id: `record:${s.id}`, source: "supplier", sentence: describeRecord(r) });
  }
  if (!input.suppliers.length) out.push({ id: "suppliers.none", source: "floda", sentence: "No supplier yet. Drop in one example of each supplier's paperwork and the corrected layout is remembered for them.", edit: { kind: "link", href: "#suppliers", label: "Teach from an invoice" } });
  out.push({ id: "floda.reading.pen", source: "floda", sentence: "Pen on a printed order overrides the print: a quantity, a year, a retail price, a discount, a line struck through." });
  return out;
}

export const AREAS: Array<{ key: AreaKey; title: string; blurb: string }> = [
  { key: "filing", title: "Types, tags and categories", blurb: "Where each product is filed and what it is tagged." },
  { key: "titles", title: "Titles", blurb: "How a product's name is written." },
  { key: "descriptions", title: "Descriptions", blurb: "How the description is laid out and written." },
  { key: "variants", title: "Variants", blurb: "What a product is sold by, and what each variant carries." },
  { key: "pricing", title: "Pricing", blurb: "How a retail price is set from the cost." },
  { key: "seo", title: "SEO titles and descriptions", blurb: "The search text written on every product." },
  { key: "suppliers", title: "Suppliers' invoices", blurb: "How each supplier's paperwork reads." },
];

export function buildAreas(input: TeachingInput): Area[] {
  const by: Record<AreaKey, Belief[]> = { filing: filing(input), titles: titles(input), descriptions: descriptions(input), variants: variants(input), pricing: pricing(input), seo: seo(input), suppliers: suppliers(input) };
  return AREAS.map((a) => ({ ...a, beliefs: by[a.key] }));
}

/** How many beliefs came from the shop or its files, against Flöda's own. */
export function countBeliefs(areas: Area[]): { taught: number; floda: number } {
  let taught = 0;
  let floda = 0;
  for (const a of areas) for (const b of a.beliefs) { if (b.source === "floda") floda++; else taught++; }
  return { taught, floda };
}

/** The kinds as the Titles and Filing areas edit them, for a composer that adds a type's rule. */
export function kindFor(kinds: KindRule[], type: string): KindRule {
  return kinds.find((k) => k.type.toLowerCase() === type.toLowerCase()) ?? { type, calledAs: type, tags: [], variesTags: [], titleFormat: "", count: 0 };
}
