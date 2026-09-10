// AI-written SEO titles/descriptions and product copy, with a deterministic template fallback.

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { prisma, parseJson } from "./db";
import { getSettings } from "./settings";
import { aiAvailable, EXTRACTION_MODEL } from "./extract/ai";

const SeoSchema = z.object({
  seoTitle: z.string().describe("Max 60 characters"),
  seoDescription: z.string().describe("120-155 characters, plain text"),
  bodyHtml: z.string().describe("2-3 short paragraphs of product copy as simple HTML (<p>, <ul>, <li>) using only facts from the input"),
});

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export interface SeoInput {
  title: string;
  vendor: string;
  productType: string;
  category: string;
  description: string;
  metafields: Record<string, string>;
  options: string[];
}

export function templateSeo(input: SeoInput, shopName = "Sydney Ski Shop"): z.infer<typeof SeoSchema> {
  const specs = Object.entries(input.metafields).filter(([, v]) => v).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`);
  const seoTitle = `${input.title} | ${shopName}`.slice(0, 60);
  const seoDescription = `Shop the ${input.title}${input.productType ? ` (${input.productType})` : ""} from ${input.vendor || "top brands"}${input.options.length ? ` in ${input.options.join(" and ")}` : ""}. Expert advice and fast shipping from ${shopName}.`.slice(0, 155);
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
  if (!aiAvailable()) return { result: templateSeo(input), source: "TEMPLATE" };
  const settings = await getSettings();
  try {
    const response = await getClient().messages.parse({
      model: EXTRACTION_MODEL,
      max_tokens: 4000,
      system: `You write product copy for an Australian ski and snowboard retailer's Shopify store. Tone: ${settings.seoTone}. Australian English. Use only facts given; never invent specs. seoTitle max 60 characters, seoDescription 120-155 characters.`,
      output_config: { format: zodOutputFormat(SeoSchema), effort: "low" },
      messages: [{ role: "user", content: JSON.stringify(input) }],
    });
    if (!response.parsed_output) return { result: templateSeo(input), source: "TEMPLATE" };
    return { result: response.parsed_output, source: "AI" };
  } catch {
    return { result: templateSeo(input), source: "TEMPLATE" };
  }
}

/** Fill SEO title/description (and body when empty) for every product in a batch that lacks them. */
export async function enrichBatchSeo(batchId: string, opts: { onlyMissing: boolean }): Promise<{ updated: number; source: "AI" | "TEMPLATE" | "MIXED" }> {
  const products = await prisma.product.findMany({ where: { batchId } });
  let updated = 0;
  const sources = new Set<string>();
  for (const p of products) {
    if (opts.onlyMissing && p.seoTitle && p.seoDescription && p.bodyHtml) continue;
    const { result, source } = await generateSeo({
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
