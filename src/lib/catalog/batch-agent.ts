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
import { anthropicClient } from "./anthropic";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { prisma } from "./db";
import { EXTRACTION_MODEL, aiAvailable } from "./extract/ai";
import { retrying } from "./api-errors";
import { logAudit } from "./audit";
import { isValidType, productTypes } from "./taxonomy";
import { houseTags } from "./product-tags";
import { buildHandle } from "./handle";
import { productTitle, seasonTagFrom } from "./titles";
import { parseDirectives, describeDirectives } from "./instructions";
import { CANONICAL_FIELDS, type CanonicalLineItem } from "./types";
import { readFile } from "./storage";
import { sheetGrids } from "./extract/tabular";
import { applyMappings, mappingState, untouchedSinceBuilt } from "./pipeline";
import { parseJson } from "./db";

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

const getClient = (): Anthropic => anthropicClient(6);

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
    `The shop's Types: ${productTypes().join(", ")}`,
    `How the shop already lists these brands (vendor | title | type | tags):${sample.length ? "\n" + sample.join("\n") : " (no listings remembered — upload the shop's export to the batch)"}`,
    `Products built (${batch.products.length}):`,
    ...lines,
  ].join("\n");
}


// ---------------------------------------------------------------------------------------------
// The files, read again
// ---------------------------------------------------------------------------------------------

const ColumnFix = z.object({
  file: z.string().describe("The file's name, exactly as listed."),
  column: z.string().describe("The column heading, exactly as the sheet has it."),
  field: z.string().describe("What the column really is, as one of the field keys listed, or 'none' when a column was read as something it is not."),
  why: z.string().describe("One short sentence, pointing at the cells that show it."),
});

const Finding = z.object({
  file: z.string(),
  severity: z.enum(["error", "warning", "note"]).describe("error: the build is wrong because of it; warning: probably wrong, worth a look; note: worth knowing."),
  what: z.string().describe("What is wrong or notable, in one or two sentences."),
  evidence: z.string().describe("The cells, rows or totals that show it."),
});

const ReadingAudit = z.object({
  summary: z.string().describe("Two or three plain sentences: whether the files were read right, and what was found."),
  verdict: z.enum(["right", "wrong", "unsure"]).describe("Whether what was built matches what the sheets say."),
  findings: z.array(Finding),
  columnFixes: z.array(ColumnFix).describe("Columns read as the wrong thing, or missed. Empty when the reading is right."),
  instructionsOnSheet: z.array(z.string()).describe("Anything written ON the sheets that is an instruction or a fact about the order — a note row, a title saying which season or delivery, a cancellation column — that the build should obey."),
  questions: z.array(z.string()).describe("What cannot be settled from the sheets alone, each as one question the person can answer."),
});

export type ReadingAuditResult = z.infer<typeof ReadingAudit>;

const AUDIT_SYSTEM = `You audit how a supplier's spreadsheets were read before Shopify products were built from them, for a ski and snowboard shop in Australia. You are forensic about it: you are shown the raw sheets — every tab, the rows above the headings, the first rows, the last rows — then which column was read as which field, then what was built from each file: how many lines, how many units, the cost. Your job is to find where the reading is wrong, and to notice what the sheets say that a column reader cannot.

Look for, in this order:
1. A column read as the wrong field: a customer or payer name taken as the product; a line total taken as the unit cost; another currency's price taken as the AUD one; a collection code taken as the season; a date, a weight or a hs-code taken as a barcode; a supplier's internal code taken as the name.
2. A column that was missed: a brand, a season, a gender, a size, a colour, a cost, a recommended retail, a quantity, a cancellation column, a delivery date or per-delivery quantity columns, a category — anything the sheet has that nothing was read from.
3. Totals that do not agree: lines with a quantity on the sheet against lines built; units on the sheet (net of any cancellations) against units built; a totals or summary row or tab that contradicts them.
4. Things written on the sheet that are instructions or facts: a title saying "2027W", "RDD or Cancel", "December delivery"; a note row; a column of delivery months; a tab that is a pivot summary and not an order.
5. Rows that are not products — totals, freight, deposits, notes — and reference rows nobody ordered.

Field keys you may name in columnFixes: FIELD_KEYS. Only name a fix you are sure of from the cells. Everything else is a finding or a question. Do not invent problems: a reading that is right gets verdict "right" and an empty columnFixes.`;

/** The field keys a column may be read as. */
const FIELD_KEYS = CANONICAL_FIELDS.map((f) => f.key as string);

const cell = (v: unknown): string => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 48);
const showRow = (row: string[]): string => row.slice(0, 48).map(cell).join(" | ");

/** The raw tabs of a stored file, a few rows each, or nothing where the file is not a workbook. */
async function rawTabs(storagePath: string, filename: string): Promise<string> {
  try {
    const buffer = await readFile(storagePath);
    const grids = await sheetGrids(buffer);
    if (grids.length === 0) return "";
    return grids.map(({ name, grid }) => {
      const rows = grid.filter((r) => r.some((c) => cell(c) !== ""));
      const head = rows.slice(0, 10).map((r, i) => `    r${i + 1}: ${showRow(r)}`);
      const tail = rows.length > 13 ? ["    …", ...rows.slice(-3).map((r, i) => `    r${rows.length - 2 + i}: ${showRow(r)}`)] : rows.slice(10).map((r, i) => `    r${i + 11}: ${showRow(r)}`);
      return `  Tab "${name}": ${rows.length} non-empty rows\n${[...head, ...tail].join("\n")}`;
    }).join("\n");
  } catch {
    return `  (${filename}: not a workbook, or could not be re-read)`;
  }
}

/** The files as the sheets have them, how each column was read, and what came out of each. */
export async function describeReading(batchId: string): Promise<string> {
  const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: batchId }, include: { files: { orderBy: { createdAt: "asc" } } } });
  const groups = await mappingState(batchId).catch(() => [] as Awaited<ReturnType<typeof mappingState>>);
  const lines = await prisma.extractedLineItem.findMany({ where: { batchId }, select: { sourceFileId: true, normalized: true, variantId: true } });
  const out: string[] = [];
  for (const f of batch.files) {
    if (f.extractionStatus !== "DONE") { out.push(`File ${f.filename}: not read (${f.extractionStatus}${f.extractionError ? `: ${f.extractionError.slice(0, 200)}` : ""})`); continue; }
    const headers = parseJson<string[]>(f.headers, []);
    const group = groups.find((g) => g.fileIds.includes(f.id));
    const mapping = group?.suggestion ?? {};
    const read = Object.entries(mapping).filter(([, v]) => v).map(([h, v]) => `${h} → ${v}`);
    const unread = headers.filter((h) => !mapping[h]);
    const built = lines.filter((l) => l.sourceFileId === f.id && l.variantId);
    const items = built.map((l) => parseJson<CanonicalLineItem | null>(l.normalized ?? null, null)).filter((i): i is CanonicalLineItem => Boolean(i));
    const units = items.reduce((n, i) => n + (i.quantity ?? 0), 0);
    const cost = items.reduce((n, i) => n + (i.costPrice ?? 0) * (i.quantity ?? 0), 0);
    out.push([
      `File ${f.filename} [read as ${f.detectedKind ?? f.kind}]${f.extractionError ? `\n  Noted on it: ${f.extractionError.replace(/\s+/g, " ").slice(0, 700)}` : ""}`,
      `  Raw tabs:`,
      await rawTabs(f.storagePath, f.filename),
      `  Table read from it: ${parseJson<unknown[]>(f.rawRows, []).length} rows under headings: ${headers.join(" | ")}`,
      `  Columns read as: ${read.join("; ") || "(nothing)"}`,
      `  Columns not read: ${unread.join(" | ") || "(none)"}`,
      `  Built from it: ${built.length} lines, ${units} units, cost $${cost.toFixed(2)}${items.length ? `; first line as read: ${JSON.stringify({ title: items[0].title, brand: items[0].brand, sku: items[0].sku, barcode: items[0].barcode, size: items[0].size, colour: items[0].colour, gender: items[0].gender, season: items[0].season, costPrice: items[0].costPrice, rrp: items[0].rrp, quantity: items[0].quantity, cancelled: items[0].cancelled, deliveryDate: items[0].deliveryDate, category: items[0].category, productType: items[0].productType })}` : ""}`,
    ].join("\n"));
  }
  const thread = await prisma.batchInstruction.findMany({ where: { batchId }, orderBy: { createdAt: "asc" } });
  return [
    `Batch: ${batch.name}`,
    `Directives in force: ${describeDirectives(parseDirectives(batch.directives)).join("; ") || "(none)"}`,
    `Instruction chat:${thread.length ? "\n" + thread.map((t) => `  ${t.role}: ${t.body.replace(/\s+/g, " ").slice(0, 400)}`).join("\n") : " (nothing said)"}`,
    ...out,
  ].join("\n");
}

export interface AuditOutcome extends ReadingAuditResult {
  /** Column fixes that were applied, and the batch rebuilt with them. */
  remapped: Array<{ file: string; column: string; field: string }>;
  rebuilt: boolean;
}

/**
 * Read the files again, forensically, and put right what was read wrong.
 *
 * A column fix is only applied where the batch is still exactly what the files built — a rebuild
 * replaces hand edits — and only to a field key that exists. The rest is said in the chat.
 */
export async function auditReading(batchId: string, userId: string | null, ask: Ask = askModel): Promise<AuditOutcome | null> {
  if (!aiAvailable()) return null;
  // The audit is of a column read: a spreadsheet's headings matched to fields by rule, which is
  // where a column goes wrong. A photograph or a scan was read by the model itself — there are no
  // columns, and no raw tabs to hold up against — so a second long model call over the same
  // picture had nothing to find. Said as read right, and the minute it took is given back.
  const files = await prisma.sourceFile.findMany({ where: { batchId, extractionStatus: "DONE" }, select: { extractionMethod: true, detectedKind: true } });
  const columnRead = files.filter((f) => !["SHOP_EXPORT", "PRODUCT_PHOTO"].includes(f.detectedKind ?? "") && !["IMAGE_AI", "PDF_AI", "AI_TEXT"].includes(f.extractionMethod ?? ""));
  if (files.length > 0 && columnRead.length === 0) {
    return { summary: "The files were read by the model itself — a photograph or a scan has no columns to check.", verdict: "right", findings: [], columnFixes: [], instructionsOnSheet: [], questions: [], remapped: [], rebuilt: false };
  }
  const content = await describeReading(batchId);
  const text = await ask(AUDIT_SYSTEM.replace("FIELD_KEYS", FIELD_KEYS.join(", ")), content);
  if (!text) return null;
  const parsed = ReadingAudit.safeParse(JSON.parse(text));
  if (!parsed.success) return null;
  const audit = parsed.data;

  const remapped: AuditOutcome["remapped"] = [];
  let rebuilt = false;
  const fixes = audit.columnFixes.filter((c) => FIELD_KEYS.includes(c.field) || c.field === "none");
  if (fixes.length > 0 && (await untouchedSinceBuilt(batchId))) {
    const files = await prisma.sourceFile.findMany({ where: { batchId }, select: { id: true, filename: true } });
    const groups = await mappingState(batchId);
    const inputs = groups.map((g) => ({ hash: g.hash, mapping: { ...g.suggestion }, options: g.options, saveTemplate: null }));
    for (const fix of fixes) {
      const file = files.find((f) => f.filename === fix.file.trim()) ?? files.find((f) => f.filename.toLowerCase().includes(fix.file.trim().toLowerCase()));
      const group = file ? groups.find((g) => g.fileIds.includes(file.id)) : undefined;
      const input = group ? inputs.find((i) => i.hash === group.hash) : undefined;
      if (!input) continue;
      const column = Object.keys(input.mapping).find((h) => h === fix.column) ?? group!.headers.find((h) => h.trim().toLowerCase() === fix.column.trim().toLowerCase());
      if (!column) continue;
      const field = fix.field === "none" ? "" : (fix.field as keyof CanonicalLineItem);
      // One column per field: the field moves to where the audit put it.
      if (field) for (const h of Object.keys(input.mapping)) if (input.mapping[h] === field) input.mapping[h] = "";
      input.mapping[column] = field;
      remapped.push({ file: file!.filename, column, field: field || "none" });
    }
    if (remapped.length > 0) {
      const result = await applyMappings(batchId, inputs, userId);
      rebuilt = result.products > 0;
    }
  }

  await logAudit("batch.audited", { batchId, userId, details: { verdict: audit.verdict, findings: audit.findings, remapped, rebuilt, instructionsOnSheet: audit.instructionsOnSheet, questions: audit.questions } });
  const said = [
    `Read the files again: ${audit.summary.trim()}`,
    audit.findings.length ? audit.findings.map((f) => `• ${f.severity === "note" ? "" : `${f.severity.toUpperCase()}: `}${f.file} — ${f.what} (${f.evidence})`).join("\n") : "",
    remapped.length ? `Re-read with: ${remapped.map((r) => `"${r.column}" as ${r.field} (${r.file})`).join("; ")}${rebuilt ? ", and rebuilt the products." : "."}` : audit.columnFixes.length ? "Columns to re-read were found but the products have been edited by hand, so nothing was rebuilt — open Column mapping to apply them." : "",
    audit.instructionsOnSheet.length ? `Written on the sheets: ${audit.instructionsOnSheet.join(" ")}` : "",
    audit.questions.length ? `To settle: ${audit.questions.join(" ")}` : "",
  ].filter(Boolean).join("\n");
  await prisma.batchInstruction.create({ data: { batchId, role: "ASSISTANT", body: said } });
  return { ...audit, remapped, rebuilt };
}

export interface ReviewOutcome extends BatchReview {
  applied: Array<{ handle: string; field: string; from: string; to: string }>;
  skipped: Array<{ handle: string; field: string; value: string; reason: string }>;
  /** How the files read on a second, forensic look, or null where the API is off. */
  audit: AuditOutcome | null;
}

/**
 * Check the batch, apply what is safe, and say what was done and what is open.
 *
 * Returns null where there is no API, and the chat is told nothing happened.
 */
export async function reviewBatch(batchId: string, userId: string | null, ask: Ask = askModel, options: { audit?: boolean } = {}): Promise<ReviewOutcome | null> {
  if (!aiAvailable()) return null;
  // The files first, forensically: a build checked against the sheets it came from, not only
  // against the shop's conventions. Where a column was read wrong the batch is rebuilt before the
  // products are looked at. The page runs the two as separate requests — each is a long model
  // call, and together they outlast what a deployed request is allowed — so it asks for the
  // review without the audit once the audit has been run.
  const audit = options.audit === false ? null : await auditReading(batchId, userId, ask).catch(() => null);
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

  await logAudit("batch.reviewed", { batchId, userId, details: { applied, skipped, questions: review.questions, audit: audit ? { verdict: audit.verdict, remapped: audit.remapped, rebuilt: audit.rebuilt } : null } });
  const said = [
    review.summary.trim(),
    applied.length ? `Changed: ${applied.map((a) => (a.field === "drop" ? `dropped "${a.from}"` : `${a.handle} ${a.field} "${a.from}" → "${a.to}"`)).join("; ")}.` : "",
    skipped.length ? `Not changed: ${skipped.map((s) => `${s.handle} ${s.field} (${s.reason})`).join("; ")}.` : "",
    review.questions.length ? `To settle: ${review.questions.join(" ")}` : "",
  ].filter(Boolean).join("\n");
  await prisma.batchInstruction.create({ data: { batchId, role: "ASSISTANT", body: said } });
  return { ...review, applied, skipped, audit };
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
