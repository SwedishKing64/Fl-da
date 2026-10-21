/**
 * The rulebook: everything Flöda does to a listing, in the order it does it, as sentences a shop
 * can read.
 *
 * The rules a shop sets live in six stores — the house conventions, the tag rules, the templates,
 * the pricing rules, the supplier layouts, the website — each with a form of its own, and no one
 * place showed the whole. This gathers them into one page by stage (reading, naming, filing,
 * pricing, copy, pictures, checks, export), each rule in plain words with where to change it.
 * Pure: the page loads the stores and hands them in; nothing here reads the database, so the
 * sentences can be tested.
 */

import type { HouseConventions } from "./house";
import type { TagRuleLike } from "./rules";
import { describeTemplate, type ProductTemplateLike } from "./templates";
import type { LearnedVocabulary } from "./taxonomy";
import type { WebsiteCategories } from "./website";
import type { MappingOptions } from "./mapping";
import { describeRecord, type SupplierRecord } from "./supplier-record";
import { MIN_IMAGES, MAX_IMAGES } from "./validate";
import { fromGrams } from "./house";

export type Stage = "reading" | "naming" | "filing" | "pricing" | "copy" | "pictures" | "checks" | "export";

export const STAGES: Array<{ key: Stage; title: string; blurb: string }> = [
  { key: "reading", title: "1. Reading the paperwork", blurb: "How each supplier's invoice, order form or spreadsheet is turned into lines." },
  { key: "naming", title: "2. Naming", blurb: "How a product's title is written." },
  { key: "filing", title: "3. Filing: type, tags and collections", blurb: "Where each product goes on the website and what it is tagged." },
  { key: "pricing", title: "4. Pricing", blurb: "How a retail price is set from the cost, and what counts as too thin." },
  { key: "copy", title: "5. Copy", blurb: "How descriptions and SEO text are written." },
  { key: "pictures", title: "6. Pictures", blurb: "Where pictures come from and how they are prepared." },
  { key: "checks", title: "7. Checks", blurb: "What is flagged on the review grid, and as what." },
  { key: "export", title: "8. Export", blurb: "What leaves for Shopify, and how." },
];

export type RuleSource = "house" | "kind" | "tag" | "template" | "pricing" | "layout" | "supplier" | "website" | "export" | "setting" | "floda";

export interface RuleEntry {
  /** Stable across loads: "house.naming.brand", "tag:<id>", "layout:<id>". */
  id: string;
  stage: Stage;
  /** The rule in plain words. */
  sentence: string;
  source: RuleSource;
  /** Where to change it. Empty for a rule that is Flöda's own and not the shop's to change. */
  editHref: string;
  /** A tag rule's row, so the page can switch it off, delete it or try it on a batch. */
  tagRuleId?: string;
  active?: boolean;
}

export interface PricingRuleLike {
  id: string;
  name: string;
  scope: string;
  matchValue: string;
  mode: string;
  percent: number;
  roundTo: string;
  priority: number;
  active: boolean;
}

export interface LayoutLike {
  id: string;
  supplier: string;
  name: string;
  mappings: Record<string, string>;
  options: MappingOptions;
}

export interface SupplierLike {
  id: string;
  name: string;
  defaultCurrency: string;
  defaultGstTreatment: string;
  defaultBrand: string | null;
}

export interface RulebookInput {
  house: HouseConventions;
  tagRules: TagRuleLike[];
  templates: ProductTemplateLike[];
  pricingRules: PricingRuleLike[];
  layouts: LayoutLike[];
  suppliers: SupplierLike[];
  records: SupplierRecord[];
  website: WebsiteCategories | null;
  learned: LearnedVocabulary | null;
  settings: { minMarginPct: number; defaultRoundTo: string; gstRate: number; pricesIncludeGst: boolean; seoTone: string; houseRules: string; taxName: string };
  /** Pictures kept here come out with an address Shopify can fetch. */
  pictureHosting: boolean;
  /** Canonical field key → the label a person sees. */
  fieldLabels: Record<string, string>;
}

export interface RulebookStage {
  key: Stage;
  title: string;
  blurb: string;
  rules: RuleEntry[];
}

const HOUSE = "/training#house";
const SOURCE_WORDS: Record<RuleSource, string> = {
  house: "how you list", kind: "a kind of product", tag: "tag rule", template: "template", pricing: "pricing rule", layout: "supplier layout",
  supplier: "supplier", website: "your website", export: "your export", setting: "setting", floda: "Flöda",
};

/** The source of a rule in a word or two, for a badge. */
export function sourceWord(source: RuleSource): string {
  return SOURCE_WORDS[source];
}

const list = (s: string | string[]): string[] => (Array.isArray(s) ? s : s.split(",")).map((t) => t.trim()).filter(Boolean);
const quote = (s: string) => `"${s}"`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What a tag rule's pattern reads as: a plain word when it is one, otherwise the pattern itself. */
function patternWords(pattern: string): string {
  const p = pattern.trim();
  const anchored = p.match(/^\^(.*)\$$/);
  const body = (anchored ? anchored[1] : p).replace(/\\([.*+?^${}()|[\]\\])/g, "$1");
  const plain = !/[.*+?^${}()|[\]\\]/.test(body);
  if (plain && anchored) return `is exactly ${quote(body)}`;
  if (plain) return `contains ${quote(body)}`;
  // \b(women'?s|womens)\b → one of "women's", "womens"
  const alternatives = p.replace(/^\\b\(?|\)?\\b$/g, "").split("|").map((a) => a.replace(/\\b/g, "").replace(/\\/g, ""));
  if (alternatives.length > 1 && alternatives.every((a) => !/[()[\]{}*+^$]/.test(a))) return `says ${alternatives.map((a) => quote(a.replace(/'\?/g, "'"))).join(" or ")}`;
  return `matches the pattern ${quote(p)}`;
}

const FIELD_WORDS: Record<string, string> = { any: "anything about the product", title: "the title", brand: "the brand", category: "the category", productType: "the type", sku: "the SKU", tags: "a tag" };

/** A tag rule as a sentence: "When the brand contains "Burton": add the tags a, b; file it under Snowboards." */
export function describeTagRule(rule: TagRuleLike): string {
  const does: string[] = [];
  const tags = list(rule.addTags);
  const collections = list(rule.addCollections);
  const metafields = typeof rule.setMetafields === "string" ? safeJson(rule.setMetafields) : rule.setMetafields;
  if (tags.length) does.push(`add the tag${tags.length === 1 ? "" : "s"} ${tags.join(", ")}`);
  if (collections.length) does.push(`put it in ${collections.join(", ")}`);
  if (rule.setProductType.trim()) does.push(`file it as ${quote(rule.setProductType.trim())}`);
  const fields = Object.entries(metafields).filter(([, v]) => String(v).trim());
  if (fields.length) does.push(`set ${fields.map(([k, v]) => `${k.replace(/\s*\(.*\)$/, "")} to ${quote(String(v))}`).join(", ")}`);
  const when = `When ${FIELD_WORDS[rule.matchField] ?? "anything about the product"} ${patternWords(rule.pattern)}`;
  return `${when}: ${does.length ? does.join("; ") : "nothing yet"}.${rule.active ? "" : " (switched off)"}`;
}

function safeJson(s: string): Record<string, string> {
  try { const v = JSON.parse(s); return v && typeof v === "object" ? v : {}; } catch { return {}; }
}

const SCOPE_WORDS: Record<string, (v: string) => string> = {
  DEFAULT: () => "Everything else",
  CATEGORY: (v) => `${v || "a category"}`,
  BRAND: (v) => `${v || "a brand"}`,
  PRODUCT: (v) => `The product ${v}`,
};

/** A pricing rule as a sentence: "Burton: 40% margin on the ex-GST price, ending in .99." */
export function describePricingRule(rule: PricingRuleLike, taxName = "GST"): string {
  const who = (SCOPE_WORDS[rule.scope] ?? SCOPE_WORDS.DEFAULT)(rule.matchValue);
  const how = rule.mode === "MARKUP" ? `${rule.percent}% markup on the landed cost` : `${rule.percent}% margin on the ex-${taxName} price`;
  const ending = rule.roundTo === "NONE" ? "not rounded" : `ending in ${rule.roundTo}`;
  return `${who}: ${how}, ${ending}.${rule.active ? "" : " (switched off)"}`;
}

/** A supplier's layout as a sentence: 'Burton – XLSX layout: "Item" is the SKU, "W/S" is the cost; 3 columns ignored.' */
export function describeLayout(layout: LayoutLike, fieldLabels: Record<string, string>): string {
  const taken = Object.entries(layout.mappings).filter(([, field]) => field);
  const ignored = Object.entries(layout.mappings).filter(([, field]) => !field).length;
  // A label in running text: "Brand / vendor" reads as "brand / vendor", but "SKU" stays "SKU".
  const inText = (label: string) => (label.length > 1 && label[1] === label[1].toLowerCase() ? label[0].toLowerCase() + label.slice(1) : label);
  const parts = taken.slice(0, 6).map(([column, field]) => `${quote(column)} is the ${inText(fieldLabels[field] ?? field)}`);
  const more = taken.length > 6 ? `, and ${taken.length - 6} more` : "";
  const fixed = Object.entries(layout.options.fixed ?? {}).filter(([, v]) => String(v ?? "").trim()).map(([k, v]) => `${inText(fieldLabels[k] ?? k)} is always ${quote(String(v))}`);
  const extras = [ignored ? `${plural(ignored, "column")} ignored` : "", layout.options.costIsLineTotal ? "costs are line totals, divided by the quantity" : "", ...fixed].filter(Boolean);
  // A layout is usually named after its supplier already ("Burton – XLSX layout"); say the name once.
  const who = layout.name.toLowerCase().startsWith(layout.supplier.toLowerCase()) ? layout.name : `${layout.supplier}, ${layout.name}`;
  return `${who}: ${parts.join(", ")}${more}${extras.length ? `; ${extras.join("; ")}` : ""}.`;
}

function naming(house: HouseConventions): RuleEntry[] {
  const n = house.naming;
  const out: RuleEntry[] = [
    { id: "house.naming.brand", stage: "naming", source: "house", editHref: HOUSE, sentence: n.brandInTitle === "always" ? "Titles lead with the brand." : "Titles leave the brand out; it goes in the Vendor column and the SEO title." },
    { id: "house.naming.season", stage: "naming", source: "house", editHref: HOUSE, sentence: n.season === "always" ? "Every title ends with the model year." : n.season === "never" ? "Titles never carry a model year." : "Kinds that carry a year tag get the model year at the end of the title; others do not." },
    { id: "house.naming.casing", stage: "naming", source: "house", editHref: HOUSE, sentence: n.casing === "supplier" ? "Names are written exactly as the supplier writes them, capitals included." : "A supplier's capitals are cased back into the shop's own mixed case." },
  ];
  if (n.example.trim()) out.push({ id: "house.naming.example", stage: "naming", source: "house", editHref: HOUSE, sentence: `A typical title reads ${quote(n.example.trim())}; new titles match that shape.` });
  for (const k of house.kinds) {
    if (k.titleFormat.trim()) out.push({ id: `kind.title.${k.type}`, stage: "naming", source: "kind", editHref: "/training#export", sentence: `${k.calledAs || k.type}: titles read like ${quote(k.titleFormat.trim())}.` });
  }
  return out;
}

function filing(input: RulebookInput): RuleEntry[] {
  const out: RuleEntry[] = [];
  const { house, website, learned } = input;
  if (website && website.categories.length) {
    out.push({ id: "website.types", stage: "filing", source: "website", editHref: "/training#website", sentence: `Your website's ${plural(website.categories.length, "category", "categories")} are the kinds of product; a Type outside them is flagged and never invented by a reader.` });
  } else if (learned && learned.types.length) {
    out.push({ id: "learned.types", stage: "filing", source: "export", editHref: "/training#export", sentence: `Your export taught ${plural(learned.types.length, "kind")} of product; a Type outside them is flagged.` });
  } else {
    out.push({ id: "types.none", stage: "filing", source: "website", editHref: "/training#website", sentence: "No kinds of product yet: plug in your website or read an export, and the Type on every listing is picked from that list." });
  }
  if (learned?.sections.length) out.push({ id: "learned.sections", stage: "filing", source: "export", editHref: "/training#export", sentence: `Menu tags that run across kinds: ${learned.sections.join(", ")}. A product gets its kind's menu tag as well as its own.` });
  for (const k of house.kinds) {
    const bits: string[] = [];
    if (k.calledAs && k.calledAs !== k.type) bits.push(`what an export calls ${quote(k.type)} is filed as ${quote(k.calledAs)}`);
    if (k.tags.length) bits.push(`every one is tagged ${k.tags.join(", ")}`);
    if (bits.length) out.push({ id: `kind.filing.${k.type}`, stage: "filing", source: "kind", editHref: "/training#export", sentence: `${k.calledAs || k.type}: ${bits.join("; ")}.` });
  }
  out.push({ id: "floda.tags.closed", stage: "filing", source: "floda", editHref: "", sentence: "Tags are matched, never invented: a tag your shop has never used is taken off the product and proposed to you on this page; approved, it is one of yours from then on." });
  const kindRule = (r: TagRuleLike) => /^kind: /.test(r.name);
  for (const r of [...input.tagRules].sort((a, b) => b.priority - a.priority)) {
    if (kindRule(r)) continue; // said above, by the kind
    out.push({ id: `tag:${r.id}`, stage: "filing", source: "tag", editHref: /^house: /.test(r.name) ? HOUSE : "", tagRuleId: r.id, active: r.active, sentence: describeTagRule(r) });
  }
  for (const t of input.templates) {
    const who = t.scope === "BRAND" ? t.matchValue : t.scope === "PRODUCT_TYPE" ? `the kind ${t.matchValue}` : `the category ${t.matchValue}`;
    const narrowed = t.matchProductType ? ` (${t.matchProductType})` : "";
    out.push({ id: `template:${t.id}`, stage: "filing", source: "template", editHref: "/training#export", sentence: `${who}${narrowed}, from your export: ${describeTemplate(t)}.${t.active ? "" : " (switched off)"}` });
  }
  return out;
}

function pricing(input: RulebookInput): RuleEntry[] {
  const { settings } = input;
  const out: RuleEntry[] = [];
  for (const r of [...input.pricingRules].sort((a, b) => b.priority - a.priority)) {
    out.push({ id: `pricing:${r.id}`, stage: "pricing", source: "pricing", editHref: "/pricing", sentence: describePricingRule(r, settings.taxName) });
  }
  if (!input.pricingRules.length) out.push({ id: "pricing.none", stage: "pricing", source: "pricing", editHref: "/pricing", sentence: `No pricing rule yet: the recommended retail from the paperwork or the brand's site is used as it is, ending in ${settings.defaultRoundTo}.` });
  out.push({ id: "setting.gst", stage: "pricing", source: "setting", editHref: "/settings", sentence: `${settings.taxName} is ${Math.round(settings.gstRate * 1000) / 10}%, and retail prices are written ${settings.pricesIncludeGst ? "inclusive" : "exclusive"} of it.` });
  out.push({ id: "setting.margin", stage: "pricing", source: "setting", editHref: "/pricing", sentence: `A margin under ${settings.minMarginPct}% is flagged as a warning. There is no ceiling.` });
  out.push({ id: "floda.below-cost", stage: "pricing", source: "floda", editHref: "", sentence: "A price under the landed cost is flagged as an error, named at the export, and never silently changed." });
  return out;
}

function copy(input: RulebookInput): RuleEntry[] {
  const { house, settings } = input;
  const out: RuleEntry[] = [];
  const d = house.descriptions;
  out.push({ id: "house.descriptions.format", stage: "copy", source: "house", editHref: HOUSE, sentence: d.format.trim() ? `Descriptions are laid out your way: ${d.format.trim()}` : "Descriptions are laid out the plain way: the manufacturer's paragraphs, then a heading, then the details as a list." });
  out.push({ id: "house.descriptions.heading", stage: "copy", source: "house", editHref: HOUSE, sentence: d.specsHeading.trim() ? `The details list is headed ${quote(d.specsHeading.trim())}.` : "The details list has no heading." });
  if (d.example.trim()) out.push({ id: "house.descriptions.example", stage: "copy", source: "house", editHref: HOUSE, sentence: "One of your own descriptions is given to the writer as the shape to match." });
  out.push({ id: "setting.tone", stage: "copy", source: "setting", editHref: "/settings", sentence: `SEO text is written in this tone: ${settings.seoTone.trim() || "(none set)"}` });
  out.push({ id: "floda.no-invention", stage: "copy", source: "floda", editHref: "", sentence: "A writer may only use facts it was given: nothing from the paperwork, the brand's page or your notes is ever made up." });
  if (house.notes.trim()) out.push({ id: "house.notes", stage: "copy", source: "house", editHref: HOUSE, sentence: `Standing instruction on every product: ${house.notes.trim()}` });
  if (settings.houseRules.trim()) out.push({ id: "setting.houseRules", stage: "copy", source: "setting", editHref: "/settings", sentence: `House rules fed to the writer: ${settings.houseRules.trim()}` });
  for (const t of input.templates) {
    if (t.notes?.trim()) out.push({ id: `template.notes:${t.id}`, stage: "copy", source: "template", editHref: "/training#export", sentence: `${t.matchValue}: ${t.notes.trim()}` });
  }
  return out;
}

function pictures(input: RulebookInput): RuleEntry[] {
  return [
    { id: "floda.pictures.source", stage: "pictures", source: "floda", editHref: "", sentence: "Pictures come from the brand's own page for the product (a link beside it, or the web lookup), picked by number from that page, never from an address a reader made up." },
    { id: "floda.pictures.colour", stage: "pictures", source: "floda", editHref: "", sentence: "Where a colour was ordered, pictures showing another colour are left out; a picture that cannot be told apart is kept." },
    { id: "floda.pictures.frame", stage: "pictures", source: "floda", editHref: "", sentence: "Every picture is set on a square with the product filling the same share of it and centred, so a listing built from three sites looks like one listing." },
    { id: "floda.pictures.hosting", stage: "pictures", source: "floda", editHref: input.pictureHosting ? "" : "/settings", sentence: input.pictureHosting ? "Framed pictures are kept where Shopify can fetch them." : "There is nowhere public to keep framed copies, so the brand's own picture addresses stay on the listing as they are." },
    { id: "floda.pictures.count", stage: "pictures", source: "floda", editHref: "", sentence: `Aim for ${MIN_IMAGES} to ${MAX_IMAGES} pictures; fewer is a nudge on the review grid, not an error.` },
  ];
}

function checks(input: RulebookInput): RuleEntry[] {
  const id = input.house.identifiers;
  const w = input.house.weights;
  const out: RuleEntry[] = [
    { id: "house.identifiers.sku", stage: "checks", source: "house", editHref: HOUSE, sentence: id.sku === "supplier" ? "The SKU column carries the supplier's code; a variant without one is a warning." : id.sku === "barcode" ? "The barcode is used as the SKU." : "SKUs are not used; the column is left empty and never flagged." },
    { id: "house.identifiers.barcode", stage: "checks", source: "house", editHref: HOUSE, sentence: id.barcode === "required" ? "Every variant needs a barcode; one without is flagged." : id.barcode === "keep" ? "A barcode is kept when the paperwork has it, and checked: a wrong check digit is an error." : "Barcodes are never written." },
    { id: "house.weights", stage: "checks", source: "house", editHref: HOUSE, sentence: w.mode === "none" ? "No shipping weight is written." : w.mode === "fixed" ? `Every variant weighs ${fromGrams(w.fixedGrams, w.unit)} ${w.unit}.` : `Weight by kind: ${w.byKind.filter((k) => k.type.trim()).map((k) => `${k.type} ${fromGrams(k.grams, w.unit)} ${w.unit}`).join(", ") || "none set yet"}.` },
    { id: "floda.checks.hard", stage: "checks", source: "floda", editHref: "", sentence: "Errors: a barcode with a wrong check digit, SKU and barcode columns swapped, a price under cost, a product that could be one of several in your shop, a Type you do not have. Named at the export; none of them stops it." },
    { id: "floda.checks.soft", stage: "checks", source: "floda", editHref: "", sentence: "Warnings: no price, no cost, no picture, no description, a thin margin, a duplicate SKU in Shopify. Each can be dismissed on the review grid." },
  ];
  return out;
}

function reading(input: RulebookInput): RuleEntry[] {
  const out: RuleEntry[] = [];
  for (const s of input.suppliers) {
    const bits = [`costs in ${s.defaultCurrency}`, s.defaultGstTreatment === "INCLUSIVE" ? `inclusive of ${input.settings.taxName}` : s.defaultGstTreatment === "NONE" ? `with no ${input.settings.taxName}` : `exclusive of ${input.settings.taxName}`];
    if (s.defaultBrand?.trim()) bits.push(`the brand is ${s.defaultBrand.trim()} unless the file says otherwise`);
    out.push({ id: `supplier:${s.id}`, stage: "reading", source: "supplier", editHref: "/training#suppliers", sentence: `${s.name}: ${bits.join(", ")}.` });
  }
  for (const l of input.layouts) out.push({ id: `layout:${l.id}`, stage: "reading", source: "layout", editHref: "/training#suppliers", sentence: describeLayout(l, input.fieldLabels) });
  for (const r of input.records) {
    if (r.share !== null) out.push({ id: `record:${r.supplierId}`, stage: "reading", source: "supplier", editHref: "/training#suppliers", sentence: describeRecord(r) });
  }
  if (!input.suppliers.length) out.push({ id: "suppliers.none", stage: "reading", source: "supplier", editHref: "/training#suppliers", sentence: "No supplier yet. Drop in one example of each supplier's paperwork and the corrected layout is remembered for them." });
  out.push({ id: "floda.reading.pen", stage: "reading", source: "floda", editHref: "", sentence: "Pen on a printed order is the shop's own instruction and overrides the print: a quantity, a year, a retail price, a discount, a line struck through." });
  out.push({ id: "floda.reading.lighter", stage: "reading", source: "floda", editHref: "", sentence: "A supplier whose paperwork reads clean (one finished import, under a fifth of products changed after reading) is read on the lighter model at about half the cost; one that starts reading badly goes back." });
  return out;
}

function exporting(): RuleEntry[] {
  return [
    { id: "floda.export.drafts", stage: "export", source: "floda", editHref: "", sentence: "Products leave as drafts, so each can be checked in Shopify before it goes live." },
    { id: "floda.export.split", stage: "export", source: "floda", editHref: "", sentence: "One CSV per brand or per kind of product, as each batch is set; split again only where Shopify's size limit needs it." },
    { id: "floda.export.repair", stage: "export", source: "floda", editHref: "", sentence: "What Shopify would reject is repaired on the way out and listed: a missing title, a bad handle, a SKU on two variants, a picture at an address Shopify cannot fetch. Nothing stops the export." },
    { id: "floda.export.push", stage: "export", source: "floda", editHref: "/settings", sentence: "A push straight to the live store needs the warnings reviewed and a tick, and can be rolled back." },
  ];
}

/** The whole rulebook, by stage, from what the shop has set and what Flöda does on its own. */
export function buildRulebook(input: RulebookInput): RulebookStage[] {
  const all = [...reading(input), ...naming(input.house), ...filing(input), ...pricing(input), ...copy(input), ...pictures(input), ...checks(input), ...exporting()];
  return STAGES.map((s) => ({ ...s, rules: all.filter((r) => r.stage === s.key) }));
}

/** How many rules the shop set itself, against the ones that are Flöda's own. */
export function countRules(stages: RulebookStage[]): { shop: number; floda: number } {
  let shop = 0;
  let floda = 0;
  for (const s of stages) for (const r of s.rules) {
    if (r.source === "floda") floda++;
    else shop++;
  }
  return { shop, floda };
}
