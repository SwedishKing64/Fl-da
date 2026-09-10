// Server-side orchestration: ingest -> extract -> map -> group -> price -> images -> review -> export.

import type { Prisma } from "@prisma/client";
import { prisma, parseJson } from "./db";
import { extractFile } from "./extract";
import { applyMapping, headerHash, mappingProblems, suggestMapping, suggestOptions, type Mapping, type MappingOptions } from "./mapping";
import { groupLineItems } from "./grouping";
import { DEFAULT_CATEGORY_RULES, type CategoryRuleLike } from "./categorize";
import { allocateFreight, exGstCostAud, priceVariant, selectRule, type PricingRuleLike } from "./pricing";
import { getSettings } from "./settings";
import { checkImageUrl, findLibraryImages, recordLibraryImages } from "./images";
import { generateCsvParts, validateCsvFile, validateProducts } from "./csv";
import { toCsvProducts } from "./pipeline-pure";
export { toCsvProducts };
import { SKI_METAFIELDS, metafieldColumn, type AppSettings, type CanonicalLineItem, type GstTreatment } from "./types";
import type { ReviewProduct, ReviewSummary, ReviewVariant } from "./review-types";
import { blockingErrors, summarise, validateReview, warningList } from "./validate";
import { readFile, saveFile } from "./storage";
import { logAudit } from "./audit";
import { AI_HEADERS } from "./extract/ai";

// ---------------------------------------------------------------------------
// Rules & settings helpers
// ---------------------------------------------------------------------------

export async function loadPricingRules(): Promise<PricingRuleLike[]> {
  const rows = await prisma.pricingRule.findMany({ orderBy: [{ priority: "desc" }, { createdAt: "asc" }] });
  return rows.map((r) => ({ ...r, scope: r.scope as PricingRuleLike["scope"], mode: r.mode as PricingRuleLike["mode"] }));
}

export async function loadCategoryRules(): Promise<CategoryRuleLike[]> {
  const rows = await prisma.categoryRule.findMany({ orderBy: { priority: "desc" } });
  return rows.length > 0 ? rows : DEFAULT_CATEGORY_RULES;
}

// ---------------------------------------------------------------------------
// Ingest & extract
// ---------------------------------------------------------------------------

export async function ingestFile(batchId: string, file: { filename: string; mimeType: string; buffer: Buffer; kind?: string }) {
  const storagePath = await saveFile("invoices", file.filename, file.buffer);
  const record = await prisma.sourceFile.create({
    data: { batchId, filename: file.filename, mimeType: file.mimeType || "application/octet-stream", sizeBytes: file.buffer.length, storagePath, kind: file.kind ?? "INVOICE" },
  });
  try {
    const { table, meta } = await extractFile(file.buffer, file.filename, file.mimeType);
    await prisma.sourceFile.update({
      where: { id: record.id },
      data: {
        extractionStatus: "DONE",
        extractionMethod: table.method,
        headers: JSON.stringify(table.headers),
        rawRows: JSON.stringify(table.rows),
        extractedText: table.text ?? null,
        extractionError: table.warnings.length ? table.warnings.join(" ") : null,
      },
    });
    if (meta) {
      const batch = await prisma.importBatch.findUnique({ where: { id: batchId }, select: { currency: true } });
      const data: Prisma.ImportBatchUpdateInput = {};
      if (meta.currency && batch?.currency === "AUD" && meta.currency !== "AUD") data.currency = meta.currency;
      if (meta.gstTreatment && meta.gstTreatment !== "UNKNOWN") data.gstTreatment = meta.gstTreatment;
      if (Object.keys(data).length) await prisma.importBatch.update({ where: { id: batchId }, data });
    }
    await prisma.importBatch.update({ where: { id: batchId }, data: { status: "EXTRACTED" } });
    return { id: record.id, rows: table.rows.length, method: table.method, warnings: table.warnings };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.sourceFile.update({ where: { id: record.id }, data: { extractionStatus: "FAILED", extractionError: message } });
    return { id: record.id, rows: 0, method: null, warnings: [message] };
  }
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

export interface HeaderGroup {
  hash: string;
  headers: string[];
  fileIds: string[];
  filenames: string[];
  rowCount: number;
  sampleRows: Record<string, string>[];
  suggestion: Mapping;
  options: MappingOptions;
  templateId: string | null;
  templateName: string | null;
  isCanonical: boolean; // AI-extracted rows already use canonical field keys
}

export async function mappingState(batchId: string): Promise<HeaderGroup[]> {
  const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: batchId }, include: { files: true, supplier: true } });
  const templates = batch.supplierId ? await prisma.mappingTemplate.findMany({ where: { supplierId: batch.supplierId } }) : [];
  const groups = new Map<string, HeaderGroup>();
  for (const file of batch.files) {
    if (file.extractionStatus !== "DONE") continue;
    const headers = parseJson<string[]>(file.headers, []);
    const rows = parseJson<Record<string, string>[]>(file.rawRows, []);
    if (headers.length === 0) continue;
    const hash = headerHash(headers);
    let group = groups.get(hash);
    if (!group) {
      const isCanonical = headers.every((h) => (AI_HEADERS as readonly string[]).includes(h));
      const template = templates.find((t) => t.headerHash === hash) ?? null;
      group = {
        hash,
        headers,
        fileIds: [],
        filenames: [],
        rowCount: 0,
        sampleRows: [],
        suggestion: template ? parseJson<Mapping>(template.mappings, {}) : isCanonical ? Object.fromEntries(headers.map((h) => [h, h])) as Mapping : suggestMapping(headers),
        options: template
          ? parseJson<MappingOptions>(template.options, {})
          : { ...(isCanonical ? {} : suggestOptions(suggestMapping(headers))), ...(batch.supplier?.defaultBrand ? { fixed: { brand: batch.supplier.defaultBrand } } : {}) },
        templateId: template?.id ?? null,
        templateName: template?.name ?? null,
        isCanonical,
      };
      groups.set(hash, group);
    }
    group.fileIds.push(file.id);
    group.filenames.push(file.filename);
    group.rowCount += rows.length;
    if (group.sampleRows.length < 3) group.sampleRows.push(...rows.slice(0, 3 - group.sampleRows.length));
  }
  return Array.from(groups.values());
}

export interface ApplyMappingInput {
  hash: string;
  mapping: Mapping;
  options: MappingOptions;
  saveTemplate?: { name: string } | null;
}

/** Apply column mappings to every extracted file, then (re)build products, variants, prices and images. */
export async function applyMappings(batchId: string, inputs: ApplyMappingInput[], userId: string | null): Promise<{ products: number; variants: number; problems: string[] }> {
  const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: batchId }, include: { files: true } });
  const problems: string[] = [];
  for (const input of inputs) for (const p of mappingProblems(input.mapping)) problems.push(`${input.hash}: ${p}`);
  if (problems.length) return { products: 0, variants: 0, problems };

  const byHash = new Map(inputs.map((i) => [i.hash, i]));
  const items: Array<{ item: CanonicalLineItem; fileId: string; rowIndex: number; raw: Record<string, string> }> = [];
  for (const file of batch.files) {
    if (file.extractionStatus !== "DONE") continue;
    const headers = parseJson<string[]>(file.headers, []);
    const input = byHash.get(headerHash(headers));
    if (!input) continue;
    const rows = parseJson<Record<string, string>[]>(file.rawRows, []);
    rows.forEach((raw, rowIndex) => {
      const item = applyMapping(raw, input.mapping, input.options);
      if (!item.title && !item.sku && item.costPrice === null) return; // blank/footer row
      items.push({ item, fileId: file.id, rowIndex, raw });
    });
  }

  if (batch.supplierId) {
    for (const input of inputs) {
      if (!input.saveTemplate?.name) continue;
      const existing = await prisma.mappingTemplate.findFirst({ where: { supplierId: batch.supplierId, headerHash: input.hash } });
      const data = { name: input.saveTemplate.name, mappings: JSON.stringify(input.mapping), options: JSON.stringify(input.options), headerHash: input.hash };
      if (existing) await prisma.mappingTemplate.update({ where: { id: existing.id }, data });
      else await prisma.mappingTemplate.create({ data: { ...data, supplierId: batch.supplierId } });
    }
  }

  const categoryRules = await loadCategoryRules();
  const grouped = groupLineItems(items.map((i) => i.item), categoryRules);

  // Rebuild the batch's products from scratch (mapping is re-runnable until export).
  await prisma.$transaction([
    prisma.extractedLineItem.deleteMany({ where: { batchId } }),
    prisma.product.deleteMany({ where: { batchId } }),
  ]);

  let variantCount = 0;
  let sort = 0;
  for (const g of grouped) {
    const product = await prisma.product.create({
      data: {
        batchId,
        handle: g.handle,
        title: g.title,
        bodyHtml: g.description ? `<p>${escapeHtml(g.description)}</p>` : "",
        vendor: g.brand,
        productType: g.productType,
        category: g.category,
        tags: g.tags.join(", "),
        collections: g.collections.join(", "),
        published: batch.publishOnExport,
        status: batch.publishOnExport ? "active" : "draft",
        option1Name: g.option1Name,
        option2Name: g.option2Name,
        option3Name: g.option3Name,
        metafields: JSON.stringify(g.metafields),
        sortOrder: sort++,
      },
    });
    let vsort = 0;
    for (const v of g.variants) {
      const src = items[v.sourceIndex];
      const variant = await prisma.variant.create({
        data: {
          productId: product.id,
          sku: v.item.sku,
          barcode: v.item.barcode,
          option1Value: v.option1Value,
          option2Value: v.option2Value,
          option3Value: v.option3Value,
          grams: v.item.grams ?? 0,
          quantity: v.item.quantity ?? 0,
          sortOrder: vsort++,
          costPrice: v.item.costPrice ?? 0,
          costCurrency: batch.currency,
          gstTreatment: batch.gstTreatment,
          fxRateToAud: batch.fxRateToAud,
          compareAtPrice: v.item.rrp ?? null,
        },
      });
      await prisma.extractedLineItem.create({
        data: { batchId, sourceFileId: src.fileId, rowIndex: src.rowIndex, raw: JSON.stringify(src.raw), normalized: JSON.stringify(v.item), variantId: variant.id },
      });
      variantCount++;
    }
    // Images: supplier URLs first, then the library.
    let position = 1;
    const urls = new Set<string>();
    for (const url of g.imageUrls) {
      if (urls.has(url)) continue;
      urls.add(url);
      await prisma.productImage.create({ data: { productId: product.id, url, position: position++, source: "SUPPLIER", altText: g.title } });
    }
    const modelCode = g.variants.map((v) => v.item.modelCode).find(Boolean) ?? "";
    if (urls.size === 0 && modelCode) {
      const colours = Array.from(new Set(g.variants.map((v) => v.item.colour).filter(Boolean)));
      for (const url of await findLibraryImages(g.brand, modelCode, colours[0] ?? "")) {
        if (urls.has(url)) continue;
        urls.add(url);
        await prisma.productImage.create({ data: { productId: product.id, url, position: position++, source: "LIBRARY", altText: g.title, validated: true } });
      }
      for (const colour of colours.slice(1)) {
        for (const url of await findLibraryImages(g.brand, modelCode, colour)) {
          if (urls.has(url)) continue;
          urls.add(url);
          await prisma.productImage.create({ data: { productId: product.id, url, position: position++, source: "LIBRARY", altText: `${g.title} ${colour}`, validated: true } });
        }
      }
    }
  }

  await allocateBatchFreight(batchId);
  await repriceBatch(batchId);
  await prisma.importBatch.update({ where: { id: batchId }, data: { status: "REVIEW" } });
  await logAudit("batch.mapped", { batchId, userId, details: { products: grouped.length, variants: variantCount } });
  void verifyBatchImages(batchId).catch(() => undefined);
  return { products: grouped.length, variants: variantCount, problems: [] };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

/** Spread the batch-level freight total across variants (stored per unit on each variant). */
export async function allocateBatchFreight(batchId: string): Promise<void> {
  const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: batchId } });
  const settings = await getSettings();
  const variants = await prisma.variant.findMany({ where: { product: { batchId } } });
  const lines = variants.map((v) => ({ id: v.id, quantity: v.quantity, exGstCostAud: exGstCostAud(v.costPrice, v.gstTreatment as GstTreatment, v.fxRateToAud, settings.gstRate) }));
  const alloc = allocateFreight(batch.freightTotalAud, batch.freightMode as "PER_UNIT" | "BY_VALUE", lines);
  await prisma.$transaction(variants.map((v) => prisma.variant.update({ where: { id: v.id }, data: { freightPerUnitAud: alloc[v.id] ?? 0 } })));
}

export async function repriceBatch(batchId: string): Promise<void> {
  const [settings, rules] = await Promise.all([getSettings(), loadPricingRules()]);
  const products = await prisma.product.findMany({ where: { batchId }, include: { variants: true } });
  const updates: Prisma.PrismaPromise<unknown>[] = [];
  for (const p of products) {
    for (const v of p.variants) {
      updates.push(prisma.variant.update({ where: { id: v.id }, data: computePricing(v, p, rules, settings) }));
    }
  }
  await prisma.$transaction(updates);
}

export async function repriceVariant(variantId: string): Promise<void> {
  const [settings, rules] = await Promise.all([getSettings(), loadPricingRules()]);
  const v = await prisma.variant.findUniqueOrThrow({ where: { id: variantId }, include: { product: true } });
  await prisma.variant.update({ where: { id: v.id }, data: computePricing(v, v.product, rules, settings) });
}

type VariantRow = { costPrice: number; gstTreatment: string; fxRateToAud: number; freightPerUnitAud: number; quantity: number; retailOverride: number | null; pricingRuleId: string | null; sku: string };
type ProductRow = { category: string; vendor: string };

export function computePricing(v: VariantRow, p: ProductRow, rules: PricingRuleLike[], settings: AppSettings) {
  const pinned = v.pricingRuleId ? rules.find((r) => r.id === v.pricingRuleId) ?? null : null;
  const rule = pinned ?? selectRule(rules, { category: p.category, brand: p.vendor, sku: v.sku, modelCode: "" });
  const r = priceVariant(
    { costPrice: v.costPrice, gstTreatment: v.gstTreatment as GstTreatment, fxRateToAud: v.fxRateToAud, freightPerUnitAud: v.freightPerUnitAud, quantity: v.quantity, rule, retailOverride: v.retailOverride },
    { gstRate: settings.gstRate, pricesIncludeGst: settings.pricesIncludeGst, minMarginPct: settings.minMarginPct },
  );
  return {
    landedCostAud: r.landedCostAud,
    retailPrice: r.retailPrice,
    exGstRevenue: r.exGstRevenue,
    gstComponent: r.gstComponent,
    profitPerUnit: r.profitPerUnit,
    marginPct: r.marginPct,
    markupPct: r.markupPct,
  };
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

export async function verifyBatchImages(batchId: string, limit = 300): Promise<{ checked: number; failed: number }> {
  const images = await prisma.productImage.findMany({ where: { product: { batchId }, validated: false }, take: limit });
  let failed = 0;
  const queue = [...images];
  const workers = Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const img = queue.shift()!;
      const res = await checkImageUrl(img.url);
      if (res.ok) await prisma.productImage.update({ where: { id: img.id }, data: { validated: true } });
      else failed++;
    }
  });
  await Promise.all(workers);
  return { checked: images.length, failed };
}

// ---------------------------------------------------------------------------
// Review view
// ---------------------------------------------------------------------------

export interface ReviewData {
  batch: {
    id: string;
    name: string;
    status: string;
    currency: string;
    fxRateToAud: number;
    gstTreatment: string;
    freightTotalAud: number;
    freightMode: string;
    publishOnExport: boolean;
    supplierName: string | null;
    notes: string | null;
  };
  products: ReviewProduct[];
  summary: ReviewSummary;
  settings: { gstRate: number; pricesIncludeGst: boolean; minMarginPct: number; shopifyConfigured: boolean; publicBaseUrl: string };
  rules: Array<{ id: string; name: string; mode: string; percent: number; scope: string; matchValue: string; roundTo: string }>;
  metafieldColumns: string[];
}

export async function loadReview(batchId: string): Promise<ReviewData> {
  const [batch, settings, rules] = await Promise.all([
    prisma.importBatch.findUniqueOrThrow({ where: { id: batchId }, include: { supplier: true } }),
    getSettings(),
    loadPricingRules(),
  ]);
  const products = await prisma.product.findMany({
    where: { batchId },
    orderBy: { sortOrder: "asc" },
    include: { variants: { orderBy: { sortOrder: "asc" } }, images: { orderBy: { position: "asc" } } },
  });
  const ruleNames = new Map(rules.map((r) => [r.id, r.name]));
  const view: ReviewProduct[] = products.map((p) => ({
    id: p.id,
    handle: p.handle,
    title: p.title,
    bodyHtml: p.bodyHtml,
    vendor: p.vendor,
    productType: p.productType,
    category: p.category,
    tags: p.tags,
    collections: p.collections,
    status: p.status,
    published: p.published,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    option1Name: p.option1Name,
    option2Name: p.option2Name,
    option3Name: p.option3Name,
    metafields: parseJson<Record<string, string>>(p.metafields, {}),
    reconcileStatus: p.reconcileStatus,
    shopifyProductId: p.shopifyProductId,
    images: p.images.map((i) => ({ id: i.id, url: i.url, position: i.position, variantId: i.variantId, source: i.source, validated: i.validated })),
    variants: p.variants.map<ReviewVariant>((v) => {
      const pinned = v.pricingRuleId ? ruleNames.get(v.pricingRuleId) ?? null : null;
      const auto = selectRule(rules, { category: p.category, brand: p.vendor, sku: v.sku, modelCode: "" });
      return {
        id: v.id,
        productId: p.id,
        sku: v.sku,
        barcode: v.barcode,
        option1Value: v.option1Value,
        option2Value: v.option2Value,
        option3Value: v.option3Value,
        grams: v.grams,
        quantity: v.quantity,
        costPrice: v.costPrice,
        costCurrency: v.costCurrency,
        gstTreatment: v.gstTreatment,
        fxRateToAud: v.fxRateToAud,
        freightPerUnitAud: v.freightPerUnitAud,
        pricingRuleId: v.pricingRuleId,
        pricingRuleName: pinned ?? auto?.name ?? "Fallback 40% margin",
        retailOverride: v.retailOverride,
        compareAtPrice: v.compareAtPrice,
        landedCostAud: v.landedCostAud,
        retailPrice: v.retailPrice,
        exGstRevenue: v.exGstRevenue,
        gstComponent: v.gstComponent,
        profitPerUnit: v.profitPerUnit,
        marginPct: v.marginPct,
        markupPct: v.markupPct,
        reconcileStatus: v.reconcileStatus,
        shopifyVariantId: v.shopifyVariantId,
        warningsDismissed: parseJson<string[]>(v.warningsDismissed, []),
        flags: [],
      };
    }),
    flags: [],
  }));

  const catalog = await shopifyLookups(view);
  validateReview(view, { minMarginPct: settings.minMarginPct, shopifySkus: catalog.skus, shopifyHandles: catalog.handles });
  const summary = summarise(view);
  await prisma.importBatch.update({ where: { id: batchId }, data: { summary: JSON.stringify(summary) } });

  return {
    batch: {
      id: batch.id,
      name: batch.name,
      status: batch.status,
      currency: batch.currency,
      fxRateToAud: batch.fxRateToAud,
      gstTreatment: batch.gstTreatment,
      freightTotalAud: batch.freightTotalAud,
      freightMode: batch.freightMode,
      publishOnExport: batch.publishOnExport,
      supplierName: batch.supplier?.name ?? null,
      notes: batch.notes,
    },
    products: view,
    summary,
    settings: {
      gstRate: settings.gstRate,
      pricesIncludeGst: settings.pricesIncludeGst,
      minMarginPct: settings.minMarginPct,
      shopifyConfigured: Boolean(settings.shopify.storeDomain && settings.shopify.accessToken),
      publicBaseUrl: process.env.BLOB_READ_WRITE_TOKEN ? "blob" : settings.publicBaseUrl || process.env.APP_PUBLIC_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : ""),
    },
    rules: rules.map((r) => ({ id: r.id, name: r.name, mode: r.mode, percent: r.percent, scope: r.scope, matchValue: r.matchValue, roundTo: r.roundTo })),
    metafieldColumns: SKI_METAFIELDS.map(metafieldColumn),
  };
}

async function shopifyLookups(products: ReviewProduct[]): Promise<{ skus: Map<string, string>; handles: Set<string> }> {
  const skuList = products.flatMap((p) => p.variants.map((v) => v.sku.trim())).filter(Boolean);
  const handleList = products.map((p) => p.handle);
  const skus = new Map<string, string>();
  const handles = new Set<string>();
  if (skuList.length === 0 && handleList.length === 0) return { skus, handles };
  const items = await prisma.shopifyCatalogItem.findMany({
    where: { OR: [{ sku: { in: skuList } }, { handle: { in: handleList } }] },
    select: { sku: true, handle: true },
  });
  for (const it of items) {
    if (it.sku) skus.set(it.sku.toLowerCase(), it.handle);
    handles.add(it.handle);
  }
  return { skus, handles };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export interface ExportResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  files: Array<{ id: string; filename: string; rowCount: number; sizeBytes: number; partIndex: number; partCount: number }>;
}

/** Hard gate: refuses while blocking errors exist; warnings need `overrideWarnings`. */
export async function exportBatch(batchId: string, userId: string, opts: { overrideWarnings: boolean }): Promise<ExportResult> {
  const review = await loadReview(batchId);
  const errors = blockingErrors(review.products);
  const warnings = warningList(review.products);
  if (review.products.length === 0) return { ok: false, errors: ["Nothing to export - map the files first."], warnings, files: [] };
  if (errors.length) return { ok: false, errors, warnings, files: [] };
  if (warnings.length && !opts.overrideWarnings) return { ok: false, errors: [], warnings, files: [] };

  const csvProducts = toCsvProducts(review.products, review.batch.publishOnExport);
  const structural = validateProducts(csvProducts).filter((i) => i.level === "error").map((i) => `${i.handle ?? ""}: ${i.message}`);
  if (structural.length) return { ok: false, errors: structural, warnings, files: [] };

  const parts = generateCsvParts(csvProducts, { metafieldColumns: review.metafieldColumns });
  for (const part of parts) {
    const fileIssues = validateCsvFile(part.content).filter((i) => i.level === "error");
    if (fileIssues.length) return { ok: false, errors: fileIssues.map((i) => i.message), warnings, files: [] };
  }

  await prisma.exportFile.deleteMany({ where: { batchId } });
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
  const base = `${slugForFile(review.batch.name)}-${stamp}`;
  const files: ExportResult["files"] = [];
  for (const part of parts) {
    const filename = parts.length > 1 ? `${base}-part${part.index}-of-${parts.length}.csv` : `${base}.csv`;
    const storagePath = await saveFile("exports", filename, Buffer.from(part.content, "utf8"));
    const rec = await prisma.exportFile.create({ data: { batchId, filename, storagePath, partIndex: part.index, partCount: parts.length, rowCount: part.rowCount, sizeBytes: part.bytes } });
    files.push({ id: rec.id, filename, rowCount: part.rowCount, sizeBytes: part.bytes, partIndex: part.index, partCount: parts.length });
  }

  // Grow the image library from what was just exported.
  for (const p of review.products) {
    const urls = p.images.map((i) => i.url);
    if (!urls.length) continue;
    const modelCode = (await prisma.extractedLineItem.findFirst({ where: { variantId: { in: p.variants.map((v) => v.id) } } }))?.normalized;
    const item = parseJson<CanonicalLineItem | null>(modelCode ?? null, null);
    if (item?.modelCode) await recordLibraryImages(p.vendor, item.modelCode, "", urls, "EXPORT");
  }

  await prisma.importBatch.update({ where: { id: batchId }, data: { status: "EXPORTED", exportedAt: new Date(), summary: JSON.stringify(review.summary) } });
  await logAudit("batch.exported", {
    batchId,
    userId,
    details: { files: files.map((f) => f.filename), products: review.products.length, variants: review.summary.variants, overrideWarnings: opts.overrideWarnings, warnings: warnings.length, summary: review.summary, snapshot: csvProducts },
  });
  return { ok: true, errors: [], warnings, files };
}

function slugForFile(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "batch";
}

export async function readExportFile(id: string): Promise<{ filename: string; content: Buffer } | null> {
  const rec = await prisma.exportFile.findUnique({ where: { id } });
  if (!rec) return null;
  return { filename: rec.filename, content: await readFile(rec.storagePath) };
}
