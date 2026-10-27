// Server-side orchestration: ingest -> extract -> map -> group -> price -> images -> review -> export.

import type { Prisma } from "@prisma/client";
import { productTitle, seasonTagFrom, seoTitle, titleYear, titledForShop } from "./titles";
import { isOfType, isSkipped, parseDirectives, typeKey } from "./instructions";
import { prisma, parseJson } from "./db";
import { extractFile, type UploadKind } from "./extract";
import { applyMapping, headerHash, looksLikeReference, mappingProblems, repairTemplate, seasonFrom, suggestMapping, suggestOptions, type Mapping, type MappingOptions, type SavedOptions, nearestTemplate, trimToHeaders, type LayoutDrift } from "./mapping";
import { groupLineItems } from "./grouping";
import { houseTags, retagForType } from "./product-tags";
import { DEFAULT_CATEGORY_RULES, type CategoryRuleLike } from "./categorize";
import { enrichFromSpecs, normKey } from "./specs";
import { keepOrderedLines, resolveAgainstReference } from "./reference-match";
import { isFlatSki, isPackageBinding, packageProducts, specFromName, type ChosenBindings } from "./trades/snow/packages";
import { readInvoiceGrids, type PriceRow } from "./invoice";
import { asShopPrice, existingHandle, listingByBarcode, listingsAsReference, rememberedVendor } from "./shop-memory";
import { dueInWindow, parseWindow } from "./deliveries";
import { siblingsOfPlaced } from "./siblings";
import { writeOutColour } from "./colour";
import { audienceByModel, brandIn, isBrand } from "./brands";
import { askToJoin } from "./reference-ai";
import { aiAvailable } from "./anthropic";
import { repairCategoryRules, repairProductTags, repairTagRuleSpelling } from "./seed";
import { applyTagRules, type TagRuleLike } from "./rules";
import { conventionGrams, conventionIdentifiers } from "./house";
import { shopBody } from "./description-style";
import { houseConventions, metafieldDefs } from "./taxonomy";
import { homeCurrency } from "./shop-profile";
import { applyTemplates, type ProductTemplateLike } from "./templates";
import { allocateFreight, exGstCostHome, priceVariant } from "./pricing";
import { getSettings } from "./settings";
import { checkImageUrl, findLibraryImages, recordLibraryImages } from "./images";
import { framePicture, hostPictures } from "./pictures";
import { keeper } from "./rebuild-keep";
import { generateCsvParts, validateCsvFile, validateProducts } from "./csv";
import { toCsvProducts } from "./pipeline-pure";
import { repairForExport, type Repair } from "./repair";
export { toCsvProducts };
import { metafieldColumn, type AppSettings, type CanonicalLineItem, type GstTreatment, CANONICAL_FIELDS } from "./types";
import type { ReviewProduct, ReviewSummary, ReviewVariant } from "./review-types";
import { hardErrors, summarise, validateReview, warningList } from "./validate";
import { readsKnown } from "./supplier-record";
import { supplierRecordFor } from "./supplier-score";
import { loadTagGate, partitionTags, recordTagProposals } from "./tag-gate";
import { scoreProduct, tallyConfidence } from "./confidence";
import { isValidType, typesAreKnown } from "./taxonomy";
import type { MatchCandidate } from "./match-candidates";
import { filePath, pictureHosting, publicFileUrl, readFile, saveFile, usingBlob } from "./storage";
import { logAudit } from "./audit";
import { contributeLayout, findSharedLayout } from "./shared-layouts-store";
import { fillFromForm, formAndInvoice, invoiceOf, overlapOf } from "./order-and-invoice";
import { isReaderTable, readerMapping } from "./extract/ai";

// ---------------------------------------------------------------------------
// Rules & settings helpers
// ---------------------------------------------------------------------------

export async function loadTagRules(): Promise<TagRuleLike[]> {
  // Correct a seeded rule that adds a tag the shop does not write, before it writes it onto
  // everything it matches. It has to be here, for the same reason the category repair is in
  // loadCategoryRules two functions down: the only other caller is the seeder, which runs once on
  // an empty database, so a shop that seeded the old rules had no way to reach the fix. Fixing the
  // defaults in code was never going to help a database that already had the rows.
  await repairTagRuleSpelling().catch(() => 0);
  return prisma.tagRule.findMany({ orderBy: { priority: "desc" } });
}

/** Templates learned from uploaded Shopify exports, shaped for the pure applier. */
export async function loadProductTemplates(): Promise<ProductTemplateLike[]> {
  const rows = await prisma.productTemplate.findMany({ where: { active: true }, orderBy: { priority: "asc" } });
  return rows.map((t) => ({
    id: t.id,
    name: t.name,
    scope: t.scope as ProductTemplateLike["scope"],
    matchValue: t.matchValue,
    matchProductType: t.matchProductType,
    notes: t.notes,
    productType: t.setProductType,
    tags: splitCsv(t.addTags),
    collections: splitCsv(t.addCollections),
    optionNames: splitCsv(t.optionNames),
    metafields: parseJson<Record<string, string>>(t.setMetafields, {}),
    priority: t.priority,
    active: t.active,
  }));
}

/** Re-run the tag/collection/type/metafield rules over every product in a batch. */
export async function applyRulesToBatch(batchId: string): Promise<{ products: number; matched: number; templated: number }> {
  const [rules, templates] = await Promise.all([loadTagRules(), loadProductTemplates()]);
  const products = await prisma.product.findMany({ where: { batchId }, include: { variants: { select: { sku: true } } } });
  let matched = 0;
  let templated = 0;
  for (const p of products) {
    // Templates lay down the house conventions first; hand-written rules run after so an
    // explicit rule always beats a learned default.
    const viaTemplate = applyTemplates(
      {
        vendor: p.vendor,
        productType: p.productType,
        category: p.category,
        tags: splitCsv(p.tags),
        collections: splitCsv(p.collections),
        metafields: parseJson<Record<string, string>>(p.metafields, {}),
        optionNames: [p.option1Name, p.option2Name, p.option3Name].filter((n): n is string => Boolean(n)),
      },
      templates,
    );
    if (viaTemplate.applied.length) templated++;
    const out = applyTagRules(
      { title: p.title, vendor: p.vendor, category: p.category, productType: viaTemplate.productType, skus: p.variants.map((v) => v.sku), tags: viaTemplate.tags, collections: viaTemplate.collections, metafields: viaTemplate.metafields },
      rules,
    );
    if (out.matched.length) matched++;
    await prisma.product.update({
      where: { id: p.id },
      data: {
        tags: out.tags.join(", "),
        collections: out.collections.join(", "),
        productType: out.productType,
        metafields: JSON.stringify(out.metafields),
        option1Name: viaTemplate.optionNames[0] ?? p.option1Name,
        option2Name: viaTemplate.optionNames[1] ?? p.option2Name,
        option3Name: viaTemplate.optionNames[2] ?? p.option3Name,
      },
    });
  }
  return { products: products.length, matched, templated };
}

function splitCsv(s: string): string[] {
  return s.split(",").map((t) => t.trim()).filter(Boolean);
}

export async function loadCategoryRules(): Promise<CategoryRuleLike[]> {
  // Correct a rule naming a Type the shop does not have before using it, rather than writing that
  // Type onto every product it matches. Does nothing once there is nothing wrong, which is almost
  // always, and it has to be here: the button that seeds defaults only shows on an empty list, so
  // a shop that seeded a bad rule once had no way to reach the fix.
  await repairCategoryRules().catch(() => 0);
  const rows = await prisma.categoryRule.findMany({ orderBy: { priority: "desc" } });
  return rows.length > 0 ? rows : DEFAULT_CATEGORY_RULES;
}

// ---------------------------------------------------------------------------
// Ingest & extract
// ---------------------------------------------------------------------------

export interface IngestResult {
  id: string;
  rows: number;
  method: string | null;
  kind: string; // effective kind after AI classification
  warnings: string[];
}

const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

/**
 * Put the file somewhere safe and say so. Reading it comes after.
 *
 * Reading a scanned invoice is a vision call over a photograph, and on a size grid it is a slow
 * one — well past the minute a deployed request gets. Doing it inside the upload meant the upload
 * itself failed, losing the file along with the reading, and telling somebody their upload failed
 * when it had in fact arrived perfectly.
 */
export async function storeFile(batchId: string, given: { filename: string; mimeType: string; buffer: Buffer; kind?: UploadKind }): Promise<{ id: string }> {
  // An iPhone HEIC is stored as the JPEG it decodes to, so everything after this can read it.
  const file = await (await import("./extract/heic")).asReadableImage(given);
  const storagePath = await saveFile("invoices", file.filename, file.buffer);
  const record = await prisma.sourceFile.create({
    data: {
      batchId,
      filename: file.filename,
      mimeType: file.mimeType || "application/octet-stream",
      sizeBytes: file.buffer.length,
      storagePath,
      kind: file.kind ?? "AUTO",
      extractionStatus: "PENDING",
      readStartedAt: new Date(),
    },
  });
  return { id: record.id };
}

/** Whether the batch's supplier has a record clean enough for its paperwork to be read on the lighter model. */
async function supplierReadsKnown(batchId: string): Promise<boolean> {
  try {
    const batch = await prisma.importBatch.findUnique({ where: { id: batchId }, select: { supplierId: true } });
    if (!batch?.supplierId) return false;
    return readsKnown(await supplierRecordFor(batch.supplierId, batchId));
  } catch {
    return false;
  }
}

/** Read a file that is already stored, and record what came of it. */
export async function extractStoredFile(fileId: string, origin?: string): Promise<IngestResult> {
  const record = await prisma.sourceFile.findUniqueOrThrow({ where: { id: fileId } });
  const buffer = await readFile(record.storagePath);
  return ingestFile(record.batchId, { filename: record.filename, mimeType: record.mimeType, buffer, kind: record.kind as UploadKind, origin, existingFileId: record.id });
}

export async function ingestFile(batchId: string, given: { filename: string; mimeType: string; buffer: Buffer; kind?: UploadKind; origin?: string; existingFileId?: string }): Promise<IngestResult> {
  const file = await (await import("./extract/heic")).asReadableImage(given);
  const requested: UploadKind = file.kind ?? "AUTO";
  const record = file.existingFileId
    ? await prisma.sourceFile.update({ where: { id: file.existingFileId }, data: { extractionStatus: "PENDING", readStartedAt: new Date() } })
    : await prisma.sourceFile.create({
        data: { batchId, filename: file.filename, mimeType: file.mimeType || "application/octet-stream", sizeBytes: file.buffer.length, storagePath: await saveFile("invoices", file.filename, file.buffer), kind: requested },
      });
  try {
    /**
     * The shop's own export, dropped in beside the supplier's files. It is not a delivery and not a
     * reference sheet: it is what the shop already sells — its handles, its prices ending in .99,
     * its riding-style shelves, which binding it packaged each ski with. Remembered, and nothing is
     * built from it. The Bulk page learns the same way from the exports loaded on it.
     */
    if (/\.csv$/i.test(file.filename)) {
      const { parseCsv } = await import("./csv");
      const text = file.buffer.toString("utf8");
      const { isShopifyExport, rememberListings } = await import("./shop-memory-store");
      if (isShopifyExport(parseCsv(text.slice(0, 20000))[0] ?? [])) {
        const { listingsFromCsv } = await import("./shop-memory");
        const remembered = await rememberListings(listingsFromCsv(text));
        const note = `Your shop's own export: ${remembered} products remembered — their handles, prices, tags and binding packages are what new listings follow, and a product the shop already has keeps its handle. Nothing is built from this file.`;
        await prisma.sourceFile.update({ where: { id: record.id }, data: { extractionStatus: "DONE", extractionMethod: "CSV", detectedKind: "SHOP_EXPORT", headers: "[]", rawRows: "[]", extractionError: note } });
        return { id: record.id, rows: 0, method: "CSV", kind: requested, warnings: [note] };
      }
    }
    // A supplier whose paperwork reads clean on its record is read on the lighter model, at about
    // half the price; the record keeps watching, so one that starts reading badly goes back.
    const known = await supplierReadsKnown(batchId);
    // How the supplier's lines were read before, as the shop settled them: given to the reader as
    // examples, and its layouts tell a document from a system it has not sent before. See read-examples.ts.
    const history = await (await import("./read-examples-store")).supplierHistory(batchId).catch(() => ({ examples: [], layouts: [] }));
    const started = Date.now();
    const { table, meta } = await extractFile(file.buffer, file.filename, file.mimeType, requested, { known }, history);
    // How long the read took is the number behind "this is slow", so it is kept where it can be
    // seen: the server log, and the History page.
    const tookMs = Date.now() - started;
    const lighter = known && !table.warnings.some((w) => w.startsWith("A layout this supplier has not sent before"));
    console.log(`[read] ${file.filename}: ${table.method} in ${(tookMs / 1000).toFixed(1)}s, ${table.rows.length} rows${lighter ? ", lighter model" : ""}`);
    await logAudit("file.read", { batchId, details: { fileId: record.id, filename: file.filename, method: table.method, rows: table.rows.length, tookMs, reader: lighter ? "lighter" : "full", examples: history.examples.length } }).catch(() => undefined);
    const detected = meta?.documentType ?? null;
    // A spreadsheet never reached the model, so nothing classified it and everything came through
    // as a delivery. Its columns say what it is: see looksLikeReference.
    const reference = detected === null && looksLikeReference(table.headers);
    /**
     * An order form uploaded as "barcodes, specs or descriptions" is still the order. The kind is
     * picked once on the page and stays picked, so the Völkl order went up as a reference sheet
     * after its PIM export did — and a batch with no order in it has nothing arriving, builds
     * nothing, and offered no way on. Quantities written against some of its rows settle it.
     */
    const orderedHere = (() => {
      if (table.warnings.some((w) => /^Read as an order/.test(w))) return true;
      const qty = Object.entries(suggestMapping(table.headers, table.rows)).find(([, k]) => k === "quantity")?.[0];
      if (!qty) return false;
      const filled = table.rows.filter((r) => Number((r[qty] ?? "").toString().replace(/[^\d.]/g, "")) > 0).length;
      return filled > 0 && filled < table.rows.length;
    })();
    const misfiled = requested === "SPEC_SHEET" && orderedHere;
    const effective: UploadKind = misfiled ? "INVOICE"
      : requested !== "AUTO" ? requested
      : detected === "SPEC_SHEET" || reference ? "SPEC_SHEET"
      : detected === "PRODUCT_PHOTO" ? "PRODUCT_PHOTO"
      : "INVOICE";
    const warnings = [...table.warnings];
    if (misfiled) warnings.push("Uploaded as barcodes, specs or descriptions, but quantities are written against some of its rows, so it was read as the order.");
    if (reference) {
      warnings.push(`Read as a reference sheet: ${table.rows.length} rows with no price or quantity on them, so nothing here is a delivery. It is searched for the products the order builds — barcodes, specs, descriptions — and adds none of its own.`);
    }

    if (effective === "PRODUCT_PHOTO" && PHOTO_TYPES.has(file.mimeType)) {
      // A photo of a product: keep it as an image, not as line items.
      const settings = await getSettings();
      // Set on its square like every other picture, where it can be read; kept as sent where not.
      const framed = await framePicture(file.buffer).catch(() => null);
      const ref = await saveFile("images", framed ? file.filename.replace(/\.[^.]+$/, "") + ".jpg" : file.filename, framed ? framed.data : file.buffer);
      const url = publicFileUrl(ref, settings.publicBaseUrl) ?? `${file.origin ?? ""}${filePath(ref)}`;
      const seen = table.rows[0];
      const hint = seen ? [seen.brand, seen.title, seen.modelCode, seen.colour].filter(Boolean).join(" ") : "";
      await prisma.unassignedImage.create({ data: { batchId, filename: file.filename, url, hint } });
      await prisma.sourceFile.update({ where: { id: record.id }, data: { extractionStatus: "DONE", extractionMethod: table.method, detectedKind: "PRODUCT_PHOTO", headers: "[]", rawRows: "[]", extractionError: hint ? `Product photo: ${hint}` : "Product photo" } });
      if (!publicFileUrl(ref, settings.publicBaseUrl)) warnings.push("No public URL is configured (Settings), so Shopify will not be able to fetch this photo until one is set.");
      return { id: record.id, rows: 0, method: table.method, kind: "PRODUCT_PHOTO", warnings: [hint ? `Recognised: ${hint}.` : "Stored as a product photo.", ...warnings] };
    }

    await prisma.sourceFile.update({
      where: { id: record.id },
      data: {
        extractionStatus: "DONE",
        extractionMethod: table.method,
        detectedKind: effective,
        headers: JSON.stringify(table.headers),
        rawRows: JSON.stringify(table.rows),
        extractedText: table.text ?? null,
        layout: table.layout ?? null,
        extractionError: warnings.length ? warnings.join(" ") : null,
        priceList: JSON.stringify(await priceListOf(file.filename, file.buffer)),
      },
    });
    if (meta && effective === "INVOICE") {
      const batch = await prisma.importBatch.findUnique({ where: { id: batchId }, select: { currency: true } });
      const data: Prisma.ImportBatchUpdateInput = {};
      if (meta.currency && batch?.currency === homeCurrency() && meta.currency !== homeCurrency()) data.currency = meta.currency;
      if (meta.gstTreatment && meta.gstTreatment !== "UNKNOWN") data.gstTreatment = meta.gstTreatment;
      if (Object.keys(data).length) await prisma.importBatch.update({ where: { id: batchId }, data });
    }
    await prisma.importBatch.update({ where: { id: batchId }, data: { status: "EXTRACTED" } });
    return { id: record.id, rows: table.rows.length, method: table.method, kind: effective, warnings };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.sourceFile.update({ where: { id: record.id }, data: { extractionStatus: "FAILED", extractionError: message } });
    return { id: record.id, rows: 0, method: null, kind: requested, warnings: [message] };
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
  confident: boolean; // safe to apply without showing the mapping screen
  /** Set when the supplier has a remembered layout and this file's columns differ from it. */
  drift: LayoutDrift | null;
  /** How many other shops taught the reading in use, where it came from them rather than this shop. */
  sharedBy: number | null;
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
      const isCanonical = isReaderTable(headers);
      const exact = templates.find((t) => t.headerHash === hash) ?? null;
      // No layout matches exactly: the nearest remembered one is carried over where its columns
      // still exist, and the difference is reported rather than the file being read from scratch.
      const near = !exact && !isCanonical ? nearestTemplate(headers, templates) : null;
      const template = exact ?? near?.template ?? null;
      const saved = template ? parseJson<SavedOptions>(template.options, {}) : null;
      const fresh = suggestMapping(headers, rows);
      // A layout this shop has never seen may be one other shops buying from the same supplier
      // have: their reading stands where it differs from the fresh one, unless the data rules it out.
      const shared = !template && !isCanonical ? await findSharedLayout(headers) : null;
      const suggestion = template
        ? repairTemplate(trimToHeaders(parseJson<Mapping>(template.mappings, {}), headers) ?? {}, fresh, rows, trimToHeaders(saved?.suggestedAtSave, headers))
        : isCanonical ? readerMapping(headers) : shared ? repairTemplate(shared.mappings, fresh, rows, fresh) : fresh;
      group = {
        hash,
        headers,
        fileIds: [],
        filenames: [],
        rowCount: 0,
        sampleRows: [],
        suggestion,
        // A template's fixed values stand. Whether cost is a line total is worked out again from
        // the mapping in use, unless somebody set it on a template that records what they chose:
        // an old one said "TOTAL $ is the cost, and it is a line total", and the cost is AUD-WHSL.
        options: template && saved
          ? {
              ...(saved.fixed ? { fixed: saved.fixed } : {}),
              ...(saved.suggestedAtSave ? (saved.costIsLineTotal ? { costIsLineTotal: true } : {}) : suggestOptions(suggestion)),
            }
          : { ...(isCanonical ? {} : suggestOptions(fresh)), ...(batch.supplier?.defaultBrand ? { fixed: { brand: batch.supplier.defaultBrand } } : {}) },
        templateId: exact?.id ?? null,
        templateName: template?.name ?? (shared ? `Taught by ${shared.shops} other ${shared.shops === 1 ? "shop" : "shops"}` : null),
        isCanonical,
        confident: false,
        drift: near?.drift ?? null,
        sharedBy: shared?.shops ?? null,
      };
      groups.set(hash, group);
    }
    group.fileIds.push(file.id);
    group.filenames.push(file.filename);
    group.rowCount += rows.length;
    if (group.sampleRows.length < 3) group.sampleRows.push(...rows.slice(0, 3 - group.sampleRows.length));
  }
  for (const g of groups.values()) {
    // Enough to build products from: the name. Everything else is a column the grid can fill in.
    g.confident = !g.drift && (Boolean(g.templateId) || g.isCanonical || mappingProblems(g.suggestion).length === 0);
  }
  return Array.from(groups.values());
}

/**
 * Build the products from the suggested mappings, without anyone being asked.
 *
 * Mapping columns was a step of its own, and it should not have been: the suggestion is right
 * almost every time, and where it is not, the place to fix it is the review grid, which is where
 * the operator is looking anyway. So every layout the suggestion can build from is built, and only
 * a layout with no recognisable product name is left for the mapping screen to sort out.
 */
export async function autoApplyMappings(batchId: string, userId: string | null): Promise<{ applied: boolean; products: number; variants: number; unmapped: string[]; drifted: string[] }> {
  const groups = await mappingState(batchId);
  // A file laid out differently from the supplier's remembered layout is not built unasked: the
  // columns that moved are the ones a remembered mapping gets wrong, so a person confirms them
  // once, on the mapping screen, and the new layout is remembered beside the old.
  const usable = groups.filter((g) => !g.drift && mappingProblems(g.suggestion).length === 0);
  const drifted = groups.filter((g) => g.drift).map((g) => describeDrift(g));
  const unmapped = groups.filter((g) => !usable.includes(g) && !g.drift).flatMap((g) => g.filenames);
  if (usable.length === 0) return { applied: false, products: 0, variants: 0, unmapped, drifted };
  const result = await applyMappings(batchId, usable.map((g) => ({ hash: g.hash, mapping: g.suggestion, options: g.options, saveTemplate: null })), userId);
  for (const g of usable.filter((x) => x.sharedBy)) {
    await logAudit("layout.shared-used", { batchId, userId, details: { files: g.filenames.length, shops: g.sharedBy } }).catch(() => undefined);
  }
  return { applied: result.problems.length === 0 && drifted.length === 0, products: result.products, variants: result.variants, unmapped, drifted };
}

/** One sentence on how a file differs from the layout remembered for its supplier. */
export function describeDrift(g: Pick<HeaderGroup, "filenames" | "drift">): string {
  const d = g.drift;
  if (!d) return "";
  const parts: string[] = [];
  if (d.added.length) parts.push(`new column${d.added.length === 1 ? "" : "s"} ${d.added.map((h) => `"${h}"`).join(", ")}`);
  if (d.missing.length) parts.push(`${d.missing.map((m) => `"${m.header}" (was the ${fieldLabel(m.field)})`).join(", ")} gone`);
  return `${g.filenames.join(", ")} is laid out differently from "${d.templateName}": ${parts.join("; ") || "the columns are in a different order"}. Open Column mapping, confirm where things are now, and this layout is remembered too.`;
}

function fieldLabel(key: string): string {
  return CANONICAL_FIELDS.find((f) => f.key === key)?.label.toLowerCase() ?? key;
}

export interface ApplyMappingInput {
  hash: string;
  mapping: Mapping;
  options: MappingOptions;
  saveTemplate?: { name: string } | null;
}

/** Apply column mappings to every extracted file, then (re)build products, variants, prices and images. */
/** How long the last build in this process took, phase by phase, for the page to say. */
let lastBuildTiming: { tookMs: number; phases: string[] } | null = null;
export function lastBuild(): { tookMs: number; phases: string[] } | null {
  return lastBuildTiming;
}

export async function applyMappings(batchId: string, inputs: ApplyMappingInput[], userId: string | null): Promise<{ products: number; variants: number; problems: string[] }> {
  // Where a build's time goes, phase by phase, to the server log and the History page: the
  // number behind "why is it so slow" is otherwise a guess.
  const phases: Array<[string, number]> = [];
  let mark = Date.now();
  const phase = (name: string) => { const now = Date.now(); phases.push([name, now - mark]); mark = now; };
  const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: batchId }, include: { files: true, supplier: true } });
  const problems: string[] = [];
  for (const input of inputs) for (const p of mappingProblems(input.mapping)) problems.push(`${input.hash}: ${p}`);
  if (problems.length) return { products: 0, variants: 0, problems };
  // The store, read again when its last read is a day old, so the listings and vocabulary this
  // build places products against are the store's as it is now. See store-sync.ts.
  {
    const { refreshStoreIfStale } = await import("./store-sync");
    await refreshStoreIfStale(userId);
    phase("store");
  }

  const byHash = new Map(inputs.map((i) => [i.hash, i]));
  const items: Array<{ item: CanonicalLineItem; fileId: string; rowIndex: number; raw: Record<string, string> }> = [];
  const specItems: CanonicalLineItem[] = [];
  const specSource = new Map<CanonicalLineItem, string>();
  for (const file of batch.files) {
    if (file.extractionStatus !== "DONE") continue;
    const headers = parseJson<string[]>(file.headers, []);
    if (headers.length === 0) continue;
    const input = byHash.get(headerHash(headers));
    if (!input) continue;
    const isSpec = (file.detectedKind ?? file.kind) === "SPEC_SHEET";
    const rows = parseJson<Record<string, string>[]>(file.rawRows, []);
    rows.forEach((raw, rowIndex) => {
      const item = applyMapping(raw, input.mapping, input.options);
      if (!item.title && !item.sku && item.costPrice === null) return; // blank/footer row
      if (isSpec) { specItems.push(item); specSource.set(item, file.id); }
      else items.push({ item, fileId: file.id, rowIndex, raw });
    });
  }
  // A two-tone colour the sheet abbreviates ("RUMRSN/CHLGRY") is written out with the names the
  // sheet uses in full elsewhere ("Rum Raisin", "Chinchilla Gray"). See writeOutColour.
  const colourNames = [...items.map((e) => e.item.colour), ...specItems.map((s) => s.colour)].filter((c) => c.trim() && !c.includes("/"));
  for (const entry of items) if (entry.item.colour.includes("/")) entry.item = { ...entry.item, colour: writeOutColour(entry.item.colour, colourNames, /goggle/i.test(`${entry.item.category} ${entry.item.productType} ${entry.item.title}`)) };

  /**
   * An order form and its invoice in one batch are one delivery, not two. Both carry quantities,
   * and read as two deliveries every product came out with twice the stock. Two files most of
   * whose lines are the same goods are taken as the pair: the invoice's lines are what arrived and
   * what it cost, indent discounts and all, and each is filled in from its order-form line with
   * what the invoice leaves out (barcodes, retail prices). The order form adds no lines of its own.
   */
  {
    const fileIds = [...new Set(items.map((i) => i.fileId))];
    const linesOf = (id: string) => items.filter((i) => i.fileId === id);
    const nameOf = (id: string) => batch.files.find((f) => f.id === id)?.filename ?? "";
    const paired = new Set<string>();
    for (let a = 0; a < fileIds.length; a++) {
      for (let b = a + 1; b < fileIds.length; b++) {
        const [x, y] = [fileIds[a], fileIds[b]];
        if (paired.has(x) || paired.has(y)) continue;
        const [lx, ly] = [linesOf(x), linesOf(y)];
        if (overlapOf(lx.map((e) => e.item), ly.map((e) => e.item)) < 0.5) continue;
        const { invoice, form } = invoiceOf({ name: nameOf(x), lines: lx.length, id: x }, { name: nameOf(y), lines: ly.length, id: y });
        // Two shipments of one order share their lines as well; only a form and its invoice are joined.
        if (!formAndInvoice({ name: form.name, lines: linesOf(form.id).map((e) => e.item) }, { name: invoice.name, lines: linesOf(invoice.id).map((e) => e.item) })) continue;
        const invoiceEntries = linesOf(invoice.id);
        const filled = fillFromForm(linesOf(form.id).map((e) => e.item), invoiceEntries.map((e) => e.item));
        invoiceEntries.forEach((e, i) => { e.item = filled.lines[i]; });
        items.splice(0, items.length, ...items.filter((e) => e.fileId !== form.id));
        paired.add(x); paired.add(y);
        await noteOnFile(invoice.id, `Read as the invoice for ${form.name}: what arrived and what it cost come from here, and ${filled.matched} of ${invoiceEntries.length} lines took their barcode and retail price from the order form.`);
        await noteOnFile(form.id, `Read as the order form for ${invoice.name}, which is what arrived: its lines fill in the invoice's barcodes and retail prices and add no products of their own.`);
      }
    }
  }

  // A spec-sheet-only batch still builds products: one variant per listed length/size, no cost yet.
  if (items.length === 0 && specItems.length > 0) {
    const specFile = batch.files.find((f) => (f.detectedKind ?? f.kind) === "SPEC_SHEET")!;
    specItems.forEach((spec, rowIndex) => {
      const sizes = (spec.length || spec.size).split(/[,/|]+/).map((x) => x.trim()).filter(Boolean);
      const variants = sizes.length ? sizes : [""];
      for (const sz of variants) {
        const v = { ...spec, imageUrls: [...spec.imageUrls], quantity: 0, costPrice: null, sku: "" };
        if (spec.length) v.length = sz;
        else v.size = sz;
        items.push({ item: v, fileId: specFile.id, rowIndex, raw: {} });
      }
    });
    specItems.length = 0;
  }

  const [categoryRules, tagRules, templates] = await Promise.all([loadCategoryRules(), loadTagRules(), loadProductTemplates()]);

  // Only what was ordered. See keepOrderedLines.
  const readAsOrder = keepOrderedLines(items);
  if (readAsOrder.notOrdered > 0 || readAsOrder.footers > 0) {
    for (const fileId of readAsOrder.files) {
      const total = items.filter((i) => i.fileId === fileId).length;
      const kept = readAsOrder.kept.filter((i) => i.fileId === fileId).length;
      await noteOnFile(fileId, `Read as an order: ${kept} of ${total} rows have a quantity against them, and only those were built. The rest is the supplier's price list for the season, not this delivery.`);
    }
    items.splice(0, items.length, ...readAsOrder.kept);
  }

  /**
   * Join the order to the supplier's reference sheet BEFORE the products are grouped.
   *
   * The join is what says which lines are one product — Burton spells Process two ways on the same
   * form — and what the product is called, what kind of thing it is and what season it belongs to,
   * none of which an order line says. See reference-match.ts. Where the API is available, the lines
   * the rules could not place are put to it as well; its answers are checked against the sheet
   * before any is used.
   */
  if (specItems.length > 0 && items.length > 0) {
    const lines = items.map((i) => i.item);
    let decided = new Map<number, CanonicalLineItem>();
    const sourceOf = (spec: CanonicalLineItem) => specSource.get(spec) ?? "";
    const first = resolveAgainstReference(lines, specItems, categoryRules, decided, sourceOf);
    const left = first.joined.map((j, i) => ("reason" in j ? i : -1)).filter((i) => i >= 0);
    if (left.length > 0 && aiAvailable()) {
      decided = await askToJoin(left.map((i) => ({ index: i, line: lines[i] })), specItems).catch(() => new Map());
    }
    const resolved = decided.size > 0 ? resolveAgainstReference(lines, specItems, categoryRules, decided, sourceOf) : first;
    resolved.items.forEach((item, k) => { items[k].item = item; });
    const joined = resolved.joined.filter((j) => "to" in j).length;
    const missing = [...new Set(resolved.joined.filter((j): j is { line: string; reason: string } => "reason" in j).map((j) => j.line))];
    const orderFiles = [...new Set(items.map((i) => i.fileId))];
    // A reference sheet none of the order is on is very likely the wrong file — Burton's description
    // list in a Völkl batch — and nothing else says so: it is simply never used.
    const fileOfTitle = new Map<string, string>();
    for (const spec of specItems) if (!fileOfTitle.has(spec.title)) fileOfTitle.set(spec.title, specSource.get(spec) ?? "");
    const usedFiles = new Set(resolved.joined.flatMap((j) => ("to" in j ? [fileOfTitle.get(j.to) ?? ""] : [])));
    for (const fileId of new Set(specItems.map((spec) => specSource.get(spec) ?? "").filter(Boolean))) {
      if (!usedFiles.has(fileId)) await noteOnFile(fileId, `None of this order's ${items.length} lines are on this sheet, so nothing was taken from it. If it should be part of this order, check it is the right file; if it belongs to another brand, remove it from this batch.`);
    }
    for (const fileId of orderFiles) {
      await noteOnFile(fileId, `Joined to the reference sheet: ${joined} of ${items.length} lines${missing.length ? `. Not on it, so built from the order alone: ${missing.slice(0, 6).join(", ")}${missing.length > 6 ? `, and ${missing.length - 6} more` : ""}` : ""}.`);
    }
  }

  if (batch.supplierId) {
    for (const input of inputs) {
      if (!input.saveTemplate?.name) continue;
      const existing = await prisma.mappingTemplate.findFirst({ where: { supplierId: batch.supplierId, headerHash: input.hash } });
      // What the app itself suggested for these columns, so a later reading can tell a person's
      // choice from a suggestion that was merely accepted. See repairTemplate.
      const file = batch.files.find((f) => headerHash(parseJson<string[]>(f.headers, [])) === input.hash);
      const suggestedAtSave = file ? suggestMapping(parseJson<string[]>(file.headers, []), parseJson<Record<string, string>[]>(file.rawRows, [])) : undefined;
      const options: SavedOptions = { ...input.options, ...(suggestedAtSave ? { suggestedAtSave } : {}) };
      const data = { name: input.saveTemplate.name, mappings: JSON.stringify(input.mapping), options: JSON.stringify(options), headerHash: input.hash };
      if (existing) await prisma.mappingTemplate.update({ where: { id: existing.id }, data });
      else await prisma.mappingTemplate.create({ data: { ...data, supplierId: batch.supplierId } });
      // A layout a person confirmed is offered to the other shops: its headings and fields only.
      if (file) void contributeLayout(parseJson<string[]>(file.headers, []), input.mapping);
    }
  }


  /**
   * Plenty of invoices never name the brand: a Giro order lists a helmet and a pair of goggles and
   * assumes you know who sent it. The supplier the batch was filed under does know, so a product
   * that arrives without a vendor takes theirs rather than going out with the column empty.
   */
  // Not the distributor, though: Sportrade sends Völkl and Marker, and its name went out as the
  // vendor and the tag of a whole Völkl order. The supplier's own name is a brand only if it is one.
  // See brands.ts.
  const knownVendors = [...new Set((await prisma.shopListing.findMany({ select: { vendor: true }, distinct: ["vendor"] }).catch(() => [])).map((l) => l.vendor).filter(Boolean))];
  const supplierName = batch.supplier?.name?.trim() ?? "";
  const supplierBrand = batch.supplier?.defaultBrand?.trim() || (isBrand(supplierName, knownVendors) ? supplierName : "");

  // What someone said about this invoice in words: the brand it all is, the tag it all needs, the
  // discount on all of it. A directive applies to every product in the batch by design.
  const directives = parseDirectives(batch.directives);

  // A year said in the instruction chat wins over whatever the supplier's file calls the season:
  // Burton's "27WIN" is 2027, and an April order for the 2026 range is still tagged 2026.
  // A year given as a tag in the chat is the season too (asked 2026-10-19): it is the product's one
  // year tag, not a second beside the file's, and the title and handle carry it.
  const toldYear = /^20\d{2}$/.test(directives.season.trim()) ? directives.season.trim() : [...directives.addTags].reverse().map((t) => t.trim()).find((t) => /^20\d{2}$/.test(t)) ?? "";
  if (toldYear) {
    for (const entry of items) entry.item = { ...entry.item, season: toldYear };
  } else if (items.length > 0 && items.every((entry) => !/^20\d{2}$/.test(entry.item.season))) {
    // No season on any line: the file's own name says it, where it does — Burton's confirmation
    // sheet is "Alpsport_W27_Burton_Confirmed…" and its lines carry no season column at all.
    // The latest year the name gives: "…_NOV_2026_boot_pole_-2027-Retail" is the 2027 range,
    // delivered in November 2026.
    const fromName = batch.files.flatMap((f) => f.filename.split(/[^A-Za-z0-9/]+/)).map(seasonFrom).filter((y) => /^20[2-3]\d$/.test(y)).sort().at(-1);
    if (fromName) {
      for (const entry of items) entry.item = { ...entry.item, season: fromName };
      for (const fileId of [...new Set(items.map((i) => i.fileId))]) await noteOnFile(fileId, `No column on this sheet says the season, so it was taken from the file's name: ${fromName}. Say "year tags 2026" in the chat if that is wrong.`);
    }
  }

  // No brand on any line, none said in the chat and no supplier to go by: the file's own name says
  // it, where it does — Dalbello's order form never names Dalbello, "Dalbello_MAY_2027_Order_.xlsx" does.
  if (!directives.vendor.trim() && !supplierBrand && items.length > 0 && items.every((entry) => !entry.item.brand.trim())) {
    const fromName = brandIn(batch.files.map((f) => f.filename.replace(/\.[a-z0-9]+$/i, "").replace(/[_.\-]+/g, " ")).join(" "), knownVendors);
    if (fromName) {
      for (const entry of items) entry.item = { ...entry.item, brand: fromName };
      for (const fileId of [...new Set(items.map((i) => i.fileId))]) await noteOnFile(fileId, `No column on this sheet says the brand, so it was taken from the file's name: ${fromName}. Say "the brand is …" in the chat if that is wrong.`);
    }
  }

  /**
   * "Only the December delivery": each line's quantity becomes what is due in that window, and a
   * line with nothing due then is not built. A sheet that never says when its lines are due cannot
   * obey, and says so on the file rather than quietly building everything. See deliveries.ts.
   */
  const window = parseWindow(directives.deliveries);
  if (directives.deliveries.trim() && items.length > 0) {
    const fileIds = [...new Set(items.map((i) => i.fileId))];
    if (!window) {
      for (const fileId of fileIds) await noteOnFile(fileId, `The delivery asked for, "${directives.deliveries}", could not be read as a month (2026-12), a span (2026-12..2027-01) or an ordinal (first), so every line was built.`);
    } else {
      const shares = items.map((entry) => dueInWindow(entry.item, window).quantity);
      const unknown = shares.filter((q) => q === null).length;
      if (unknown === items.length) {
        for (const fileId of fileIds) await noteOnFile(fileId, `Nothing on this sheet says when a line is due — no delivery date and no quantity column per delivery — so "only the ${directives.deliveries} delivery" could not be applied and every line was built.`);
      } else {
        const before = items.length;
        const kept = items.filter((entry, k) => (shares[k] ?? entry.item.quantity ?? 0) > 0);
        kept.forEach((entry) => { const q = shares[items.indexOf(entry)]; if (q !== null) entry.item = { ...entry.item, quantity: q }; });
        items.splice(0, items.length, ...kept);
        for (const fileId of fileIds) await noteOnFile(fileId, `Only the ${directives.deliveries} delivery: ${items.length} of ${before} lines are due then, and their quantities are that delivery's${unknown > 0 ? ` (${unknown} lines say nothing about when they are due and were kept as they are)` : ""}.`);
      }
    }
  }

  // The brand's own naming says who a model is for, over a sheet's "unisex": Anon's M4S is women's.
  for (const entry of items) {
    const who = audienceByModel(entry.item.brand, entry.item.title);
    if (who) entry.item = { ...entry.item, gender: who };
  }

  /**
   * "Only Burton": a sheet that carries two brands is done one brand at a time, by the brand column
   * the sheet itself has. A sheet with no brand on any line cannot obey, and says so.
   */
  const lineBrands = [...new Set(items.map((entry) => entry.item.brand.trim().toLowerCase()).filter(Boolean))];
  // "This is Burton's" said of a sheet that also carries Anon is the same ask as "only Burton".
  const vendorAsked = directives.vendor.trim() && lineBrands.length > 1 && lineBrands.includes(directives.vendor.trim().toLowerCase()) ? [directives.vendor.trim()] : [];
  const brandsAskedFor = directives.brands.length > 0 ? directives.brands : vendorAsked;
  const onlyBrands = brandsAskedFor.map((b) => b.trim().toLowerCase()).filter(Boolean);
  if (onlyBrands.length > 0 && items.length > 0) {
    const fileIds = [...new Set(items.map((i) => i.fileId))];
    const branded = items.filter((entry) => entry.item.brand.trim());
    if (branded.length === 0) {
      for (const fileId of fileIds) await noteOnFile(fileId, `No line on this sheet says its brand, so "only ${brandsAskedFor.join(" and ")}" could not be applied and every line was built.`);
    } else {
      const before = items.length;
      const kept = items.filter((entry) => !entry.item.brand.trim() || onlyBrands.includes(entry.item.brand.trim().toLowerCase()));
      items.splice(0, items.length, ...kept);
      for (const fileId of fileIds) await noteOnFile(fileId, `Only ${brandsAskedFor.join(" and ")}: ${items.length} of ${before} lines are, and the rest were left out${kept.some((e) => !e.item.brand.trim()) ? " (a line with no brand of its own was kept)" : ""}.`);
    }
  }

  // The shop's listings as last remembered, for the shelves it gave each model before.
  phase("read the files");
  // Only the listings of the brands on the order, when every line names its brand: the shop has
  // thousands, each with its barcodes and tags, and fetching them all across a region was most
  // of a build. A line with no brand of its own needs the lot, to find its brand among them.
  const orderBrands = [...new Set(items.map((i) => i.item.brand.trim().toLowerCase()).filter(Boolean))];
  const everyLineBranded = items.length > 0 && items.every((i) => i.item.brand.trim());
  const vendorSpellings = knownVendors.filter((v) => orderBrands.includes(v.trim().toLowerCase()));
  const listings = (await prisma.shopListing.findMany({
    ...(everyLineBranded ? { where: { vendor: { in: vendorSpellings } } } : {}),
    select: { handle: true, title: true, vendor: true, productType: true, tags: true, price: true, bindingOption: true, barcodes: true },
  }).catch(() => []))
    .map((l) => ({ ...l, tags: l.tags.split(",").map((t) => t.trim()).filter(Boolean), barcodes: (l.barcodes ?? "").split(",").map((b) => b.trim()).filter(Boolean) }));
  // A line with no brand of its own: the vendor the shop already sells this model under, or a brand
  // its own name or its file names — "PIM_Export_VolklSkis" — spell out.
  const fileNames = batch.files.map((f) => f.filename.replace(/[_\-.]+/g, " ")).join(" ");
  for (const entry of items) {
    if (entry.item.brand.trim() && isBrand(entry.item.brand, knownVendors)) continue;
    const found = rememberedVendor(entry.item.title, listings) || brandIn(entry.item.title, knownVendors) || brandIn(fileNames, knownVendors);
    if (found || (entry.item.brand.trim() && !isBrand(entry.item.brand, knownVendors) && entry.item.brand.trim().toLowerCase() === supplierName.toLowerCase())) {
      entry.item = { ...entry.item, brand: found };
    }
  }
  /**
   * No reference sheet in the batch: the shop's own listings are one.
   *
   * An order joined to the shop's catalogue takes the catalogue's name, Type and price for every
   * model the shop has sold before — "M HIGHSHOT SO" becomes "Men's Highshot Step On® Snowboard
   * Boots" — and so updates that listing rather than standing beside it. See listingsAsReference.
   * Lines the rules cannot place go to the model where the API is available, as with a reference
   * file, and only models of the line's own brand are offered.
   */
  const shopRefs: CanonicalLineItem[] = [];
  // Told every product is new to the shop, there is nothing to match against — and the match is
  // the slow part of a build, where lines the rules cannot place are put to the model.
  if (specItems.length === 0 && items.length > 0 && !directives.allNew) {
    const brands = [...new Set(items.map((i) => i.item.brand.trim()).filter(Boolean))];
    shopRefs.push(...brands.flatMap((b) => listingsAsReference(listings, b)));
    if (shopRefs.length > 0) {
      const lines = items.map((i) => i.item);
      const none = () => "";
      // By EAN first: a line whose barcode the shop already has on a listing IS that listing, before
      // any name is compared. The supplier printed the code and the shop typed it in; nothing else
      // on the order is that certain. See listingByBarcode.
      const owner = listingByBarcode(listings);
      const refByHandle = new Map(shopRefs.map((r) => [r.modelCode, r]));
      const byCode = new Map<number, CanonicalLineItem>();
      lines.forEach((line, k) => {
        const found = owner.get(line.barcode.replace(/^'/, "").trim());
        const ref = found ? refByHandle.get(found.handle) : undefined;
        if (ref) byCode.set(k, ref);
      });
      const byEan = byCode.size;
      // Then the siblings of those lines: a new colourway of a model whose other colourways the shop
      // has by EAN belongs on that same listing. See siblingsOfPlaced.
      const placed = new Map([...byCode].map(([k, ref]) => [k, ref.modelCode] as const));
      for (const [k, handle] of siblingsOfPlaced(lines, placed)) {
        const ref = refByHandle.get(handle);
        if (ref) byCode.set(k, ref);
      }
      const bySibling = byCode.size - byEan;
      let resolved = resolveAgainstReference(lines, shopRefs, categoryRules, byCode, none, true);
      const left = resolved.joined.map((j, i) => ("reason" in j ? i : -1)).filter((i) => i >= 0);
      if (left.length > 0 && aiAvailable()) {
        const decided = await askToJoin(left.map((i) => ({ index: i, line: lines[i] })), shopRefs).catch(() => new Map<number, CanonicalLineItem>());
        if (decided.size > 0) resolved = resolveAgainstReference(lines, shopRefs, categoryRules, new Map([...byCode, ...decided]), none, true);
      }
      // The listing's handle served as its code for the join; it is not the supplier's model code.
      // And the name is the listing's, word for word — the shop's title is not a catalogue name to
      // be trimmed, it IS what the shop calls the product — as are its Type and, where the order
      // gives none, its recommended retail.
      resolved.items.forEach((item, k) => {
        const join = resolved.joined[k];
        const listing = "to" in join ? shopRefs.find((r) => r.title === join.to) : undefined;
        items[k].item = {
          ...item,
          modelCode: lines[k].modelCode,
          ...(listing ? { title: listing.title, productType: listing.productType || item.productType, rrp: item.rrp ?? listing.rrp } : {}),
          // Placed by its barcode, the line is an item the shop already has: it goes out under that
          // listing's handle as a quantity update. A line joined by name alone is the new season's
          // version of a model and is a new product — same name, new barcode, new listing.
          ...(listing && byCode.has(k) ? { shopHandle: listing.modelCode } : {}),
        };
      });
      const joined = resolved.joined.filter((j) => "to" in j).length;
      if (joined > 0) {
        for (const fileId of new Set(items.map((i) => i.fileId))) {
          await noteOnFile(fileId, `${joined} of ${items.length} lines are models the shop already lists${byEan > 0 ? ` (${byEan} placed by their EAN${bySibling > 0 ? `, ${bySibling} more beside a colourway the shop has` : ""})` : ""}, and take the name, Type and price of the shop's listing.`);
        }
      }
    }
  }

  // Tags are matched, never invented: the shop's own vocabulary is the gate, and what it turns
  // away is proposed to the shop once, with the product it was meant for. See tag-gate.ts.
  const gate = await loadTagGate();
  const proposedTags = new Map<string, string>();
  const grouped = enrichFromSpecs(groupLineItems(items.map((i) => i.item), categoryRules, { builtBy: batch.builtBy, listings }), specItems).map((raw) => {
    const told = directives.vendor.trim();
    // A brand filled in here, after the tags were made, never became one — and every listing the
    // shop has carries its brand as a tag ("burton" on all of its Burton boards).
    const filled = told || supplierBrand;
    const g = raw.brand.trim() ? raw : { ...raw, brand: filled, tags: filled ? [...raw.tags, filled.toLowerCase()] : raw.tags };
    // Learned conventions first, then hand-written rules, which can always override them.
    const viaTemplate = applyTemplates(
      { vendor: g.brand, productType: g.productType, category: g.category, tags: g.tags, collections: g.collections, metafields: g.metafields, optionNames: [g.option1Name, g.option2Name, g.option3Name].filter((n): n is string => Boolean(n)) },
      templates,
    );
    // A convention that changes the Type changes the shelf tags with it. See retagForType.
    const tagsForType = viaTemplate.productType && viaTemplate.productType !== g.productType ? retagForType(viaTemplate.tags, g.productType, viaTemplate.productType) : viaTemplate.tags;
    const out = applyTagRules({ title: g.title, vendor: g.brand, category: g.category, productType: viaTemplate.productType, skus: g.variants.map((v) => v.item.sku), tags: tagsForType, collections: viaTemplate.collections, metafields: viaTemplate.metafields }, tagRules);
    return {
      ...g,
      productType: directives.productType.trim() || out.productType,
      // Through the house speller last: tag rules and batch instructions add tags after the
      // categoriser has been vetted, and theirs used to reach the column unchecked.
      tags: (() => {
        // A tag the batch instructions asked for is the shop's own word and always stays.
        const gated = partitionTags(houseTags([...out.tags, ...directives.addTags]), gate, directives.addTags);
        for (const t of gated.proposed) if (!proposedTags.has(t)) proposedTags.set(t, g.title);
        return gated.kept;
      })(),
      collections: out.collections,
      metafields: out.metafields,
      option1Name: viaTemplate.optionNames[0] ?? g.option1Name,
      option2Name: viaTemplate.optionNames[1] ?? g.option2Name,
      option3Name: viaTemplate.optionNames[2] ?? g.option3Name,
      // The recommended retail ending as the shop ends this brand's prices: Völkl's 1649 is the
      // shop's 1649.99. See asShopPrice.
      variants: g.variants.map((v) => ({ ...v, item: { ...v.item, rrp: asShopPrice(v.item.rrp, g.brand, listings) } })),
    };
  });
  if (proposedTags.size) await recordTagProposals(proposedTags);

  /**
   * Every flat ski is also built as its binding package — "M7 Mantra 2027 inc Marker Griffon
   * Binding Package" beside "M7 Mantra 2027" — priced from the binding on the supplier's own price
   * list. The list is read again from the order form itself: an order's table holds only what was
   * ordered, and the Griffon a package is priced from is a row nobody ordered.
   */
  // The order's own lines too: the Griffons on it carry their price and cost, whatever else fails.
  const priceList = [
    ...(await orderPriceLists(batch.files.filter((f) => f.extractionStatus === "DONE" && f.detectedKind !== "SHOP_EXPORT"))),
    ...items.map((i) => ({ sku: i.item.sku, title: i.item.title, colour: i.item.colour, rrp: i.item.rrp, costPrice: i.item.costPrice })),
  ];
  // What was said in the instruction chat: no packages at all, or which binding for whose skis.
  const chosen: ChosenBindings = {};
  for (const b of directives.packageBindings) {
    const spec = specFromName(b.binding);
    if (!spec) continue;
    for (const who of b.for === "all" ? (["mens", "womens", "kids"] as const) : [b.for]) chosen[who] = spec;
  }
  // The bindings picked for each ski on the review page, from the shop's binding list. See binding-list.ts.
  const { getBindingList, getBatchPicks } = await import("./trades/snow/binding-store");
  const { pickerFor } = await import("./trades/snow/binding-list");
  const bindingList = (await getBindingList().catch(() => null))?.entries ?? [];
  const picks = await getBatchPicks(batchId).catch(() => ({}));
  const { packages, skipped } = directives.packages === "none" ? { packages: [], skipped: [] } : packageProducts(grouped, priceList, listings, chosen, pickerFor(bindingList, picks), bindingList);
  grouped.push(...(packages as typeof grouped));
  // A product the shop already sells keeps the handle it sells it under, so importing the file
  // updates it rather than listing it twice. See existingHandle.
  const kept: string[] = [];
  for (const g of grouped) {
    // First the listing the lines were placed on by barcode — the shop has these very items, and
    // the handle is known for certain — then a listing with this very name and season.
    const placedOn = [...new Set(g.variants.map((v) => v.item.shopHandle).filter((h): h is string => Boolean(h)))];
    const handle = placedOn.length === 1 ? placedOn[0] : existingHandle({ title: productTitle(g.title, titleYear(g.tags, g.productType)), brand: g.brand, season: seasonTagFrom(g.tags) ?? "" }, listings);
    if (handle && handle !== g.handle) { g.handle = handle; kept.push(handle); }
    else if (handle) kept.push(handle);
  }
  // "Only the new products": what the shop already lists is left out of the build altogether.
  if (directives.onlyNew && kept.length > 0) {
    const already = grouped.filter((g) => kept.includes(g.handle));
    for (const g of already) grouped.splice(grouped.indexOf(g), 1);
    for (const fileId of [...new Set(items.map((i) => i.fileId))]) {
      await noteOnFile(fileId, `Only new products: ${already.length} the shop already lists were left out (${already.map((g) => g.handle).slice(0, 8).join(", ")}${already.length > 8 ? ", …" : ""}). To add this order's stock to those listings, run it through Bulk uploads.`);
    }
    kept.length = 0;
  }
  if (kept.length > 0) {
    for (const fileId of [...new Set(items.map((i) => i.fileId))]) {
      await noteOnFile(fileId, `Already in the shop, so written under the handle it has there, and imported they update those listings instead of adding them twice: ${kept.join(", ")}. Shopify's import REPLACES what it updates — the stock becomes this order's quantity rather than being added to what is on the shelf, and the description is the one here. To add the stock to what is there and leave the listings as they are, run the order through Bulk uploads instead.`);
    }
  }
  // The package bindings ordered with the skis go on the skis, not on the shelf. See isPackageBinding.
  const setAside = directives.packages !== "none" && grouped.some((g) => isFlatSki(g)) ? grouped.filter((g) => isPackageBinding(g, Object.values(chosen))) : [];
  for (const g of setAside) grouped.splice(grouped.indexOf(g), 1);
  if (setAside.length > 0) {
    for (const fileId of [...new Set(items.map((i) => i.fileId))]) {
      await noteOnFile(fileId, `Not listed on its own: ${setAside.map((g) => `${g.title} (${g.variants.reduce((n, v) => n + (v.item.quantity ?? 0), 0)})`).join(", ")} — the binding the ski packages are made with, ordered to go on the skis.`);
    }
  }
  if (packages.length > 0 || skipped.length > 0) {
    for (const fileId of [...new Set(items.map((i) => i.fileId))]) {
      await noteOnFile(fileId, [
        packages.length > 0 ? `Built ${packages.length} binding package${packages.length === 1 ? "" : "s"} beside the flat skis: ${packages.map((p) => p.title).join(", ")}.` : "",
        ...skipped.map((k) => `No package for ${k.title}: ${k.reason}.`),
      ].filter(Boolean).join(" "));
    }
  }

  // What was written by hand on the invoice against its lines, for the person to act on: the
  // reader carries it, the build does not act on it, and it would be lost otherwise.
  const penned = items.filter((i) => (i.item.extras?.notes ?? "").trim());
  if (penned.length > 0) {
    const byFile = new Map<string, string[]>();
    for (const i of penned) {
      const line = `${[i.item.title, i.item.length || i.item.size].filter(Boolean).join(" ")}: ${i.item.extras!.notes.trim()}`;
      const list = byFile.get(i.fileId) ?? [];
      if (!list.includes(line)) list.push(line);
      byFile.set(i.fileId, list);
    }
    for (const [fileId, lines] of byFile) await noteOnFile(fileId, `Written on it by hand, to act on: ${lines.join("; ")}.`);
  }

  // What the person said not to build, by name or by unticking it on the batch page.
  if (directives.skip.length > 0) {
    const left = grouped.filter((g) => isSkipped({ title: productTitle(g.title, titleYear(g.tags, g.productType)), handle: g.handle }, directives.skip));
    for (const g of left) grouped.splice(grouped.indexOf(g), 1);
    if (left.length > 0) {
      for (const fileId of [...new Set(items.map((i) => i.fileId))]) {
        await noteOnFile(fileId, `Not built, as asked: ${left.map((g) => productTitle(g.title, titleYear(g.tags, g.productType))).join(", ")}.`);
      }
    }
  }

  // The kinds of product the order holds, kept with the batch so the page can offer them to work
  // with one at a time; then only the kinds the person chose, when they chose.
  {
    const seen = [...new Set(grouped.map((g) => g.productType.trim() || g.category.trim()).filter(Boolean))].sort();
    const fresh = parseDirectives((await prisma.importBatch.findUnique({ where: { id: batchId }, select: { directives: true } }))?.directives ?? "");
    if (seen.join("|") !== fresh.typesSeen.join("|")) {
      await prisma.importBatch.update({ where: { id: batchId }, data: { directives: JSON.stringify({ ...fresh, typesSeen: seen }) } });
    }
    if (directives.types.length > 0) {
      const left = grouped.filter((g) => !isOfType(g, directives.types));
      for (const g of left) grouped.splice(grouped.indexOf(g), 1);
      if (left.length > 0) {
        const kinds = [...new Set(left.map((g) => g.productType.trim() || g.category.trim() || "other"))];
        for (const fileId of [...new Set(items.map((i) => i.fileId))]) {
          await noteOnFile(fileId, `Working with ${directives.types.join(", ")} only: ${left.length} product${left.length === 1 ? "" : "s"} of other kinds (${kinds.join(", ")}) ${left.length === 1 ? "was" : "were"} left for later. Tick a kind on the batch page to bring it in.`);
        }
      }
      const unknown = directives.types.filter((t) => !seen.some((k) => typeKey(k) === typeKey(t)));
      if (unknown.length > 0) {
        for (const fileId of [...new Set(items.map((i) => i.fileId))]) {
          await noteOnFile(fileId, `Nothing on this order is a ${unknown.join(" or ")}. The kinds it holds: ${seen.join(", ") || "none found"}.`);
        }
      }
    }
  }

  // Rebuild the batch's products from scratch (mapping is re-runnable until export).
  phase("placed against the shop");
  // What the products had gathered since they were built — a link, its page's description and
  // pictures, pictures added by hand — goes back onto the products made in their place.
  const keep = keeper((await prisma.product.findMany({
    where: { batchId },
    select: {
      handle: true, title: true, tags: true, bodyHtml: true, lookupStatus: true, lookupSource: true, lookupAt: true, colourLinks: true,
      option1Name: true, option2Name: true, option3Name: true,
      variants: { select: { id: true, option1Value: true, option2Value: true, option3Value: true } },
      images: { select: { url: true, source: true, altText: true, position: true, validated: true, variantId: true } },
    },
  })).map((p) => {
    // A picture tied to a variant is kept as the colour that variant is, to be tied again after.
    const at = [p.option1Name, p.option2Name, p.option3Name].findIndex((n) => /colou?r/i.test(n ?? ""));
    const colourOf = (variantId: string | null) => {
      const v = variantId && at >= 0 ? p.variants.find((x) => x.id === variantId) : undefined;
      return v ? ([v.option1Value, v.option2Value, v.option3Value][at] ?? "").trim() : "";
    };
    return { ...p, images: p.images.map(({ variantId, ...i }) => ({ ...i, colour: colourOf(variantId) || undefined })) };
  }));
  await prisma.$transaction([
    prisma.extractedLineItem.deleteMany({ where: { batchId } }),
    prisma.product.deleteMany({ where: { batchId } }),
  ]);

  let variantCount = 0;
  let sort = 0;
  // Every product's pictures share one allowance: past it they are left as the addresses they
  // were, so a slow brand site cannot make a build of fifty products wait on each.
  const picturesUntil = Date.now() + 90_000;
  for (const g of grouped) {
    // A seasonal product carries its year after the name — the same products that carry a year tag,
    // or only those the shop chose (see titleYear). The SEO title is that title with the brand in
    // front of it, which is the one place it appears. A rebuild gives back the title a page gave it.
    const built = titledForShop(g.brand, productTitle(g.title, titleYear(g.tags, g.productType)));
    const kept = keep({ handle: g.handle, title: built, tags: g.tags.join(", ") });
    const title = kept?.title ?? built;
    // Everything the product owns goes in with it: its variants, each with the order line it came
    // from, and its pictures. One round trip per product instead of one per row — a build on a
    // database in another region was waiting on the network a dozen times per product.
    const modelCode = g.variants.map((v) => v.item.modelCode).find(Boolean) ?? "";
    const images: Array<{ url: string; source: string; altText: string; validated?: boolean }> = [];
    const urls = new Set<string>();
    for (const url of await hostPictures([...new Set(g.imageUrls)], title, { until: picturesUntil })) {
      if (urls.has(url)) continue;
      urls.add(url);
      images.push({ url, source: "SUPPLIER", altText: g.title });
    }
    if (urls.size === 0 && modelCode) {
      const colours = Array.from(new Set(g.variants.map((v) => v.item.colour).filter(Boolean)));
      for (const url of await findLibraryImages(g.brand, modelCode, colours[0] ?? "")) {
        if (urls.has(url)) continue;
        urls.add(url);
        images.push({ url, source: "LIBRARY", altText: g.title, validated: true });
      }
      for (const colour of colours.slice(1)) {
        for (const url of await findLibraryImages(g.brand, modelCode, colour)) {
          if (urls.has(url)) continue;
          urls.add(url);
          images.push({ url, source: "LIBRARY", altText: `${g.title} ${colour}`, validated: true });
        }
      }
    }
    for (const { colour: _colour, ...img } of kept?.images ?? []) {
      void _colour;
      if (urls.has(img.url)) continue;
      urls.add(img.url);
      images.push(img);
    }
    let vsort = 0;
    const created = await prisma.product.create({
      data: {
        batchId,
        handle: g.handle,
        title,
        seoTitle: seoTitle(g.brand, title),
        // A body the spec sheet already laid out in the house format is used as it is. Wrapping it
        // again — in a <p>, escaped — turned its <h2> and <li> into text a customer would read.
        bodyHtml: kept?.bodyHtml ?? (/^\s*</.test(g.description) ? g.description : await shopBody(g.description, [])),
        ...(kept ? { lookupStatus: kept.lookupStatus, lookupSource: kept.lookupSource, lookupAt: kept.lookupAt, ...(kept.colourLinks ? { colourLinks: kept.colourLinks } : {}) } : {}),
        vendor: g.brand,
        productType: g.productType,
        category: g.category,
        tags: g.tags.join(", "),
        collections: g.collections.join(", "),
        published: false, // drafts, always — see csv.ts
        status: "draft",
        option1Name: g.option1Name,
        option2Name: g.option2Name,
        option3Name: g.option3Name,
        metafields: JSON.stringify(g.metafields),
        sortOrder: sort++,
        variants: {
          create: g.variants.map((v) => {
            const src = items[v.sourceIndex];
            variantCount++;
            const ids = conventionIdentifiers(houseConventions(), { sku: v.item.sku ?? "", barcode: v.item.barcode ?? "" });
            return {
              sku: ids.sku,
              barcode: ids.barcode,
              option1Value: v.option1Value,
              option2Value: v.option2Value,
              option3Value: v.option3Value,
              grams: v.item.grams ?? conventionGrams(houseConventions(), g.productType) ?? 0,
              quantity: v.item.quantity ?? 0,
              sortOrder: vsort++,
              costPrice: v.item.costPrice ?? 0,
              costCurrency: batch.currency,
              gstTreatment: batch.gstTreatment,
              fxRateToHome: batch.fxRateToHome,
              // The recommended retail is what the product sells for, so it sets the price rather
              // than sitting beside it as a strikethrough. Without one the markup rules price it.
              retailOverride: v.item.rrp ?? null,
              compareAtPrice: null,
              lineItem: {
                create: { batchId, sourceFileId: src.fileId, rowIndex: src.rowIndex, raw: JSON.stringify(src.raw), normalized: JSON.stringify(v.item) },
              },
            };
          }),
        },
        // Supplier URLs first, then the library, then what the product had gathered before this build.
        images: { create: images.map((img, i) => ({ ...img, position: i + 1 })) },
      },
      select: { id: true, variants: { select: { id: true, option1Value: true, option2Value: true, option3Value: true }, orderBy: { sortOrder: "asc" } }, images: { select: { id: true, url: true } } },
    });
    // A colour's picture tied again to the first variant of that colour, as it was before the rebuild.
    const colourAt = [g.option1Name, g.option2Name, g.option3Name].findIndex((n) => /colou?r/i.test(n ?? ""));
    for (const img of colourAt >= 0 ? (kept?.images ?? []).filter((i) => i.colour) : []) {
      const v = created.variants.find((x) => ([x.option1Value, x.option2Value, x.option3Value][colourAt] ?? "").trim().toLowerCase() === img.colour!.toLowerCase());
      const row = created.images.find((x) => x.url === img.url);
      if (v && row) await prisma.productImage.update({ where: { id: row.id }, data: { variantId: v.id } });
    }
  }

  await attachUnassignedPhotos(batchId);
  await allocateBatchFreight(batchId);
  phase("written");
  await repriceBatch(batchId);
  await prisma.importBatch.update({ where: { id: batchId }, data: { status: "REVIEW" } });
  phase("priced");
  const total = phases.reduce((n, [, ms]) => n + ms, 0);
  console.log(`[build] ${batchId}: ${grouped.length} products in ${(total / 1000).toFixed(1)}s — ${phases.map(([n, ms]) => `${n} ${(ms / 1000).toFixed(1)}s`).join(", ")}`);
  await logAudit("batch.built", { batchId, userId, details: { products: grouped.length, totalMs: total, phases: Object.fromEntries(phases) } }).catch(() => undefined);
  await logAudit("batch.mapped", { batchId, userId, details: { products: grouped.length, variants: variantCount } });
  void verifyBatchImages(batchId).catch(() => undefined);
  lastBuildTiming = { tookMs: total, phases: phases.map(([name, ms]) => `${name} ${(ms / 1000).toFixed(1)}s`) };
  // The web lookup deliberately does NOT run here.
  //
  // It used to, through `after`, and it was worse than not running at all. This is the tail of the
  // upload request, which shares one sixty-second function with a vision call over a photographed
  // invoice — so the lookup got through a product or two before the function was killed, and every
  // product it had touched was left stamped with a status that made later passes skip it. A pass
  // that half-runs and then blocks the pass that would have finished the job is not a head start.
  //
  // The review page runs it instead, where it has a whole request per pass, says how far it has
  // got, and carries on until there is nothing left. See LookupPanel.
  return { products: grouped.length, variants: variantCount, problems: [] };
}

/** Add a line to what the upload table says about a file, once. */
/** Every priced row of a spreadsheet, read from the upload itself. Empty for anything else. */
async function priceListOf(filename: string, buffer: Buffer): Promise<PriceRow[]> {
  if (!/\.(xlsx?|csv)$/i.test(filename)) return [];
  try {
    const grids = /\.csv$/i.test(filename)
      ? [{ name: filename, grid: (await import("./csv")).parseCsv(buffer.toString("utf8")) }]
      : await (await import("./extract/tabular")).sheetGrids(buffer);
    return readInvoiceGrids(grids)?.priceList ?? [];
  } catch {
    return [];
  }
}

/**
 * The priced rows of every file in a batch: stored when each was read, and read again from the file
 * only for one uploaded before that was kept. Every file, not just the orders — an order form
 * uploaded as "barcodes, specs or descriptions" is still where the binding prices are.
 */
async function orderPriceLists(files: Array<{ filename: string; storagePath: string; priceList: string }>): Promise<PriceRow[]> {
  const out: PriceRow[] = [];
  for (const f of files) {
    const kept = parseJson<PriceRow[]>(f.priceList, []);
    if (kept.length > 0) { out.push(...kept); continue; }
    if (!/\.(xlsx?|csv)$/i.test(f.filename)) continue;
    try {
      out.push(...(await priceListOf(f.filename, await readFile(f.storagePath))));
    } catch {
      // Not readable again; the order's own lines still price what was ordered, below.
    }
  }
  return out;
}

export async function noteOnFile(fileId: string, note: string): Promise<void> {
  const file = await prisma.sourceFile.findUnique({ where: { id: fileId }, select: { extractionError: true } });
  const now = file?.extractionError ?? "";
  if (now.includes(note)) return;
  await prisma.sourceFile.update({ where: { id: fileId }, data: { extractionError: now ? `${now} ${note}` : note } });
}

/** What counts as somebody having changed a batch's products by hand. A rebuild would undo it. */
export const HAND_EDITS = ["product.edited", "product.checked", "variant.edited", "variant.deleted", "batch.bulk_edit", "batch.seo"];

/**
 * Whether a batch's products are still exactly what the files built.
 *
 * A file added to a batch that already has products — the description list uploaded a minute
 * after the order — used to be read and then ignored: products were only built for a batch that
 * had none, so the boards stayed as the order alone had made them, with no descriptions, and
 * nothing said why. Rebuilding is the right answer as long as nobody has edited the products since
 * they were built, because a rebuild starts again from the files and would throw the edits away.
 */
export async function untouchedSinceBuilt(batchId: string): Promise<boolean> {
  const built = await prisma.product.findFirst({ where: { batchId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  if (!built) return true;
  const edits = await prisma.auditLog.count({ where: { batchId, action: { in: HAND_EDITS }, createdAt: { gt: built.createdAt } } });
  return edits === 0;
}

/** Attach uploaded product photos to products whose SKU / model code / title appears in the filename or AI hint. */
export async function attachUnassignedPhotos(batchId: string): Promise<number> {
  const photos = await prisma.unassignedImage.findMany({ where: { batchId } });
  if (photos.length === 0) return 0;
  const products = await prisma.product.findMany({ where: { batchId }, include: { variants: { include: { lineItem: true } }, images: true } });
  let attached = 0;
  for (const photo of photos) {
    const hay = normKey(`${photo.filename.replace(/\.[a-z0-9]+$/i, "")} ${photo.hint}`);
    const match = products.find((p) => {
      const codes = p.variants.flatMap((v) => [v.sku, parseJson<{ modelCode?: string } | null>(v.lineItem?.normalized, null)?.modelCode ?? ""]).map(normKey).filter((c) => c.length >= 4);
      if (codes.some((c) => hay.includes(c))) return true;
      const title = normKey(p.title.replace(new RegExp(`^${p.vendor}`, "i"), ""));
      return title.length >= 5 && hay.includes(title);
    });
    if (!match) continue;
    await prisma.productImage.create({ data: { productId: match.id, url: photo.url, position: match.images.length + 1, source: "MANUAL", altText: match.title, validated: /^https:/.test(photo.url) } });
    match.images.push({ id: "", productId: match.id, variantId: null, url: photo.url, position: match.images.length + 1, altText: "", source: "MANUAL", validated: true, createdAt: new Date() });
    await prisma.unassignedImage.delete({ where: { id: photo.id } });
    attached++;
  }
  return attached;
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

/** Spread the batch-level freight total across variants (stored per unit on each variant). */
export async function allocateBatchFreight(batchId: string): Promise<void> {
  const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: batchId } });
  const settings = await getSettings();
  const variants = await prisma.variant.findMany({ where: { product: { batchId } } });
  const lines = variants.map((v) => ({ id: v.id, quantity: v.quantity, exGstCostHome: exGstCostHome(v.costPrice, v.gstTreatment as GstTreatment, v.fxRateToHome, settings.gstRate) }));
  const alloc = allocateFreight(batch.freightTotalHome, batch.freightMode as "PER_UNIT" | "BY_VALUE", lines);
  await prisma.$transaction(variants.map((v) => prisma.variant.update({ where: { id: v.id }, data: { freightPerUnitHome: alloc[v.id] ?? 0 } })));
}

export async function repriceBatch(batchId: string): Promise<void> {
  const [settings, batch] = await Promise.all([
    getSettings(),
    prisma.importBatch.findUniqueOrThrow({ where: { id: batchId }, select: { directives: true } }),
  ]);
  // A batch-wide markdown is part of what a price is here, so it is applied every time prices are
  // worked out, not stamped in once and lost the next time something is edited.
  const { discountPct } = parseDirectives(batch.directives);
  const products = await prisma.product.findMany({ where: { batchId }, include: { variants: true } });
  const updates: Prisma.PrismaPromise<unknown>[] = [];
  for (const p of products) {
    for (const v of p.variants) {
      updates.push(prisma.variant.update({ where: { id: v.id }, data: computePricing(v, settings, discountPct) }));
    }
  }
  await prisma.$transaction(updates);
}

export async function repriceVariant(variantId: string): Promise<void> {
  const settings = await getSettings();
  const v = await prisma.variant.findUniqueOrThrow({ where: { id: variantId }, include: { product: { include: { batch: { select: { directives: true } } } } } });
  const { discountPct } = parseDirectives(v.product.batch.directives);
  await prisma.variant.update({ where: { id: v.id }, data: computePricing(v, settings, discountPct) });
}

type VariantRow = { costPrice: number; gstTreatment: string; fxRateToHome: number; freightPerUnitHome: number; quantity: number; retailOverride: number | null };

export function computePricing(v: VariantRow, settings: AppSettings, discountPct: number | null = null) {
  const r = priceVariant(
    { costPrice: v.costPrice, gstTreatment: v.gstTreatment as GstTreatment, fxRateToHome: v.fxRateToHome, freightPerUnitHome: v.freightPerUnitHome, quantity: v.quantity, retailOverride: v.retailOverride, discountPct },
    { gstRate: settings.gstRate, pricesIncludeGst: settings.pricesIncludeGst, minMarginPct: settings.minMarginPct },
  );
  return {
    landedCostHome: r.landedCostHome,
    retailPrice: r.retailPrice,
    // The strikethrough, written whenever the product is selling for less than it would have.
    compareAtPrice: r.compareAtPrice,
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
    fxRateToHome: number;
    gstTreatment: string;
    freightTotalHome: number;
    freightMode: string;
    splitExportBy: string;
    supplierName: string | null;
    notes: string | null;
  };
  unassignedImages: Array<{ id: string; filename: string; url: string; hint: string }>;
  products: ReviewProduct[];
  summary: ReviewSummary;
  settings: { gstRate: number; pricesIncludeGst: boolean; minMarginPct: number; shopifyConfigured: boolean; catalogueKnown: boolean; publicBaseUrl: string };
  metafieldColumns: string[];
}

export async function loadReview(batchId: string): Promise<ReviewData> {
  // Take off any tag the shop does not write, before the grid shows it or the CSV carries it.
  // A product's tags are written once, at build time, so correcting the rule that produced a bad
  // one does nothing for the batches already built — see repairProductTags.
  await repairProductTags(batchId).catch(() => 0);
  const [batch, settings] = await Promise.all([
    prisma.importBatch.findUniqueOrThrow({ where: { id: batchId }, include: { supplier: true, unassignedImages: { orderBy: { createdAt: "asc" } } } }),
    getSettings(),
  ]);
  const products = await prisma.product.findMany({
    where: { batchId },
    orderBy: { sortOrder: "asc" },
    include: { variants: { orderBy: { sortOrder: "asc" } }, images: { orderBy: { position: "asc" } } },
  });
  // What the confidence score is worked out from: the order lines each product came from (so a
  // title's words can be checked against the paperwork), what a person set by hand, and the
  // shop's vocabulary of tags.
  const [lines, edits, gate] = await Promise.all([
    prisma.extractedLineItem.findMany({ where: { batchId, variantId: { not: null } }, select: { variantId: true, raw: true } }),
    prisma.auditLog.findMany({ where: { batchId, action: { in: ["product.edited", "product.checked", "variant.edited"] } }, select: { details: true } }),
    loadTagGate(),
  ]);
  const rawByVariant = new Map<string, string>();
  for (const l of lines) if (l.variantId) rawByVariant.set(l.variantId, Object.values(parseJson<Record<string, unknown>>(l.raw, {})).map((v) => String(v ?? "")).join(" "));
  const touchedProducts = new Map<string, Set<string>>();
  const touchedVariants = new Map<string, Set<string>>();
  for (const e of edits) {
    const d = parseJson<{ productId?: string; variantId?: string; fields?: string[] }>(e.details, {});
    const into = d.productId ? touchedProducts : d.variantId ? touchedVariants : null;
    const id = d.productId ?? d.variantId;
    if (!into || !id) continue;
    const set = into.get(id) ?? new Set<string>();
    for (const f of d.fields ?? []) set.add(f);
    into.set(id, set);
  }
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
    lookupStatus: p.lookupStatus,
    lookupSource: p.lookupSource,
    colourLinks: p.colourLinks,
    option1Name: p.option1Name,
    option2Name: p.option2Name,
    option3Name: p.option3Name,
    metafields: parseJson<Record<string, string>>(p.metafields, {}),
    reconcileStatus: p.reconcileStatus,
    shopifyProductId: p.shopifyProductId,
    matchCandidates: parseJson<MatchCandidate[]>(p.matchCandidates, []),
    matchDecided: p.matchDecided,
    images: p.images.map((i) => ({ id: i.id, url: i.url, position: i.position, variantId: i.variantId, source: i.source, validated: i.validated })),
    variants: p.variants.map<ReviewVariant>((v) => {
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
        fxRateToHome: v.fxRateToHome,
        freightPerUnitHome: v.freightPerUnitHome,
        pricingRuleId: v.pricingRuleId,
        pricingRuleName: null, // nothing prices off a rule; the price is the recommended retail
        retailOverride: v.retailOverride,
        compareAtPrice: v.compareAtPrice,
        landedCostHome: v.landedCostHome,
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
    confidence: scoreProduct({
      title: p.title,
      vendor: p.vendor,
      typeKnown: !typesAreKnown() || isValidType(p.productType),
      tags: p.tags.split(",").map((t) => t.trim()).filter(Boolean),
      tagKnown: gate.known,
      sourceText: p.variants.map((v) => rawByVariant.get(v.id) ?? "").join(" "),
      touched: touchedProducts.get(p.id) ?? new Set<string>(),
      images: p.images.map((i) => ({ source: i.source, validated: i.validated })),
      retail: (() => {
        const priced = p.variants.filter((v) => v.retailPrice > 0);
        const value = priced.length ? Math.min(...priced.map((v) => v.retailPrice)) : 0;
        const person = p.variants.some((v) => touchedVariants.get(v.id)?.has("retailOverride"));
        const paperwork = p.variants.length > 0 && p.variants.every((v) => v.retailOverride !== null && v.retailOverride > 0);
        return {
          value,
          from: person ? "person" : paperwork ? "paperwork" : value > 0 ? "rule" : "none",
          belowCost: p.variants.some((v) => v.retailPrice > 0 && v.profitPerUnit < 0),
          underFloor: p.variants.some((v) => v.retailPrice > 0 && v.costPrice > 0 && v.marginPct < settings.minMarginPct),
        };
      })(),
    }),
  }));

  const catalog = await shopifyLookups(view);
  validateReview(view, { minMarginPct: settings.minMarginPct, shopifySkus: catalog.skus, shopifyHandles: catalog.handles });
  const summary = { ...summarise(view), ...tallyConfidence(view) };
  await prisma.importBatch.update({ where: { id: batchId }, data: { summary: JSON.stringify(summary) } });

  return {
    batch: {
      id: batch.id,
      name: batch.name,
      status: batch.status,
      currency: batch.currency,
      fxRateToHome: batch.fxRateToHome,
      gstTreatment: batch.gstTreatment,
      freightTotalHome: batch.freightTotalHome,
      freightMode: batch.freightMode,
      splitExportBy: batch.splitExportBy,
      supplierName: batch.supplier?.name ?? null,
      notes: batch.notes,
    },
    unassignedImages: batch.unassignedImages.map((i) => ({ id: i.id, filename: i.filename, url: i.url, hint: i.hint })),
    products: view,
    summary,
    settings: {
      gstRate: settings.gstRate,
      pricesIncludeGst: settings.pricesIncludeGst,
      minMarginPct: settings.minMarginPct,
      shopifyConfigured: Boolean(settings.shopify.storeDomain && settings.shopify.accessToken),
      // Something to check the batch against: the store itself, or the shop's own export.
      catalogueKnown: Boolean(settings.shopify.storeDomain && settings.shopify.accessToken) || (await prisma.shopListing.count()) > 0,
      // Where a picture kept here is served from: Blob, the vendor's store, a public address of
      // this deployment's own, or nowhere (a desktop copy's own address is not public).
      publicBaseUrl: usingBlob() ? "blob" : pictureHosting() ? "floda" : publicFileUrl("images/x.jpg", settings.publicBaseUrl) ? (settings.publicBaseUrl || process.env.APP_PUBLIC_URL || `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) : "",
    },
    metafieldColumns: metafieldDefs().map(metafieldColumn),
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
  /** What the export had to fix on the way out, so the operator can see it rather than be asked. */
  repairs: Repair[];
}

type PlannedPart = { group: string; part: ReturnType<typeof generateCsvParts>[number]; partCount: number };

/**
 * Turn a batch's reviewed products into the CSV files it exports as.
 *
 * Separated from writing them down because it is worth being able to run twice. Given the same
 * batch it produces the same files in the same order, which is what lets a download rebuild a
 * file rather than depend on one still being on a disk somewhere.
 *
 * One CSV per brand or product type — the shop imports and manages them separately — each split
 * further only if it would exceed Shopify's size limit.
 */
function planExport(review: ReviewData): { ok: true; planned: PlannedPart[]; repairs: Repair[] } | { ok: false; errors: string[] } {
  // Repaired, not refused. Everything Shopify would reject has one obvious right answer — see
  // repair.ts — so it is applied and reported rather than handed back as a list of chores.
  const { products: csvProducts, repairs } = repairForExport(toCsvProducts(review.products));
  const structural = validateProducts(csvProducts).filter((i) => i.level === "error").map((i) => `${i.handle ?? ""}: ${i.message}`);
  // Anything still wrong here is a fault in the repair, not something the operator did.
  if (structural.length) return { ok: false, errors: structural.map((m) => `${m} (this is a bug — the export should have repaired it)`) };

  const groups = new Map<string, typeof csvProducts>();
  for (const p of csvProducts) {
    const key = review.batch.splitExportBy === "BRAND" ? p.vendor || "unbranded" : review.batch.splitExportBy === "PRODUCT_TYPE" ? p.productType || "untyped" : "";
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const planned: PlannedPart[] = [];
  for (const [group, list] of groups) {
    const parts = generateCsvParts(list, { metafieldColumns: review.metafieldColumns });
    for (const part of parts) {
      const fileIssues = validateCsvFile(part.content).filter((i) => i.level === "error");
      if (fileIssues.length) return { ok: false, errors: fileIssues.map((i) => i.message) };
      planned.push({ group, part, partCount: parts.length });
    }
  }
  return { ok: true, planned, repairs };
}

/**
 * Build the CSV files for a batch.
 *
 * Only a structural problem stops this — something Shopify itself would reject on import, like a
 * missing title or a duplicate handle. Warnings never do. A missing price, a missing image and a
 * missing description are all things to finish in Shopify, and making the operator tick a box
 * before they could have their file at all was the same refusal wearing a different hat.
 */
export async function exportBatch(batchId: string, userId: string): Promise<ExportResult> {
  const review = await loadReview(batchId);
  const warnings = warningList(review.products);
  if (review.products.length === 0) return { ok: false, errors: ["Nothing to export - map the files first."], warnings, files: [], repairs: [] };

  // What cannot be repaired — a barcode that fails its check digit, swapped code columns, a price
  // below cost, a Type the shop does not have — is said, by name, at the top of the warnings. It
  // never stops the export: the shop asked that nothing does, and a draft in Shopify can be fixed
  // there as easily as here.
  for (const h of hardErrors(review.products).reverse()) warnings.unshift(`Check before importing: ${h}`);

  const plan = planExport(review);
  if (!plan.ok) return { ok: false, errors: plan.errors, warnings, files: [], repairs: [] };
  const planned = plan.planned;

  await prisma.exportFile.deleteMany({ where: { batchId } });
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
  const base = `${slugForFile(review.batch.name)}-${stamp}`;
  const files: ExportResult["files"] = [];
  let index = 0;
  for (const { group, part, partCount } of planned) {
    index++;
    const groupSlug = group ? `-${slugForFile(group)}` : "";
    const filename = partCount > 1 ? `${base}${groupSlug}-part${part.index}-of-${partCount}.csv` : `${base}${groupSlug}.csv`;
    const storagePath = await saveFile("exports", filename, Buffer.from(part.content, "utf8"));
    const rec = await prisma.exportFile.create({ data: { batchId, filename, storagePath, partIndex: index, partCount: planned.length, rowCount: part.rowCount, sizeBytes: part.bytes } });
    files.push({ id: rec.id, filename, rowCount: part.rowCount, sizeBytes: part.bytes, partIndex: index, partCount: planned.length });
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
    details: { files: files.map((f) => f.filename), products: review.products.length, variants: review.summary.variants, warnings: warnings.length, summary: review.summary, snapshot: toCsvProducts(review.products) },
  });
  return { ok: true, errors: [], warnings, files, repairs: plan.repairs };
}

function slugForFile(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "batch";
}

/**
 * The CSV to hand back for a download.
 *
 * The saved file first, and when it is not there, built again from the batch.
 *
 * It is often not there. Without blob storage a deployment writes to the instance's own /tmp, and
 * the request that asks for the file is usually served by a different instance, so the download
 * failed on the one thing the app exists to produce. Rebuilding is safe because a batch is locked
 * once exported: the same products, split the same way, in the same order.
 */
export type ExportFileResult =
  | { ok: true; filename: string; content: Buffer; from: "stored" | "rebuilt" }
  | { ok: false; reason: string };

export async function readExportFile(id: string): Promise<ExportFileResult> {
  const rec = await prisma.exportFile.findUnique({ where: { id } });
  if (!rec) return { ok: false, reason: "No record of that export. It may have been replaced by a newer one." };

  let stored = "";
  try {
    return { ok: true, filename: rec.filename, content: await readFile(rec.storagePath), from: "stored" };
  } catch (error) {
    // Expected without blob storage: the file went to one instance's /tmp and this is another.
    stored = error instanceof Error ? error.message : String(error);
  }

  try {
    const plan = planExport(await loadReview(rec.batchId));
    if (!plan.ok) return { ok: false, reason: `The saved file is gone and the batch no longer exports: ${plan.errors[0] ?? "unknown"}` };
    const part = plan.planned[rec.partIndex - 1];
    if (!part) return { ok: false, reason: `The saved file is gone and the batch now produces ${plan.planned.length} file(s), not the ${rec.partCount} it did. Export it again.` };
    return { ok: true, filename: rec.filename, content: Buffer.from(part.part.content, "utf8"), from: "rebuilt" };
  } catch (error) {
    // Both routes failed, and until now the reason was thrown away — which is how a download that
    // does nothing stays a mystery. Both are reported.
    const rebuilt = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `Could not read the saved file (${stored.slice(0, 200)}) and could not rebuild it (${rebuilt.slice(0, 200)})` };
  }
}

/** The CSV as text, for a download that does not go through the file route. */
export async function exportFileText(id: string): Promise<{ filename: string; text: string } | { error: string }> {
  const result = await readExportFile(id);
  return result.ok ? { filename: result.filename, text: result.content.toString("utf8") } : { error: result.reason };
}

/** The season a product was tagged with, which is also the year its name carries. */

// Moved to ./specs so a page can merge a spec sheet without loading the database layer.
export { enrichFromSpecs } from "./specs";
