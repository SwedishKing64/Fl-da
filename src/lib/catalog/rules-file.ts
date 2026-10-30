/**
 * Everything a shop has taught Flöda, as one file: its listing habits and kinds, its tag rules,
 * pricing rules and templates, what its export and website taught, its writer settings and the
 * parts it packages products with. The shop downloads it to keep or to send to support; support sends one back with the
 * rules fixed, and loading it puts those in place. No batch, product, picture or staff account is
 * in it, and no supplier's prices. Pure: this is the shape and its cleaning; actions.ts reads and
 * writes the stores.
 */

import { cleanHouse, type HouseConventions } from "./house";
import type { LearnedVocabulary } from "./taxonomy";
import type { WebsiteCategories } from "./website";
import type { PackageTerms } from "./types";

export const RULES_FILE_KIND = "floda-rules";
export const RULES_FILE_VERSION = 1;

export interface RulesFile {
  kind: typeof RULES_FILE_KIND;
  version: number;
  shop: string;
  exportedAt: string;
  house?: HouseConventions;
  tagRules?: Array<{ name: string; matchField: string; pattern: string; addTags: string; addCollections: string; setProductType: string; setMetafields: string; priority: number; active: boolean }>;
  pricingRules?: Array<{ name: string; scope: string; matchValue: string; mode: string; percent: number; roundTo: string; priority: number; active: boolean }>;
  templates?: Array<{ name: string; scope: string; matchValue: string; matchProductType: string; notes: string; sourceFileName: string; productCount: number; setProductType: string; addTags: string; addCollections: string; optionNames: string; setMetafields: string; priority: number; active: boolean }>;
  learned?: LearnedVocabulary | null;
  website?: WebsiteCategories | null;
  settings?: Partial<{ seoTone: string; seoTitlePattern: string; houseRules: string; defaultRoundTo: string; minMarginPct: number; packages: PackageTerms }>;
  /** The parts a product can be packaged with (the list on Settings), each with its retail and wholesale. */
  packageParts?: Array<{ name: string; rrp: number; cost: number | null }>;
}

const str = (v: unknown, max: number) => String(v ?? "").slice(0, max);
const num = (v: unknown, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const bool = (v: unknown, fallback = true) => (typeof v === "boolean" ? v : fallback);
const list = <T>(v: unknown, max: number, clean: (x: Record<string, unknown>) => T | null): T[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const out: T[] = [];
  for (const x of v.slice(0, max)) {
    if (!x || typeof x !== "object") continue;
    const c = clean(x as Record<string, unknown>);
    if (c) out.push(c);
  }
  return out;
};

/** What a file says, made safe to keep; null where it is not a rules file at all. Each section is present only where the file had it. */
export function cleanRulesFile(input: unknown): RulesFile | null {
  if (!input || typeof input !== "object") return null;
  const f = input as Record<string, unknown>;
  if (f.kind !== RULES_FILE_KIND) return null;
  const out: RulesFile = { kind: RULES_FILE_KIND, version: num(f.version, 1), shop: str(f.shop, 120), exportedAt: str(f.exportedAt, 40) };
  if (f.house && typeof f.house === "object") out.house = cleanHouse(f.house as Partial<HouseConventions>);
  const tagRules = list(f.tagRules, 500, (r) => {
    const pattern = str(r.pattern, 200).trim();
    if (!pattern) return null;
    return { name: str(r.name, 160) || pattern, matchField: str(r.matchField, 40) || "any", pattern, addTags: str(r.addTags, 2000), addCollections: str(r.addCollections, 2000), setProductType: str(r.setProductType, 120), setMetafields: typeof r.setMetafields === "string" ? r.setMetafields.slice(0, 4000) : JSON.stringify(r.setMetafields ?? {}), priority: Math.round(num(r.priority)), active: bool(r.active) };
  });
  if (tagRules) out.tagRules = tagRules;
  const pricingRules = list(f.pricingRules, 200, (r) => {
    const scope = ["DEFAULT", "CATEGORY", "BRAND", "PRODUCT"].includes(String(r.scope)) ? String(r.scope) : "DEFAULT";
    const mode = r.mode === "MARKUP" ? "MARKUP" : "MARGIN";
    const percent = num(r.percent, -1);
    if (percent < 0 || percent > 999 || (mode === "MARGIN" && percent >= 100)) return null;
    return { name: str(r.name, 160) || scope, scope, matchValue: str(r.matchValue, 160), mode, percent, roundTo: ["NONE", "0.99", "0.95", "1.00", "5.00", "10.00"].includes(String(r.roundTo)) ? String(r.roundTo) : "0.99", priority: Math.round(num(r.priority)), active: bool(r.active) };
  });
  if (pricingRules) out.pricingRules = pricingRules;
  const templates = list(f.templates, 2000, (t) => {
    const matchValue = str(t.matchValue, 120).trim();
    if (!matchValue) return null;
    return { name: str(t.name, 160) || matchValue, scope: ["BRAND", "PRODUCT_TYPE", "CATEGORY"].includes(String(t.scope)) ? String(t.scope) : "BRAND", matchValue, matchProductType: str(t.matchProductType, 120), notes: str(t.notes, 4000), sourceFileName: str(t.sourceFileName, 160), productCount: Math.max(0, Math.round(num(t.productCount))), setProductType: str(t.setProductType, 120), addTags: str(t.addTags, 2000), addCollections: str(t.addCollections, 2000), optionNames: str(t.optionNames, 200), setMetafields: typeof t.setMetafields === "string" ? t.setMetafields.slice(0, 4000) : JSON.stringify(t.setMetafields ?? {}), priority: Math.round(num(t.priority)), active: bool(t.active) };
  });
  if (templates) out.templates = templates;
  if ("learned" in f) out.learned = f.learned && typeof f.learned === "object" && Array.isArray((f.learned as LearnedVocabulary).types) ? (f.learned as LearnedVocabulary) : null;
  if ("website" in f) out.website = f.website && typeof f.website === "object" && Array.isArray((f.website as WebsiteCategories).categories) ? (f.website as WebsiteCategories) : null;
  if (f.settings && typeof f.settings === "object") {
    const s = f.settings as Record<string, unknown>;
    const settings: NonNullable<RulesFile["settings"]> = {};
    if (typeof s.seoTone === "string") settings.seoTone = s.seoTone.slice(0, 4000);
    if (typeof s.seoTitlePattern === "string") settings.seoTitlePattern = s.seoTitlePattern.slice(0, 200);
    if (typeof s.houseRules === "string") settings.houseRules = s.houseRules.slice(0, 8000);
    if (typeof s.defaultRoundTo === "string" && ["NONE", "0.99", "0.95", "1.00", "5.00", "10.00"].includes(s.defaultRoundTo)) settings.defaultRoundTo = s.defaultRoundTo;
    if (Number.isFinite(Number(s.minMarginPct))) settings.minMarginPct = Math.min(100, Math.max(0, Number(s.minMarginPct)));
    if (s.packages && typeof s.packages === "object") {
      const p = s.packages as Record<string, unknown>;
      settings.packages = { drillMountFee: Math.max(0, num(p.drillMountFee)), systemMountFee: Math.max(0, num(p.systemMountFee)), fittingMount: str(p.fittingMount, 80), fittingNoMount: str(p.fittingNoMount, 80) };
    }
    out.settings = settings;
  }
  const packageParts = list(f.packageParts, 200, (b) => {
    const name = str(b.name, 120).trim();
    const rrp = num(b.rrp, -1);
    if (!name || rrp <= 0) return null;
    return { name, rrp, cost: b.cost === null || b.cost === undefined ? null : Math.max(0, num(b.cost)) };
  });
  if (packageParts) out.packageParts = packageParts;
  return out;
}

/** What a file holds, in a line: "12 tag rules, 4 pricing rules, 31 templates, …". */
export function describeRulesFile(f: RulesFile): string {
  const parts: string[] = [];
  if (f.house) parts.push(`listing habits and ${f.house.kinds.length} product type${f.house.kinds.length === 1 ? "" : "s"}`);
  if (f.tagRules) parts.push(`${f.tagRules.length} tag rule${f.tagRules.length === 1 ? "" : "s"}`);
  if (f.pricingRules) parts.push(`${f.pricingRules.length} pricing rule${f.pricingRules.length === 1 ? "" : "s"}`);
  if (f.templates) parts.push(`${f.templates.length} template${f.templates.length === 1 ? "" : "s"}`);
  if (f.learned) parts.push(`what the export taught (${f.learned.types.length} types)`);
  if (f.website) parts.push(`the website's ${f.website.categories.length} categories`);
  if (f.settings) parts.push("writer settings");
  if (f.packageParts) parts.push(`${f.packageParts.length} package part${f.packageParts.length === 1 ? "" : "s"}`);
  return parts.length ? parts.join(", ") : "nothing";
}
