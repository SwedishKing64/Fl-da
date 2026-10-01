/**
 * The build, checked the way a person on the shop floor would check it.
 *
 * Everything above this reads files by rule, and the rules are right most of the time. What the
 * shop asked for is the rest of the time: somebody who looks at what was built, knows how the shop
 * lists things, reads what was said in the instruction chat, fixes what is plainly wrong, and says
 * what they are not sure about — so that a batch can be run when nobody who knows the catalogue is
 * in. That is this. It runs after a build, where the API is available, with the whole batch in
 * front of it: the files and what was noted on them, the directives, the conversation, every
 * product as built, and how the shop already lists the same brand.
 *
 * It may change a product's name, Type, vendor, tags or collections, or drop a product that should
 * not have been built, and nothing else: prices and quantities are the order's, barcodes are the
 * supplier's, and a description is written elsewhere. Anything it cannot settle is a question back
 * to the person, not a guess.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { prisma } from "./db";
import { EXTRACTION_MODEL, aiAvailable } from "./extract/ai";
import { retrying } from "./api-errors";
import { logAudit } from "./audit";
import { isValidType, PRODUCT_TYPES } from "./taxonomy";
import { houseTags } from "./product-tags";
import { buildHandle } from "./handle";
import { productTitle, seasonTagFrom } from "./titles";
import { parseDirectives, describeDirectives } from "./instructions";

const Fix = z.object({
  handle: z.string().describe("The product's handle, exactly as listed."),
  field: z.enum(["title", "productType", "vendor", "tags", "collections", "drop"]).describe("What to change. 'drop' removes the product from the batch (a footer, a freight line, a binding that goes on skis, a product the person said not to build)."),
  value: z.string().describe("The new value. A title without the year; a Type from the list; tags or collections as one comma-separated list replacing the old. Empty for 'drop'."),
  why: z.string().describe("One short sentence, in the shop's terms."),
});

const Review = z.object({
  summary: z.string().describe("Two or three plain sentences for the person: what the build looks like, what was changed, what still needs them. No headings."),
  fixes: z.array(Fix).describe("Only what is plainly wrong by the shop's conventions or by what the person said. Empty when the build is right."),
  questions: z.array(z.string()).describe("What could not be settled from the files and the conversation, each as one question the person can answer in the chat. Empty when there is nothing to ask."),
});

export type BatchReview = z.infer<typeof Review>;

const SYSTEM = `You check a batch of Shopify products that has just been built from a supplier's order form, for a ski and snowboard shop in Australia, before a person looks at it. You know the shop's conventions and you have the shop's own listings of the same brands beside you.

The shop's conventions:
- Title is the model and the season: "Custom 2027", "M7 Mantra 2027", "Men's Highshot Step On® Snowboard Boots 2026". Never the vendor in the title. Where the shop already lists the model, the shop's title wins, exactly.
- Supplier shorthand is written out, never left in a name: SO is Step On, JK jacket, PT pants, GL gloves, MT mitts, SK socks, 2PK 2 pack. A trailing "SO" is never part of a name.
- Vendor is the brand (Burton, Anon, Volkl), never the distributor (Sportrade, Amer Sports).
- Type is one of the shop's Types, listed below. A snowboard brand's boots are Snowboard Boots and its bindings Snowboard Bindings; its bags, stomp pads and impact gear are Snowboard Accessories. Goggles, helmets and gloves are Ski Accessories whoever makes them (that is where the shop files all of its own). Garments are Snow Clothing.
- Tags are lower case: the vendor, the year, mens / womens / kids (a unisex product gets mens AND womens; there is no unisex tag), the shelf tags. Men's and women's versions of a model are two products.
- A fit that is not the default is in the name, one product per fit: "… Wide …", "… Low Bridge …".
- Nothing that is not a product is built: totals, freight, deposits, a reference row nobody ordered.

Do not touch prices, costs, quantities, barcodes, options or descriptions — those are the order's and the supplier's.

Read the instruction chat as the person's standing orders. Where they asked for something the build could do and did not, fix it; where they asked for something that cannot be done from these files, say so in a question rather than pretending. Where a product's name is a supplier's abbreviation you cannot expand with confidence, leave it and ask.

Only change what you are sure of. A wrong title or Type is worse than one left for the person.`;

let client: Anthropic | null = null;
const getClient = (): Anthropic => (client ??= new Anthropic({ maxRetries: 6 }));

type Ask = (system: string, content: string) => Promise<string | undefined>;
const askModel: Ask = async (system, content) => {
  const response = await retrying(() => getClient().messages.stream({
    model: EXTRACTION_MODEL,
    max_tokens: 6000,
    system,
    thinking: { type: "adaptive" },
    output_config: { format: zodOutputFormat(Review), effort: "medium" },
    messages: [{ role: "user", content }],
  }).finalMessage());
  return response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
};

export function reviewAvailable(): boolean {
  return aiAvailable();
}

/** What the batch looks like to the checker: one line per product, the files, the conversation. */
export async function describeBatch(batchId: string): Promise<string> {
  const batch = await prisma.importBatch.findUniqueOrThrow({
    where: { id: batchId },
    include: { files: true, supplier: true, products: { include: { variants: true }, orderBy: { createdAt: "asc" } } },
  });
  const thread = await prisma.batchInstruction.findMany({ where: { batchId }, orderBy: { createdAt: "asc" } });
  const vendors = [...new Set(batch.products.map((p) => p.vendor.trim()).filter(Boolean))];
  const listings = vendors.length
    ? await prisma.shopListing.findMany({ where: { vendor: { in: vendors } }, select: { title: true, vendor: true, productType: true, tags: true }, take: 400 })
    : [];
  const sample = vendors.flatMap((v) => listings.filter((l) => l.vendor === v).slice(0, 30).map((l) => `  ${l.vendor} | ${l.title} | ${l.productType} | ${l.tags}`));
  const lines = batch.products.map((p) => {
    const qty = p.variants.reduce((n, v) => n + (v.quantity ?? 0), 0);
    const opts = [...new Set(p.variants.map((v) => [v.option1Value, v.option2Value, v.option3Value].filter(Boolean).join("/")))].slice(0, 6).join(", ");
    return `- ${p.handle} | "${p.title}" | vendor ${p.vendor || "(none)"} | type ${p.productType || "(none)"} | tags ${p.tags || "(none)"} | ${p.variants.length} variants (${opts}) | qty ${qty}${p.variants.some((v) => v.retailOverride) ? "" : " | no RRP"}`;
  });
  return [
    `Batch: ${batch.name}${batch.supplier ? ` (supplier: ${batch.supplier.name})` : ""}`,
    `Files: ${batch.files.map((f) => `${f.filename} [${f.detectedKind ?? f.kind}]${f.extractionError ? ` — ${f.extractionError.replace(/\s+/g, " ").slice(0, 600)}` : ""}`).join("; ") || "(none)"}`,
    `Directives in force: ${describeDirectives(parseDirectives(batch.directives)).join("; ") || "(none)"}`,
    `Instruction chat:${thread.length ? "\n" + thread.map((t) => `  ${t.role}: ${t.body.replace(/\s+/g, " ").slice(0, 500)}`).join("\n") : " (nothing said)"}`,
    `The shop's Types: ${PRODUCT_TYPES.join(", ")}`,
    `How the shop already lists these brands (vendor | title | type | tags):${sample.length ? "\n" + sample.join("\n") : " (no listings remembered — upload the shop's export to the batch)"}`,
    `Products built (${batch.products.length}):`,
    ...lines,
  ].join("\n");
}

export interface ReviewOutcome extends BatchReview {
  applied: Array<{ handle: string; field: string; from: string; to: string }>;
  skipped: Array<{ handle: string; field: string; value: string; reason: string }>;
}

/**
 * Check the batch, apply what is safe, and say what was done and what is open.
 *
 * Returns null where there is no API, and the chat is told nothing happened.
 */
export async function reviewBatch(batchId: string, userId: string | null, ask: Ask = askModel): Promise<ReviewOutcome | null> {
  if (!aiAvailable()) return null;
  const content = await describeBatch(batchId);
  const text = await ask(SYSTEM, content);
  if (!text) return null;
  const parsed = Review.safeParse(JSON.parse(text));
  if (!parsed.success) return null;
  const review = parsed.data;

  const products = await prisma.product.findMany({ where: { batchId }, select: { id: true, handle: true, title: true, vendor: true, productType: true, tags: true, collections: true } });
  const byHandle = new Map(products.map((p) => [p.handle, p]));
  const shopHandles = new Set((await prisma.shopListing.findMany({ where: { handle: { in: products.map((p) => p.handle) } }, select: { handle: true } })).map((l) => l.handle));
  const applied: ReviewOutcome["applied"] = [];
  const skipped: ReviewOutcome["skipped"] = [];

  for (const fix of review.fixes) {
    const p = byHandle.get(fix.handle.trim());
    if (!p) { skipped.push({ ...fix, reason: "no such product in the batch" }); continue; }
    const value = fix.value.trim();
    if (fix.field === "drop") {
      await prisma.product.delete({ where: { id: p.id } });
      applied.push({ handle: p.handle, field: "drop", from: p.title, to: "" });
      byHandle.delete(p.handle);
      continue;
    }
    if (!value) { skipped.push({ ...fix, reason: "no value given" }); continue; }
    if (fix.field === "productType" && !isValidType(value)) { skipped.push({ ...fix, reason: `"${value}" is not one of the shop's Types` }); continue; }
    if (fix.field === "title") {
      const title = value.replace(/\s+\b20\d{2}\b\s*$/, "").trim();
      if (!title) { skipped.push({ ...fix, reason: "empty title" }); continue; }
      const season = seasonTagFrom(p.tags.split(",").map((t) => t.trim()));
      // A listing the shop already has keeps its handle; a new product's handle follows its name.
      const data: { title: string; handle?: string } = { title };
      if (!shopHandles.has(p.handle)) data.handle = buildHandle({ title: productTitle(title, season) });
      await prisma.product.update({ where: { id: p.id }, data });
      applied.push({ handle: p.handle, field: "title", from: p.title, to: title });
      continue;
    }
    if (fix.field === "tags") {
      const tags = houseTags(value.split(",").map((t) => t.trim()).filter(Boolean)).join(", ");
      await prisma.product.update({ where: { id: p.id }, data: { tags } });
      applied.push({ handle: p.handle, field: "tags", from: p.tags, to: tags });
      continue;
    }
    const from = p[fix.field];
    await prisma.product.update({ where: { id: p.id }, data: { [fix.field]: value } });
    applied.push({ handle: p.handle, field: fix.field, from, to: value });
  }

  await logAudit("batch.reviewed", { batchId, userId, details: { applied, skipped, questions: review.questions } });
  const said = [
    review.summary.trim(),
    applied.length ? `Changed: ${applied.map((a) => (a.field === "drop" ? `dropped "${a.from}"` : `${a.handle} ${a.field} "${a.from}" → "${a.to}"`)).join("; ")}.` : "",
    skipped.length ? `Not changed: ${skipped.map((s) => `${s.handle} ${s.field} (${s.reason})`).join("; ")}.` : "",
    review.questions.length ? `To settle: ${review.questions.join(" ")}` : "",
  ].filter(Boolean).join("\n");
  await prisma.batchInstruction.create({ data: { batchId, role: "ASSISTANT", body: said } });
  return { ...review, applied, skipped };
}

/** Whether the latest build has been checked. */
export async function reviewedSinceBuilt(batchId: string): Promise<boolean> {
  const [built, reviewed] = await Promise.all([
    prisma.auditLog.findFirst({ where: { batchId, action: "batch.mapped" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.auditLog.findFirst({ where: { batchId, action: "batch.reviewed" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  if (!built) return true;
  return Boolean(reviewed && reviewed.createdAt >= built.createdAt);
}
