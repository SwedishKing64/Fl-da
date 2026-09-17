"use server";
import { analyseShopifyCsv, analyseShopifyCsvGroups, type TemplateAnalysis } from "@/lib/catalog/templates";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma, parseJson, createTables, databaseStatus } from "@/lib/catalog/db";
import { createSession, destroySession, hashPassword, requireUser, usersExist, verifyPassword } from "@/lib/catalog/auth";
import { allocateBatchFreight, applyMappings, applyRulesToBatch, attachUnassignedPhotos, extractStoredFile, loadReview, repriceBatch, repriceVariant, verifyBatchImages, exportBatch, exportFileText, type ApplyMappingInput, type ReviewData } from "@/lib/catalog/pipeline";
import { logAudit } from "@/lib/catalog/audit";
import { getSettings, saveSettings } from "@/lib/catalog/settings";
import { checkImageUrl, recordLibraryImages } from "@/lib/catalog/images";
import { pushBatch, reconcileBatch, rollbackBatch, syncCatalog, ShopifyError } from "@/lib/catalog/shopify";
import { enrichBatchSeo } from "@/lib/catalog/seo";
import { slugify } from "@/lib/catalog/handle";
import { CURRENCIES, type AppSettings } from "@/lib/catalog/types";
import { seedDefaults } from "@/lib/catalog/seed";
import { initialsFrom } from "@/lib/catalog/tagging";
import { answerFeedback, feedbackAvailable, withRule, type FeedbackTurn } from "@/lib/catalog/feedback";
import { describeDirectives, instructionsAvailable, parseDirectives, readInstructions, NO_DIRECTIVES } from "@/lib/catalog/instructions";
import { lookupBatch, lookupEnabled, LOOKUP_LIMIT, REQUESTED_BUDGET_MS, type LookupOutcome } from "@/lib/catalog/enrich";

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

/**
 * Create the tables when the build could not.
 *
 * Deliberately outside the auth check: there is no user table yet to authenticate against, and it
 * refuses on any database that already has one — so the only database it will act on is one that
 * cannot hold an account to protect.
 */
export async function createTablesAction(): Promise<ActionResult<{ statements: number }>> {
  const status = await databaseStatus();
  if (status.state !== "no-tables") {
    return { ok: false, error: `The database is not in a state that needs this (${status.state}). Reload the page.` };
  }
  try {
    const data = await createTables();
    await logAudit("database.tables_created", { details: data });
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

function fail(err: unknown): ActionResult<never> {
  if (err instanceof z.ZodError) return { ok: false, error: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  if (err instanceof ShopifyError) return { ok: false, error: err.message };
  return { ok: false, error: err instanceof Error ? err.message : String(err) };
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function loginAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !verifyPassword(password, user.passwordHash)) return { ok: false, error: "Email or password is incorrect." };
  await createSession(user.id);
  redirect("/");
}

export async function setupAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  if (await usersExist()) return { ok: false, error: "Setup has already been completed." };
  const schema = z.object({ name: z.string().min(1), email: z.string().email(), password: z.string().min(8) });
  try {
    const data = schema.parse({ name: formData.get("name"), email: String(formData.get("email") ?? "").trim().toLowerCase(), password: formData.get("password") });
    const user = await prisma.user.create({ data: { name: data.name, email: data.email, passwordHash: hashPassword(data.password), role: "ADMIN" } });
    await seedDefaults();
    await createSession(user.id);
  } catch (err) {
    return fail(err);
  }
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}

export async function createUserAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireUser("ADMIN");
  const schema = z.object({ name: z.string().min(1), email: z.string().email(), password: z.string().min(8), role: z.enum(["ADMIN", "STAFF"]) });
  try {
    const data = schema.parse({ name: formData.get("name"), email: String(formData.get("email") ?? "").trim().toLowerCase(), password: formData.get("password"), role: formData.get("role") });
    await prisma.user.create({ data: { name: data.name, email: data.email, role: data.role, passwordHash: hashPassword(data.password) } });
    revalidatePath("/settings");
    return { ok: true, message: `Added ${data.email}` };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteUserAction(userId: string): Promise<ActionResult> {
  const me = await requireUser("ADMIN");
  if (me.id === userId) return { ok: false, error: "You cannot delete your own account." };
  await prisma.user.delete({ where: { id: userId } });
  revalidatePath("/settings");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Batches
// ---------------------------------------------------------------------------

const batchSchema = z.object({
  name: z.string().min(1, "Give the batch a name"),
  supplierId: z.string().optional().nullable(),
  newSupplierName: z.string().optional(),
  currency: z.enum(CURRENCIES as unknown as [string, ...string[]]).default("AUD"),
  gstTreatment: z.enum(["INCLUSIVE", "EXCLUSIVE", "NONE"]).default("EXCLUSIVE"),
  fxRateToAud: z.coerce.number().positive().default(1),
  freightTotalAud: z.coerce.number().min(0).default(0),
  freightMode: z.enum(["PER_UNIT", "BY_VALUE"]).default("PER_UNIT"),
  splitExportBy: z.enum(["NONE", "BRAND", "PRODUCT_TYPE"]).default("BRAND"),
  // Letters only: it becomes the suffix on the 123abc- tag, and the catalogue writes it lowercase.
  builtBy: z.string().regex(/^[A-Za-z]{0,3}$/, "Initials only, up to three letters").optional(),
  notes: z.string().optional(),
});

export async function createBatchAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  let id: string;
  try {
    const raw = Object.fromEntries(formData.entries());
    const data = batchSchema.parse(raw);
    let supplierId = data.supplierId || null;
    if (!supplierId && data.newSupplierName?.trim()) {
      const supplier = await prisma.supplier.upsert({
        where: { name: data.newSupplierName.trim() },
        create: { name: data.newSupplierName.trim(), defaultCurrency: data.currency, defaultGstTreatment: data.gstTreatment },
        update: {},
      });
      supplierId = supplier.id;
    }
    const settings = await getSettings();
    const fx = data.currency === "AUD" ? 1 : data.fxRateToAud !== 1 ? data.fxRateToAud : settings.fxRates[data.currency] ?? 1;
    const batch = await prisma.importBatch.create({
      // The 123abc- marker names whoever built the listings, so it starts as the person creating the
      // batch and can be changed in batch settings when someone builds on another's behalf.
      data: { name: data.name, supplierId, createdById: user.id, builtBy: initialsFrom(user.name || user.email), currency: data.currency, gstTreatment: data.gstTreatment, fxRateToAud: fx, freightTotalAud: data.freightTotalAud, freightMode: data.freightMode, splitExportBy: data.splitExportBy, notes: data.notes || null },
    });
    await logAudit("batch.created", { batchId: batch.id, userId: user.id, details: { name: batch.name } });
    id = batch.id;
  } catch (err) {
    return fail(err);
  }
  redirect(`/batches/${id}`);
}

export async function updateBatchAction(batchId: string, patch: Partial<z.infer<typeof batchSchema>>): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const data = batchSchema.partial().parse(patch);
    const { newSupplierName: _n, ...rest } = data;
    void _n;
    await prisma.importBatch.update({ where: { id: batchId }, data: { ...rest, supplierId: rest.supplierId === undefined ? undefined : rest.supplierId || null } });
    await allocateBatchFreight(batchId);
    if (rest.fxRateToAud !== undefined || rest.gstTreatment !== undefined || rest.currency !== undefined) {
      await prisma.variant.updateMany({
        where: { product: { batchId } },
        data: { ...(rest.fxRateToAud !== undefined ? { fxRateToAud: rest.fxRateToAud } : {}), ...(rest.gstTreatment !== undefined ? { gstTreatment: rest.gstTreatment } : {}), ...(rest.currency !== undefined ? { costCurrency: rest.currency } : {}) },
      });
    }
    await repriceBatch(batchId);
    await logAudit("batch.settings", { batchId, userId: user.id, details: rest });
    revalidatePath(`/batches/${batchId}`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteBatchAction(batchId: string): Promise<ActionResult> {
  const user = await requireUser();
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
  if (!batch) return { ok: false, error: "Batch not found" };
  if (batch.status === "PUSHED") return { ok: false, error: "Roll back the Shopify push before deleting this batch." };
  await prisma.importBatch.delete({ where: { id: batchId } });
  await logAudit("batch.deleted", { userId: user.id, details: { name: batch.name, batchId } });
  redirect("/batches");
}

export async function deleteSourceFileAction(fileId: string): Promise<ActionResult> {
  await requireUser();
  const file = await prisma.sourceFile.findUnique({ where: { id: fileId } });
  if (!file) return { ok: false, error: "File not found" };
  await prisma.sourceFile.delete({ where: { id: fileId } });
  revalidatePath(`/batches/${file.batchId}`);
  return { ok: true };
}

export async function applyMappingsAction(batchId: string, inputs: ApplyMappingInput[]): Promise<ActionResult<{ products: number; variants: number; problems: string[] }>> {
  const user = await requireUser();
  try {
    const result = await applyMappings(batchId, inputs, user.id);
    if (result.problems.length) return { ok: false, error: result.problems.join(" ") };
    revalidatePath(`/batches/${batchId}`);
    return { ok: true, data: result };
  } catch (err) {
    return fail(err);
  }
}

export async function getReviewAction(batchId: string): Promise<ReviewData> {
  await requireUser();
  return loadReview(batchId);
}

const productPatch = z.object({
  handle: z.string().transform((s) => slugify(s)).optional(),
  title: z.string().optional(),
  bodyHtml: z.string().optional(),
  vendor: z.string().optional(),
  productType: z.string().optional(),
  category: z.string().optional(),
  tags: z.string().optional(),
  collections: z.string().optional(),
  status: z.enum(["draft", "active"]).optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  option1Name: z.string().nullable().optional(),
  option2Name: z.string().nullable().optional(),
  option3Name: z.string().nullable().optional(),
  metafields: z.record(z.string(), z.string()).optional(),
});

export async function updateProductAction(productId: string, patch: z.infer<typeof productPatch>): Promise<ActionResult> {
  await requireUser();
  try {
    const data = productPatch.parse(patch);
    const { metafields, ...rest } = data;
    await prisma.product.update({ where: { id: productId }, data: { ...rest, ...(metafields ? { metafields: JSON.stringify(metafields) } : {}), ...(rest.status ? { published: rest.status === "active" } : {}) } });
    if (rest.category !== undefined || rest.vendor !== undefined) {
      const variants = await prisma.variant.findMany({ where: { productId }, select: { id: true } });
      for (const v of variants) await repriceVariant(v.id);
    }
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

const variantPatch = z.object({
  sku: z.string().optional(),
  barcode: z.string().optional(),
  option1Value: z.string().nullable().optional(),
  option2Value: z.string().nullable().optional(),
  option3Value: z.string().nullable().optional(),
  grams: z.coerce.number().int().min(0).optional(),
  quantity: z.coerce.number().int().min(0).optional(),
  costPrice: z.coerce.number().min(0).optional(),
  gstTreatment: z.enum(["INCLUSIVE", "EXCLUSIVE", "NONE"]).optional(),
  freightPerUnitAud: z.coerce.number().min(0).optional(),
  retailOverride: z.coerce.number().min(0).nullable().optional(),
  compareAtPrice: z.coerce.number().min(0).nullable().optional(),
  pricingRuleId: z.string().nullable().optional(),
  locationQuantities: z.record(z.string(), z.number().int().min(0)).optional(),
});

export async function updateVariantAction(variantId: string, patch: z.infer<typeof variantPatch>): Promise<ActionResult> {
  await requireUser();
  try {
    const data = variantPatch.parse(patch);
    const { locationQuantities, ...rest } = data;
    await prisma.variant.update({ where: { id: variantId }, data: { ...rest, ...(locationQuantities ? { locationQuantities: JSON.stringify(locationQuantities), quantity: Object.values(locationQuantities).reduce((a, b) => a + b, 0) } : {}) } });
    await repriceVariant(variantId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteVariantAction(variantId: string): Promise<ActionResult> {
  await requireUser();
  const v = await prisma.variant.findUnique({ where: { id: variantId } });
  if (!v) return { ok: false, error: "Variant not found" };
  await prisma.variant.delete({ where: { id: variantId } });
  const remaining = await prisma.variant.count({ where: { productId: v.productId } });
  if (remaining === 0) await prisma.product.delete({ where: { id: v.productId } });
  return { ok: true };
}

export async function deleteProductAction(productId: string): Promise<ActionResult> {
  await requireUser();
  await prisma.product.delete({ where: { id: productId } });
  return { ok: true };
}

const bulkPatch = z.object({
  vendor: z.string().optional(),
  productType: z.string().optional(),
  category: z.string().optional(),
  addTag: z.string().optional(),
  addCollection: z.string().optional(),
  status: z.enum(["draft", "active"]).optional(),
  pricingRuleId: z.string().nullable().optional(),
  gstTreatment: z.enum(["INCLUSIVE", "EXCLUSIVE", "NONE"]).optional(),
  clearOverride: z.boolean().optional(),
  dismissWarnings: z.array(z.string()).optional(),
  restoreWarnings: z.boolean().optional(),
});

export async function bulkUpdateAction(batchId: string, productIds: string[], patch: z.infer<typeof bulkPatch>): Promise<ActionResult<{ products: number; variants: number }>> {
  const user = await requireUser();
  try {
    const data = bulkPatch.parse(patch);
    const products = await prisma.product.findMany({ where: { batchId, id: { in: productIds } }, include: { variants: true } });
    let variants = 0;
    for (const p of products) {
      const addList = (current: string, add?: string) => {
        if (!add?.trim()) return current;
        const set = new Set(current.split(",").map((s) => s.trim()).filter(Boolean));
        set.add(add.trim());
        return Array.from(set).join(", ");
      };
      await prisma.product.update({
        where: { id: p.id },
        data: {
          ...(data.vendor !== undefined ? { vendor: data.vendor } : {}),
          ...(data.productType !== undefined ? { productType: data.productType } : {}),
          ...(data.category !== undefined ? { category: data.category } : {}),
          ...(data.status !== undefined ? { status: data.status, published: data.status === "active" } : {}),
          tags: addList(p.tags, data.addTag),
          collections: addList(p.collections, data.addCollection),
        },
      });
      for (const v of p.variants) {
        const dismissed = new Set(parseJson<string[]>(v.warningsDismissed, []));
        if (data.restoreWarnings) dismissed.clear();
        for (const c of data.dismissWarnings ?? []) dismissed.add(c);
        await prisma.variant.update({
          where: { id: v.id },
          data: {
            ...(data.pricingRuleId !== undefined ? { pricingRuleId: data.pricingRuleId } : {}),
            ...(data.gstTreatment !== undefined ? { gstTreatment: data.gstTreatment } : {}),
            ...(data.clearOverride ? { retailOverride: null } : {}),
            warningsDismissed: JSON.stringify(Array.from(dismissed)),
          },
        });
        variants++;
      }
    }
    await repriceBatch(batchId);
    await logAudit("batch.bulk_edit", { batchId, userId: user.id, details: { products: products.length, patch: data } });
    return { ok: true, data: { products: products.length, variants } };
  } catch (err) {
    return fail(err);
  }
}

export async function dismissWarningAction(variantId: string, code: string, dismiss: boolean): Promise<ActionResult> {
  await requireUser();
  const v = await prisma.variant.findUnique({ where: { id: variantId } });
  if (!v) return { ok: false, error: "Variant not found" };
  const set = new Set(parseJson<string[]>(v.warningsDismissed, []));
  if (dismiss) set.add(code);
  else set.delete(code);
  await prisma.variant.update({ where: { id: variantId }, data: { warningsDismissed: JSON.stringify(Array.from(set)) } });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

export async function addImageUrlAction(productId: string, url: string, variantId: string | null): Promise<ActionResult<{ validated: boolean; reason?: string }>> {
  await requireUser();
  const check = await checkImageUrl(url.trim());
  if (!check.ok && check.reason === "Not a public HTTPS URL") return { ok: false, error: "Image URLs must be public https:// links." };
  const count = await prisma.productImage.count({ where: { productId } });
  await prisma.productImage.create({ data: { productId, variantId, url: url.trim(), position: count + 1, source: "MANUAL", validated: check.ok } });
  return { ok: true, data: { validated: check.ok, reason: check.reason } };
}

export async function removeImageAction(imageId: string): Promise<ActionResult> {
  await requireUser();
  const img = await prisma.productImage.findUnique({ where: { id: imageId } });
  if (!img) return { ok: false, error: "Image not found" };
  await prisma.productImage.delete({ where: { id: imageId } });
  const rest = await prisma.productImage.findMany({ where: { productId: img.productId }, orderBy: { position: "asc" } });
  await prisma.$transaction(rest.map((r, i) => prisma.productImage.update({ where: { id: r.id }, data: { position: i + 1 } })));
  return { ok: true };
}

export async function setImageVariantAction(imageId: string, variantId: string | null): Promise<ActionResult> {
  await requireUser();
  await prisma.productImage.update({ where: { id: imageId }, data: { variantId } });
  return { ok: true };
}

export async function moveImageAction(imageId: string, direction: -1 | 1): Promise<ActionResult> {
  await requireUser();
  const img = await prisma.productImage.findUnique({ where: { id: imageId } });
  if (!img) return { ok: false, error: "Image not found" };
  const all = await prisma.productImage.findMany({ where: { productId: img.productId }, orderBy: { position: "asc" } });
  const idx = all.findIndex((i) => i.id === imageId);
  const target = idx + direction;
  if (target < 0 || target >= all.length) return { ok: true };
  [all[idx], all[target]] = [all[target], all[idx]];
  await prisma.$transaction(all.map((r, i) => prisma.productImage.update({ where: { id: r.id }, data: { position: i + 1 } })));
  return { ok: true };
}

export async function saveImagesToLibraryAction(productId: string): Promise<ActionResult> {
  await requireUser();
  const product = await prisma.product.findUnique({ where: { id: productId }, include: { images: true, variants: { include: { lineItem: true } } } });
  if (!product) return { ok: false, error: "Product not found" };
  const modelCode = product.variants.map((v) => parseJson<{ modelCode?: string } | null>(v.lineItem?.normalized, null)?.modelCode).find(Boolean);
  if (!modelCode) return { ok: false, error: "This product has no model code, so it cannot be keyed in the image library." };
  await recordLibraryImages(product.vendor, modelCode, "", product.images.map((i) => i.url), "MANUAL");
  return { ok: true, message: "Saved to image library" };
}

export async function verifyImagesAction(batchId: string): Promise<ActionResult<{ checked: number; failed: number }>> {
  await requireUser();
  await prisma.productImage.updateMany({ where: { product: { batchId } }, data: { validated: false } });
  return { ok: true, data: await verifyBatchImages(batchId) };
}

// ---------------------------------------------------------------------------
// Export / Shopify
// ---------------------------------------------------------------------------

export async function exportBatchAction(batchId: string) {
  const user = await requireUser();
  const result = await exportBatch(batchId, user.id);
  revalidatePath(`/batches/${batchId}`);
  return result;
}

export async function reconcileAction(batchId: string): Promise<ActionResult<{ new: number; variantAdd: number; update: number }>> {
  const user = await requireUser();
  try {
    const cached = await prisma.shopifyCatalogItem.count();
    if (cached === 0) await syncCatalog(user.id);
    const data = await reconcileBatch(batchId);
    await logAudit("batch.reconciled", { batchId, userId: user.id, details: data });
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function pushBatchAction(batchId: string, opts: { confirm: boolean; overrideWarnings: boolean }) {
  const user = await requireUser();
  try {
    const result = await pushBatch(batchId, user.id, opts);
    revalidatePath(`/batches/${batchId}`);
    return result;
  } catch (err) {
    return { ok: false, errors: [err instanceof Error ? err.message : String(err)], created: 0, updated: 0 };
  }
}

export async function rollbackAction(batchId: string): Promise<ActionResult<{ deleted: number; restored: number; errors: string[] }>> {
  const user = await requireUser("ADMIN");
  try {
    const data = await rollbackBatch(batchId, user.id);
    revalidatePath(`/batches/${batchId}`);
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function enrichSeoAction(batchId: string, onlyMissing: boolean): Promise<ActionResult<{ updated: number; source: string }>> {
  const user = await requireUser();
  try {
    const data = await enrichBatchSeo(batchId, { onlyMissing });
    await logAudit("batch.seo", { batchId, userId: user.id, details: data });
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// Suppliers, rules, settings, library
// ---------------------------------------------------------------------------

export async function savePricingRuleAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireUser("ADMIN");
  const schema = z.object({
    id: z.string().optional(),
    name: z.string().min(1),
    scope: z.enum(["DEFAULT", "CATEGORY", "BRAND", "PRODUCT"]),
    matchValue: z.string().optional().default(""),
    mode: z.enum(["MARGIN", "MARKUP"]),
    percent: z.coerce.number().min(0).max(999),
    roundTo: z.enum(["NONE", "0.99", "0.95", "1.00", "5.00", "10.00"]),
    priority: z.coerce.number().int().default(0),
    active: z.coerce.boolean().default(true),
  });
  try {
    const raw = Object.fromEntries(formData.entries());
    const d = schema.parse({ ...raw, active: raw.active === "on" || raw.active === "true" });
    if (d.mode === "MARGIN" && d.percent >= 100) return { ok: false, error: "Margin must be below 100%." };
    if (d.scope !== "DEFAULT" && !d.matchValue.trim()) return { ok: false, error: "Enter the category, brand or SKU this rule matches." };
    const { id, ...data } = d;
    if (id) await prisma.pricingRule.update({ where: { id }, data });
    else await prisma.pricingRule.create({ data });
    revalidatePath("/pricing");
    return { ok: true, message: "Rule saved" };
  } catch (err) {
    return fail(err);
  }
}

export async function deletePricingRuleAction(id: string): Promise<ActionResult> {
  await requireUser("ADMIN");
  await prisma.pricingRule.delete({ where: { id } });
  await prisma.variant.updateMany({ where: { pricingRuleId: id }, data: { pricingRuleId: null } });
  revalidatePath("/pricing");
  return { ok: true };
}

export async function saveCategoryRuleAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireUser("ADMIN");
  const schema = z.object({
    id: z.string().optional(),
    category: z.string().min(1),
    pattern: z.string().min(1),
    productType: z.string().min(1),
    collections: z.string().optional().default(""),
    tags: z.string().optional().default(""),
    option1: z.string().optional(),
    option2: z.string().optional(),
    option3: z.string().optional(),
    priority: z.coerce.number().int().default(0),
    active: z.coerce.boolean().default(true),
  });
  try {
    const raw = Object.fromEntries(formData.entries());
    const d = schema.parse({ ...raw, active: raw.active === "on" || raw.active === "true" });
    new RegExp(d.pattern, "i");
    const { id, ...rest } = d;
    const data = { ...rest, option1: rest.option1 || null, option2: rest.option2 || null, option3: rest.option3 || null };
    if (id) await prisma.categoryRule.update({ where: { id }, data });
    else await prisma.categoryRule.create({ data });
    revalidatePath("/rules");
    return { ok: true, message: "Category rule saved" };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteCategoryRuleAction(id: string): Promise<ActionResult> {
  await requireUser("ADMIN");
  await prisma.categoryRule.delete({ where: { id } });
  revalidatePath("/rules");
  return { ok: true };
}

export async function saveSettingsAction(patch: Partial<AppSettings>): Promise<ActionResult> {
  const user = await requireUser("ADMIN");
  try {
    const schema = z.object({
      gstRate: z.number().min(0).max(1).optional(),
      pricesIncludeGst: z.boolean().optional(),
      minMarginPct: z.number().min(0).max(100).optional(),
      defaultRoundTo: z.string().optional(),
      fxRates: z.record(z.string(), z.number().positive()).optional(),
      shopify: z.object({ storeDomain: z.string(), accessToken: z.string(), apiVersion: z.string() }).partial().optional(),
      locations: z.array(z.object({ id: z.string(), name: z.string(), isDefault: z.boolean().optional() })).optional(),
      publicBaseUrl: z.string().optional(),
      seoTone: z.string().optional(),
    });
    const data = schema.parse(patch);
    await saveSettings(data as Partial<AppSettings>);
    await logAudit("settings.updated", { userId: user.id, details: { keys: Object.keys(data) } });
    revalidatePath("", "layout");
    return { ok: true, message: "Settings saved" };
  } catch (err) {
    return fail(err);
  }
}

export async function seedDefaultsAction(): Promise<ActionResult<{ pricingRules: number; categoryRules: number }>> {
  await requireUser("ADMIN");
  try {
    const data = await seedDefaults();
    revalidatePath("/pricing");
    revalidatePath("/rules");
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// Tag rules
// ---------------------------------------------------------------------------

export async function saveTagRuleAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireUser("ADMIN");
  const schema = z.object({
    id: z.string().optional(),
    name: z.string().min(1),
    matchField: z.enum(["any", "title", "brand", "category", "productType", "sku", "tags"]),
    pattern: z.string().min(1),
    addTags: z.string().optional().default(""),
    addCollections: z.string().optional().default(""),
    setProductType: z.string().optional().default(""),
    setMetafields: z.string().optional().default("{}"),
    priority: z.coerce.number().int().default(0),
    active: z.coerce.boolean().default(true),
  });
  try {
    const raw = Object.fromEntries(formData.entries());
    const d = schema.parse({ ...raw, active: raw.active === "on" || raw.active === "true" });
    // metafields arrive as "key=value" lines from the form; store JSON
    const mf: Record<string, string> = {};
    for (const line of d.setMetafields.split(/\n+/)) {
      const [k, ...rest] = line.split("=");
      if (k?.trim() && rest.length) mf[k.trim()] = rest.join("=").trim();
    }
    const { id, ...rest } = d;
    const data = { ...rest, setMetafields: JSON.stringify(mf) };
    if (id) await prisma.tagRule.update({ where: { id }, data });
    else await prisma.tagRule.create({ data });
    revalidatePath("/rules");
    return { ok: true, message: "Rule saved" };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteTagRuleAction(id: string): Promise<ActionResult> {
  await requireUser("ADMIN");
  await prisma.tagRule.delete({ where: { id } });
  revalidatePath("/rules");
  return { ok: true };
}

export async function applyRulesAction(batchId: string): Promise<ActionResult<{ products: number; matched: number }>> {
  const user = await requireUser();
  try {
    const data = await applyRulesToBatch(batchId);
    await logAudit("batch.rules_applied", { batchId, userId: user.id, details: data });
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Fill the description and the retail price from the brand's own website.
 *
 * It already runs once on its own when a batch is built, so this is the second look — for the
 * products it could not find the first time, or for one product somebody wants re-checked.
 */
export async function lookupProductsAction(batchId: string, opts: { productIds?: string[]; retry?: boolean } = {}): Promise<ActionResult<LookupOutcome & { limit: number }>> {
  const user = await requireUser();
  if (!lookupEnabled()) return { ok: false, error: "Set ANTHROPIC_API_KEY to look products up on the web." };
  try {
    const data = await lookupBatch(batchId, { ...opts, userId: user.id, budgetMs: REQUESTED_BUDGET_MS });
    revalidatePath(`/batches/${batchId}/review`);
    return { ok: true, data: { ...data, limit: LOOKUP_LIMIT } };
  } catch (err) {
    return fail(err);
  }
}

/**
 * How many of a batch's files are still being read.
 *
 * One small query, so a page waiting on a scan can ask often without re-rendering itself and
 * everything on it each time — which on a database in another region is most of a second, every
 * few seconds, for as long as the reading takes.
 */
export async function readingCountAction(batchId: string): Promise<number> {
  await requireUser();
  return prisma.sourceFile.count({ where: { batchId, extractionStatus: "PENDING" } });
}

/**
 * Read a stored file again.
 *
 * Reading happens after the upload has been answered, and it has the same time limit the upload
 * did — so a large scan can still run out of it. The file is safe either way, so trying again is
 * the whole of the recovery, and nobody has to find the invoice and upload it twice.
 */
export async function retryExtractionAction(fileId: string): Promise<ActionResult<{ rows: number; warnings: string[] }>> {
  const user = await requireUser();
  try {
    await prisma.sourceFile.update({ where: { id: fileId }, data: { extractionStatus: "PENDING", extractionError: null } });
    const result = await extractStoredFile(fileId);
    const file = await prisma.sourceFile.findUniqueOrThrow({ where: { id: fileId }, select: { batchId: true } });
    await logAudit("file.reread", { batchId: file.batchId, userId: user.id, details: { fileId, rows: result.rows } });
    revalidatePath(`/batches/${file.batchId}`);
    return { ok: true, data: { rows: result.rows, warnings: result.warnings } };
  } catch (err) {
    await prisma.sourceFile.update({ where: { id: fileId }, data: { extractionStatus: "FAILED", extractionError: err instanceof Error ? err.message : String(err) } }).catch(() => undefined);
    return fail(err);
  }
}

/**
 * The CSV as text, so the browser can save it itself.
 *
 * The file route is the normal way down, but when it fails there is nothing to see: a link that
 * downloads nothing looks identical whether the route 404'd, the session was rejected, or the
 * browser declined the response. This goes through the same code the route does, over a channel
 * the page can actually report on.
 */
export async function downloadCsvAction(fileId: string): Promise<ActionResult<{ filename: string; text: string }>> {
  await requireUser();
  try {
    const result = await exportFileText(fileId);
    return "error" in result ? { ok: false, error: result.error } : { ok: true, data: result };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// Unassigned product photos
// ---------------------------------------------------------------------------

export async function attachPhotoAction(imageId: string, productId: string, variantId: string | null): Promise<ActionResult> {
  await requireUser();
  const photo = await prisma.unassignedImage.findUnique({ where: { id: imageId } });
  if (!photo) return { ok: false, error: "Photo not found" };
  const count = await prisma.productImage.count({ where: { productId } });
  await prisma.productImage.create({ data: { productId, variantId, url: photo.url, position: count + 1, source: "MANUAL", validated: /^https:/.test(photo.url) } });
  await prisma.unassignedImage.delete({ where: { id: imageId } });
  return { ok: true };
}

export async function deletePhotoAction(imageId: string): Promise<ActionResult> {
  await requireUser();
  await prisma.unassignedImage.delete({ where: { id: imageId } });
  return { ok: true };
}

export async function autoAttachPhotosAction(batchId: string): Promise<ActionResult<{ attached: number }>> {
  await requireUser();
  try {
    return { ok: true, data: { attached: await attachUnassignedPhotos(batchId) } };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// Product templates: conventions learned from a Shopify export.
// ---------------------------------------------------------------------------

/** Read an uploaded export without saving anything, so the result can be reviewed first. */
export async function analyseTemplateCsvAction(formData: FormData): Promise<ActionResult<{ analysis: TemplateAnalysis; fileName: string }>> {
  await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a CSV file to read." };
  if (file.size > 8 * 1024 * 1024) return { ok: false, error: "That file is over 8MB. Export a single brand at a time." };
  try {
    const analysis = analyseShopifyCsv(await file.text());
    if (analysis.productCount === 0) return { ok: false, error: analysis.warnings[0] ?? "No products could be read from that file." };
    return { ok: true, data: { analysis, fileName: file.name } };
  } catch (err) {
    return fail(err);
  }
}

export async function saveTemplateAction(_prev: unknown, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  if (user.role !== "ADMIN") return { ok: false, error: "Only an admin can save templates." };
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const matchValue = String(formData.get("matchValue") ?? "").trim();
  if (!name) return { ok: false, error: "Give the template a name." };
  if (!matchValue) return { ok: false, error: "Say which brand, product type or category this applies to." };
  const data = {
    name,
    scope: String(formData.get("scope") ?? "BRAND"),
    matchValue,
    matchProductType: String(formData.get("matchProductType") ?? "").trim(),
    sourceFileName: String(formData.get("sourceFileName") ?? ""),
    productCount: Number(formData.get("productCount") ?? 0) || 0,
    setProductType: String(formData.get("setProductType") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim(),
    addTags: String(formData.get("addTags") ?? "").trim(),
    addCollections: String(formData.get("addCollections") ?? "").trim(),
    optionNames: String(formData.get("optionNames") ?? "").trim(),
    setMetafields: String(formData.get("setMetafields") ?? "{}"),
    analysis: String(formData.get("analysis") ?? "{}"),
    priority: Number(formData.get("priority") ?? 0) || 0,
    active: formData.get("active") === "on",
  };
  try {
    const saved = id
      ? await prisma.productTemplate.update({ where: { id }, data })
      : await prisma.productTemplate.create({ data });
    await logAudit(id ? "template.updated" : "template.created", { userId: user.id, details: { name, scope: data.scope, matchValue, productCount: data.productCount } });
    revalidatePath("/templates");
    return { ok: true, data: { id: saved.id }, message: `Saved “${name}”.` };
  } catch (err) {
    return fail(err);
  }
}

/** A template the analyser is proposing, before anyone has agreed to save it. */
export interface TemplateProposal {
  key: string;
  fileName: string;
  name: string;
  scope: "BRAND" | "PRODUCT_TYPE";
  matchValue: string;
  matchProductType: string;
  productCount: number;
  setProductType: string;
  addTags: string;
  addCollections: string;
  optionNames: string;
  setMetafields: Record<string, string>;
  titleExamples: string[];
  analysis: string;
}

const MAX_TEMPLATE_FILES = 60;
const MAX_TEMPLATE_BYTES = 8 * 1024 * 1024;

/**
 * Read a whole export library at once. Each file may hold several brands, so every file is split by
 * brand and product type and each group proposed separately. Nothing is written: the proposals come
 * back for review, because a template that silently taught itself the wrong convention is worse
 * than no template at all.
 */
export async function analyseTemplateCsvsAction(
  formData: FormData,
): Promise<ActionResult<{ proposals: TemplateProposal[]; warnings: string[]; filesRead: number }>> {
  await requireUser();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { ok: false, error: "Choose one or more CSV files to read." };
  if (files.length > MAX_TEMPLATE_FILES) {
    return { ok: false, error: `That is ${files.length} files. Upload up to ${MAX_TEMPLATE_FILES} at a time.` };
  }

  const proposals: TemplateProposal[] = [];
  const warnings: string[] = [];
  let filesRead = 0;

  for (const file of files) {
    if (file.size > MAX_TEMPLATE_BYTES) {
      warnings.push(`${file.name} is over 8MB and was skipped. Export it in smaller pieces.`);
      continue;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      warnings.push(`${file.name} could not be read.`);
      continue;
    }
    const { groups, warnings: fileWarnings } = analyseShopifyCsvGroups(text);
    for (const w of fileWarnings) warnings.push(`${file.name}: ${w}`);
    if (groups.length === 0) continue;
    filesRead++;

    for (const group of groups) {
      const a = group.analysis;
      const vendor = a.vendor.trim();
      const type = a.productType.trim();
      if (!vendor && !type) continue;
      proposals.push({
        key: `${file.name}::${vendor}::${type}`,
        fileName: file.name,
        name: [vendor, type].filter(Boolean).join(" ") || file.name.replace(/\.csv$/i, ""),
        scope: vendor ? "BRAND" : "PRODUCT_TYPE",
        matchValue: vendor || type,
        // A group is by definition one product type, so always narrow a brand template to it.
        matchProductType: vendor && type ? type : "",
        productCount: a.productCount,
        setProductType: type,
        addTags: a.commonTags.join(", "),
        addCollections: a.collections.join(", "),
        optionNames: a.optionNames.join(", "),
        setMetafields: a.metafields,
        titleExamples: a.titleExamples,
        analysis: JSON.stringify(a),
      });
    }
  }

  if (proposals.length === 0) {
    return { ok: false, error: warnings[0] ?? "No products could be read from those files." };
  }
  // Merge duplicates across files: the same brand and type exported twice is one template, built
  // from whichever export had more products to learn from.
  const byMatch = new Map<string, TemplateProposal>();
  for (const p of proposals) {
    const key = `${p.scope}::${p.matchValue.toLowerCase()}::${p.matchProductType.toLowerCase()}`;
    const existing = byMatch.get(key);
    if (!existing || p.productCount > existing.productCount) byMatch.set(key, p);
  }
  const merged = [...byMatch.values()].sort((a, b) => b.productCount - a.productCount || a.name.localeCompare(b.name));
  if (merged.length < proposals.length) {
    warnings.push(`${proposals.length - merged.length} duplicate brand/type group${proposals.length - merged.length === 1 ? " was" : "s were"} merged.`);
  }
  return { ok: true, data: { proposals: merged, warnings, filesRead } };
}

/** Save the proposals a person ticked, replacing any existing template that matches the same thing. */
export async function saveTemplatesBulkAction(
  proposals: Array<TemplateProposal & { notes?: string }>,
): Promise<ActionResult<{ created: number; replaced: number }>> {
  const user = await requireUser();
  if (user.role !== "ADMIN") return { ok: false, error: "Only an admin can save templates." };
  if (proposals.length === 0) return { ok: false, error: "Nothing was selected." };

  let created = 0;
  let replaced = 0;
  try {
    for (const p of proposals) {
      const data = {
        name: p.name.trim() || p.matchValue,
        scope: p.scope,
        matchValue: p.matchValue.trim(),
        matchProductType: p.matchProductType.trim(),
        notes: (p.notes ?? "").trim(),
        sourceFileName: p.fileName,
        productCount: p.productCount,
        setProductType: p.setProductType.trim(),
        addTags: p.addTags.trim(),
        addCollections: p.addCollections.trim(),
        optionNames: p.optionNames.trim(),
        setMetafields: JSON.stringify(p.setMetafields ?? {}),
        analysis: p.analysis || "{}",
        priority: 0,
        active: true,
      };
      if (!data.matchValue) continue;
      // Re-uploading an export should update the template it came from, not stack a second one.
      const existing = await prisma.productTemplate.findFirst({
        where: { scope: data.scope, matchValue: data.matchValue, matchProductType: data.matchProductType },
      });
      if (existing) {
        // A note written by hand survives a re-import that carries none.
        await prisma.productTemplate.update({
          where: { id: existing.id },
          data: { ...data, notes: data.notes || existing.notes },
        });
        replaced++;
      } else {
        await prisma.productTemplate.create({ data });
        created++;
      }
    }
    await logAudit("template.bulk_saved", { userId: user.id, details: { created, replaced } });
    revalidatePath("/templates");
    return {
      ok: true,
      data: { created, replaced },
      message: `Saved ${created + replaced} template${created + replaced === 1 ? "" : "s"}${replaced ? ` (${replaced} updated in place)` : ""}.`,
    };
  } catch (err) {
    return fail(err);
  }
}

/** The free-text house rules that go to the AI for every product, whatever brand it is. */
export async function saveHouseRulesAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (user.role !== "ADMIN") return { ok: false, error: "Only an admin can change the house rules." };
  try {
    await saveSettings({ houseRules: String(formData.get("houseRules") ?? "").trim() });
    await logAudit("settings.house_rules", { userId: user.id, details: {} });
    revalidatePath("/templates");
    return { ok: true, message: "House rules saved." };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteProductTemplateAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (user.role !== "ADMIN") return { ok: false, error: "Only an admin can delete templates." };
  await prisma.productTemplate.delete({ where: { id } });
  await logAudit("template.deleted", { userId: user.id, details: { id } });
  revalidatePath("/templates");
  return { ok: true };
}

export async function toggleProductTemplateAction(id: string, active: boolean): Promise<ActionResult> {
  const user = await requireUser();
  if (user.role !== "ADMIN") return { ok: false, error: "Only an admin can change templates." };
  await prisma.productTemplate.update({ where: { id }, data: { active } });
  revalidatePath("/templates");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Feedback on a finished CSV
// ---------------------------------------------------------------------------

export interface FeedbackMessage {
  id: string;
  role: string;
  body: string;
  proposal: string;
  appliedRule: string;
  createdAt: string;
}

function asMessage(row: { id: string; role: string; body: string; proposal: string; appliedRule: string; createdAt: Date }): FeedbackMessage {
  return { id: row.id, role: row.role, body: row.body, proposal: row.proposal, appliedRule: row.appliedRule, createdAt: row.createdAt.toISOString() };
}

/**
 * Say what is wrong with a finished CSV and get an answer — and, where the correction is general,
 * the standing rule that would stop it happening again. The rule is only proposed here; adding it
 * is a separate, deliberate act.
 */
export async function sendFeedbackAction(batchId: string, message: string): Promise<ActionResult<{ messages: FeedbackMessage[] }>> {
  const user = await requireUser();
  const body = message.trim();
  if (!body) return { ok: false, error: "Say what is wrong and it will be answered." };

  try {
    await prisma.exportFeedback.create({ data: { batchId, userId: user.id, role: "USER", body } });

    if (feedbackAvailable()) {
      const [batch, products, settings, thread] = await Promise.all([
        prisma.importBatch.findUniqueOrThrow({ where: { id: batchId }, select: { name: true } }),
        prisma.product.findMany({ where: { batchId }, select: { title: true, vendor: true, productType: true, tags: true }, orderBy: { sortOrder: "asc" } }),
        getSettings(),
        prisma.exportFeedback.findMany({ where: { batchId }, orderBy: { createdAt: "asc" } }),
      ]);
      const turns: FeedbackTurn[] = thread.map((t) => ({ role: t.role === "USER" ? "USER" : "ASSISTANT", body: t.body }));
      const reply = await answerFeedback({ products, houseRules: settings.houseRules, batchName: batch.name }, turns);
      if (reply) {
        await prisma.exportFeedback.create({
          data: { batchId, role: "ASSISTANT", body: reply.reply, proposal: reply.proposal.trim() },
        });
      }
    }

    const messages = await prisma.exportFeedback.findMany({ where: { batchId }, orderBy: { createdAt: "asc" } });
    revalidatePath(`/batches/${batchId}/export`);
    return { ok: true, data: { messages: messages.map(asMessage) } };
  } catch (err) {
    return fail(err);
  }
}

/** Accept a proposed rule: it joins the standing instructions every future import is built against. */
export async function applyFeedbackRuleAction(feedbackId: string): Promise<ActionResult<{ houseRules: string }>> {
  const user = await requireUser();
  try {
    const row = await prisma.exportFeedback.findUniqueOrThrow({ where: { id: feedbackId } });
    if (!row.proposal.trim()) return { ok: false, error: "There is no rule to add on that message." };

    const settings = await getSettings();
    const houseRules = withRule(settings.houseRules, row.proposal);
    await saveSettings({ houseRules });
    await prisma.exportFeedback.update({ where: { id: feedbackId }, data: { appliedRule: row.proposal.trim() } });
    await logAudit("feedback.rule", { batchId: row.batchId, userId: user.id, details: { rule: row.proposal.trim() } });

    revalidatePath(`/batches/${row.batchId}/export`);
    revalidatePath("/templates");
    return { ok: true, data: { houseRules } };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// Instructions about an invoice
// ---------------------------------------------------------------------------

export interface InstructionMessage {
  id: string;
  role: string;
  body: string;
  createdAt: string;
}

/**
 * Say what is true about this invoice in words — the brand it all is, a tag it all needs, a
 * closeout discount — and have the build obey it. What was understood is read back, and shown
 * against the batch, so nobody has to guess what a batch was built under.
 */
export async function sendInstructionAction(batchId: string, message: string): Promise<ActionResult<{ messages: InstructionMessage[]; directives: string[] }>> {
  const user = await requireUser();
  const body = message.trim();
  if (!body) return { ok: false, error: "Say what is true about this invoice." };

  try {
    await prisma.batchInstruction.create({ data: { batchId, userId: user.id, role: "USER", body } });

    const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: batchId }, select: { directives: true } });
    let directives = parseDirectives(batch.directives);

    if (instructionsAvailable()) {
      const thread = await prisma.batchInstruction.findMany({ where: { batchId }, orderBy: { createdAt: "asc" } });
      const reading = await readInstructions(
        thread.map((t) => ({ role: t.role === "USER" ? "USER" : "ASSISTANT", body: t.body })),
        directives,
      );
      if (reading) {
        directives = reading.directives;
        await prisma.$transaction([
          prisma.importBatch.update({ where: { id: batchId }, data: { directives: JSON.stringify(reading.directives) } }),
          prisma.batchInstruction.create({ data: { batchId, role: "ASSISTANT", body: reading.reply } }),
        ]);
        await logAudit("batch.instruction", { batchId, userId: user.id, details: reading.directives });
        // Products already built are rebuilt against what was just said.
        const built = await prisma.product.count({ where: { batchId } });
        if (built > 0) await repriceBatch(batchId);
      }
    }

    const messages = await prisma.batchInstruction.findMany({ where: { batchId }, orderBy: { createdAt: "asc" } });
    revalidatePath(`/batches/${batchId}`);
    return { ok: true, data: { messages: messages.map((m) => ({ id: m.id, role: m.role, body: m.body, createdAt: m.createdAt.toISOString() })), directives: describeDirectives(directives) } };
  } catch (err) {
    return fail(err);
  }
}

/** Forget everything said about this invoice and build it on the rules alone. */
export async function clearInstructionsAction(batchId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await prisma.$transaction([
      prisma.batchInstruction.deleteMany({ where: { batchId } }),
      prisma.importBatch.update({ where: { id: batchId }, data: { directives: JSON.stringify(NO_DIRECTIVES) } }),
    ]);
    const built = await prisma.product.count({ where: { batchId } });
    if (built > 0) await repriceBatch(batchId);
    await logAudit("batch.instruction.cleared", { batchId, userId: user.id });
    revalidatePath(`/batches/${batchId}`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
