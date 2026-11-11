// AI-written SEO titles/descriptions and product copy, with a deterministic template fallback.

import Anthropic from "@anthropic-ai/sdk";
import { houseGuidance } from "./house";
import { houseConventions } from "./taxonomy";
import { englishVariant, retailer, shopName } from "./shop-profile";
import { anthropicClient, LIGHT_MODEL, aiAvailable } from "./anthropic";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { prisma, parseJson } from "./db";
import { getSettings } from "./settings";

import { templateGuidance, type ProductTemplateLike } from "./templates";

const SeoSchema = z.object({
  seoTitle: z.string().describe("Max 60 characters"),
  seoDescription: z.string().describe("120-155 characters, plain text"),
  bodyHtml: z.string().describe("Product copy as simple HTML (<p>, <h2>, <ul>, <li>), using only facts from the input. In the shop's own format where the guidance gives one; otherwise 2-3 short paragraphs."),
});

const getClient = (): Anthropic => anthropicClient(6);

export interface SeoInput {
  title: string;
  vendor: string;
  productType: string;
  category: string;
  description: string;
  metafields: Record<string, string>;
  options: string[];
  /**
   * What the shop has written down about products like this one — house rules plus the notes on any
   * matching template. The CSV can show which fields were filled in; only this can say why.
   */
  guidance?: string;
}

/** An SEO title from the shop's pattern: "{brand} {title} | {shop}" filled in, spaces tidied, cut to 60. */
export function seoTitleFrom(pattern: string, parts: { title: string; brand: string; type: string; shop: string }): string {
  const p = pattern.trim() || "{title} | {shop}";
  return p.replace(/\{title\}/gi, parts.title).replace(/\{brand\}/gi, parts.brand).replace(/\{type\}/gi, parts.type).replace(/\{shop\}/gi, parts.shop).replace(/\s+/g, " ").replace(/^[\s|–-]+|[\s|–-]+$/g, "").trim().slice(0, 60);
}

export function templateSeo(input: SeoInput, shop = shopName(), pattern = ""): z.infer<typeof SeoSchema> {
  const specs = Object.entries(input.metafields).filter(([, v]) => v).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`);
  const seoTitle = seoTitleFrom(pattern, { title: input.title, brand: input.vendor, type: input.productType, shop });
  const seoDescription = `Shop the ${input.title}${input.productType ? ` (${input.productType})` : ""} from ${input.vendor || "top brands"}${input.options.length ? ` in ${input.options.join(" and ")}` : ""}. Expert advice and fast shipping from ${shop}.`.slice(0, 155);
  const bodyHtml = [
    input.description ? `<p>${escapeHtml(input.description)}</p>` : `<p>${escapeHtml(input.title)}${input.vendor ? ` by ${escapeHtml(input.vendor)}` : ""}.</p>`,
    specs.length ? `<ul>${specs.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>` : "",
  ].join("");
  return { seoTitle, seoDescription, bodyHtml };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function generateSeo(input: SeoInput): Promise<{ result: z.infer<typeof SeoSchema>; source: "AI" | "TEMPLATE" }> {
  const settings = await getSettings();
  const plain = () => templateSeo(input, shopName(), settings.seoTitlePattern);
  if (!aiAvailable()) return { result: plain(), source: "TEMPLATE" };
  try {
    const response = await getClient().messages.parse({
      model: LIGHT_MODEL,
      max_tokens: 16_000,
      system: [
        `You write product copy for the Shopify store of ${retailer()}. Tone: ${settings.seoTone}. ${englishVariant()}. Use only facts given; never invent specs. seoTitle max 60 characters${settings.seoTitlePattern.trim() ? `, following the shop's pattern "${settings.seoTitlePattern.trim()}" where {title} is the product's title, {brand} its brand, {type} its type and {shop} the shop's name` : ""}, seoDescription 120-155 characters.`,
        // The shop's own written conventions outrank the generic instructions above, but never
        // licence inventing a spec that is not in the input.
        input.guidance?.trim()
          ? `The shop has written down how products like this are built. Follow it exactly where it applies, except that it never permits inventing a specification you were not given:\n\n${input.guidance.trim()}`
          : "",
      ].filter(Boolean).join("\n\n"),
      output_config: { format: zodOutputFormat(SeoSchema), effort: "low" },
      messages: [{ role: "user", content: JSON.stringify(input) }],
    });
    if (!response.parsed_output) return { result: plain(), source: "TEMPLATE" };
    return { result: response.parsed_output, source: "AI" };
  } catch {
    return { result: plain(), source: "TEMPLATE" };
  }
}

/** Fill SEO title/description (and body when empty) for every product in a batch that lacks them. */
export async function enrichBatchSeo(batchId: string, opts: { onlyMissing: boolean }): Promise<{ updated: number; source: "AI" | "TEMPLATE" | "MIXED" }> {
  const products = await prisma.product.findMany({ where: { batchId } });
  const settings = await getSettings();
  const templates = await loadTemplatesForCopy();
  let updated = 0;
  const sources = new Set<string>();
  for (const p of products) {
    if (opts.onlyMissing && p.seoTitle && p.seoDescription && p.bodyHtml) continue;
    const { result, source } = await generateSeo({
      guidance: templateGuidance(
        { vendor: p.vendor, productType: p.productType, category: p.category },
        templates,
        [houseGuidance(houseConventions()), settings.houseRules].filter((t) => t.trim()).join("\n"),
        titleExamplesFor({ vendor: p.vendor, productType: p.productType, category: p.category }, templates),
      ),
      title: p.title,
      vendor: p.vendor,
      productType: p.productType,
      category: p.category,
      description: p.bodyHtml.replace(/<[^>]+>/g, " ").trim(),
      metafields: parseJson<Record<string, string>>(p.metafields, {}),
      options: [p.option1Name, p.option2Name, p.option3Name].filter((o): o is string => Boolean(o)),
    });
    sources.add(source);
    await prisma.product.update({
      where: { id: p.id },
      data: {
        seoTitle: p.seoTitle && opts.onlyMissing ? p.seoTitle : result.seoTitle,
        seoDescription: p.seoDescription && opts.onlyMissing ? p.seoDescription : result.seoDescription,
        bodyHtml: p.bodyHtml && opts.onlyMissing ? p.bodyHtml : result.bodyHtml,
      },
    });
    updated++;
  }
  return { updated, source: sources.size > 1 ? "MIXED" : ((sources.values().next().value as "AI" | "TEMPLATE" | undefined) ?? "TEMPLATE") };
}

/**
 * Templates, shaped for copywriting. Kept here rather than imported from the pipeline so this module
 * does not pull in the whole import machinery just to read a few rows.
 */
async function loadTemplatesForCopy(): Promise<ProductTemplateLike[]> {
  const rows = await prisma.productTemplate.findMany({ where: { active: true }, orderBy: { priority: "asc" } });
  return rows.map((t) => ({
    id: t.id,
    name: t.name,
    scope: t.scope as ProductTemplateLike["scope"],
    matchValue: t.matchValue,
    matchProductType: t.matchProductType,
    notes: t.notes,
    productType: t.setProductType,
    tags: [],
    collections: [],
    optionNames: [],
    metafields: {},
    priority: t.priority,
    active: t.active,
    analysis: parseJson<{ titleExamples?: string[] }>(t.analysis, {}),
  })) as ProductTemplateLike[];
}

/** Real titles from the export a matching template was learned from, so new copy reads like the old. */
function titleExamplesFor(
  target: { vendor: string; productType: string; category: string },
  templates: ProductTemplateLike[],
): string[] {
  const withAnalysis = templates as Array<ProductTemplateLike & { analysis?: { titleExamples?: string[] } }>;
  const matched = withAnalysis.filter(
    (t) => t.active && (t.matchValue.toLowerCase() === target.vendor.toLowerCase() || t.matchValue.toLowerCase() === target.productType.toLowerCase()),
  );
  return matched.flatMap((t) => t.analysis?.titleExamples ?? []).slice(0, 3);
}
