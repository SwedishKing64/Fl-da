/**
 * A trade pack as files: what a research agent hands back for a trade (docs/KNOWLEDGE-PROMPT.md)
 * is the pack itself, loaded and checked here.
 *
 *   pack.json             the menu, tag spellings, and each kind's Shopify category
 *   kinds.json            each kind of product: what suppliers call it, what it varies by, its specs
 *   sizes.json            the size systems the trade uses, in order, with every way they are written
 *   colours.json          the colour shorthand the trade's suppliers print
 *   reader-examples.json  lines as they are printed and how they read
 *
 * A pack holds only what is true of a whole trade and slow to change. A supplier's invoice layout,
 * a brand's colour-code table or one supplier's prepacks are never pack material: those are learned
 * from the shop's own documents, the same way in every trade.
 */

import { z } from "zod";
import { categoryById, categoryByPath, type TaxonomyCategory } from "../shopify-taxonomy";
import type { TaxonomySection } from "../taxonomy";
import { GENERAL_METAFIELDS } from "../types";
import type { TradePack } from "./types";

const Tree = z.array(z.object({ top: z.string().min(1), groups: z.array(z.object({ heading: z.string().min(1), leaves: z.array(z.string()) })) }));

export const PackFile = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/, "a lowercase id with hyphens, like bike"),
  name: z.string().min(1),
  sells: z.string().min(1),
  /** False until the pack has been scored on real documents from a pilot shop in the trade. */
  verified: z.boolean().default(false),
  tree: Tree,
  tagSpelling: z.record(z.string(), z.string()).default({}),
  /** Each kind's Shopify Standard Product Taxonomy category, as its id or its full path. */
  shopifyTaxonomy: z.record(z.string(), z.string()).default({}),
});

export const KindFile = z.array(z.object({
  kind: z.string().min(1),
  supplierWords: z.array(z.string()).default([]),
  options: z.array(z.object({ name: z.string().min(1), system: z.string().optional(), examples: z.array(z.string()).default([]) })).default([]),
  optionOrder: z.array(z.string()).default([]),
  notOptions: z.array(z.string()).default([]),
  specFields: z.array(z.object({ name: z.string().min(1), unit: z.string().optional(), example: z.string().optional() })).default([]),
  titleExample: z.string().optional(),
  codeHints: z.string().optional(),
  confidence: z.enum(["high", "medium", "low"]).default("medium"),
}));

export const SizeFile = z.array(z.object({
  system: z.string().min(1),
  appliesTo: z.array(z.string()).default([]),
  order: z.array(z.string()).min(1),
  writtenAs: z.record(z.string(), z.array(z.string())).default({}),
  convertsTo: z.record(z.string(), z.record(z.string(), z.string())).optional(),
  source: z.string().default(""),
}));

export const ColourFile = z.array(z.object({ code: z.string().min(1), name: z.string().min(1) }));

export const ExamplesFile = z.array(z.string().min(1));

export type KindKnowledge = z.infer<typeof KindFile>[number];
export type SizeSystem = z.infer<typeof SizeFile>[number];

/** What a pack knows beyond its menu: kinds, sizes and colour shorthand. */
export interface PackKnowledge {
  verified: boolean;
  kinds: KindKnowledge[];
  sizes: SizeSystem[];
  colours: Record<string, string>;
}

export interface PackFiles {
  pack: unknown;
  kinds?: unknown;
  sizes?: unknown;
  colours?: unknown;
  readerExamples?: unknown;
}

/** A Shopify category named by its id or its full path. */
export function categoryNamed(idOrPath: string): TaxonomyCategory | null {
  return categoryById(idOrPath) ?? categoryByPath(idOrPath);
}

/** Every kind a menu names: each heading and each leaf. */
export const kindsOf = (tree: TaxonomySection[]): string[] => Array.from(new Set(tree.flatMap((s) => s.groups.flatMap((g) => [g.heading, ...g.leaves]))));

/**
 * What is wrong with a pack's files, in plain words. Empty when it loads and holds together: every
 * file in shape, every kind described is on the menu, every size system a kind names is defined,
 * and every Shopify category named exists.
 */
export function checkPack(files: PackFiles): string[] {
  const problems: string[] = [];
  const parse = <T>(name: string, schema: z.ZodType<T>, value: unknown): T | null => {
    const r = schema.safeParse(value);
    if (r.success) return r.data;
    for (const issue of r.error.issues.slice(0, 10)) problems.push(`${name}: ${issue.path.join(".") || "(top)"} — ${issue.message}`);
    return null;
  };
  const pack = parse("pack.json", PackFile, files.pack);
  const kinds = files.kinds === undefined ? [] : parse("kinds.json", KindFile, files.kinds) ?? [];
  const sizes = files.sizes === undefined ? [] : parse("sizes.json", SizeFile, files.sizes) ?? [];
  if (files.colours !== undefined) parse("colours.json", ColourFile, files.colours);
  if (files.readerExamples !== undefined) parse("reader-examples.json", ExamplesFile, files.readerExamples);
  if (!pack) return problems;
  const menu = new Set(kindsOf(pack.tree).map((k) => k.toLowerCase()));
  for (const k of kinds) if (!menu.has(k.kind.toLowerCase())) problems.push(`kinds.json: "${k.kind}" is not on pack.json's menu.`);
  const systems = new Set(sizes.map((s) => s.system));
  for (const k of kinds) for (const o of k.options) if (o.system && !systems.has(o.system)) problems.push(`kinds.json: "${k.kind}" uses size system "${o.system}", which sizes.json does not define.`);
  for (const [kind, where] of Object.entries(pack.shopifyTaxonomy)) {
    if (!menu.has(kind.toLowerCase())) problems.push(`pack.json: shopifyTaxonomy places "${kind}", which is not on the menu.`);
    if (!categoryNamed(where)) problems.push(`pack.json: "${where}" (for ${kind}) is not a Shopify category.`);
  }
  for (const kind of kindsOf(pack.tree)) if (!Object.keys(pack.shopifyTaxonomy).some((k) => k.toLowerCase() === kind.toLowerCase())) problems.push(`pack.json: "${kind}" has no Shopify category.`);
  return problems;
}

/** A pack's files as the pack the engine runs on. Throws, with what is wrong, where they do not check out. */
export function packFromFiles(files: PackFiles): TradePack {
  const problems = checkPack(files);
  if (problems.length) throw new Error(`The pack does not check out:\n${problems.join("\n")}`);
  const pack = PackFile.parse(files.pack);
  const kinds = files.kinds === undefined ? [] : KindFile.parse(files.kinds);
  const sizes = files.sizes === undefined ? [] : SizeFile.parse(files.sizes);
  const colours = files.colours === undefined ? [] : ColourFile.parse(files.colours);
  const readerExamples = files.readerExamples === undefined ? [] : ExamplesFile.parse(files.readerExamples);
  const shopifyCategories = Object.fromEntries(Object.entries(pack.shopifyTaxonomy).map(([kind, where]) => [kind, categoryNamed(where)!.id]));
  return {
    id: pack.id,
    name: pack.name,
    sells: pack.sells,
    tree: pack.tree,
    tagSpelling: pack.tagSpelling,
    tagAlso: {},
    readerExamples,
    seeds: false,
    snowRules: false,
    shopifyCategories,
    fillsCategory: true,
    metafields: GENERAL_METAFIELDS,
    knowledge: { verified: pack.verified, kinds, sizes, colours: Object.fromEntries(colours.map((c) => [c.code.toUpperCase(), c.name.toUpperCase()])) },
  };
}
