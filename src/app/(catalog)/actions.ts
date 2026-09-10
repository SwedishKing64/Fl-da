"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma, parseJson } from "@/lib/catalog/db";
import { createSession, destroySession, hashPassword, requireUser, usersExist, verifyPassword } from "@/lib/catalog/auth";
import { allocateBatchFreight, applyMappings, loadReview, repriceBatch, repriceVariant, verifyBatchImages, exportBatch, type ApplyMappingInput, type ReviewData } from "@/lib/catalog/pipeline";
import { logAudit } from "@/lib/catalog/audit";
import { getSettings, saveSettings } from "@/lib/catalog/settings";
import { checkImageUrl, recordLibraryImages } from "@/lib/catalog/images";
import { pushBatch, reconcileBatch, rollbackBatch, syncCatalog, fetchLocations, ShopifyError } from "@/lib/catalog/shopify";
import { enrichBatchSeo } from "@/lib/catalog/seo";
import { slugify } from "@/lib/catalog/handle";
import { CURRENCIES, type AppSettings } from "@/lib/catalog/types";
import { seedDefaults } from "@/lib/catalog/seed";

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

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
  publishOnExport: z.coerce.boolean().default(false),
  notes: z.string().optional(),
});

export async function createBatchAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  let id: string;
  try {
    const raw = Object.fromEntries(formData.entries());
    const data = batchSchema.parse({ ...raw, publishOnExport: raw.publishOnExport === "on" });
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
      data: { name: data.name, supplierId, createdById: user.id, currency: data.currency, gstTreatment: data.gstTreatment, fxRateToAud: fx, freightTotalAud: data.freightTotalAud, freightMode: data.freightMode, publishOnExport: data.publishOnExport, notes: data.notes || null },
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
    if (rest.publishOnExport !== undefined) {
      await prisma.product.updateMany({ where: { batchId }, data: { published: rest.publishOnExport, status: rest.publishOnExport ? "active" : "draft" } });
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

export async function exportBatchAction(batchId: string, overrideWarnings: boolean) {
  const user = await requireUser();
  const result = await exportBatch(batchId, user.id, { overrideWarnings });
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

export async function syncCatalogAction(): Promise<ActionResult<{ products: number; variants: number }>> {
  const user = await requireUser();
  try {
    const data = await syncCatalog(user.id);
    revalidatePath("/shopify");
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function fetchLocationsAction(): Promise<ActionResult<{ count: number }>> {
  await requireUser("ADMIN");
  try {
    const locations = await fetchLocations();
    await saveSettings({ locations });
    revalidatePath("/shopify");
    return { ok: true, data: { count: locations.length } };
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

export async function saveSupplierAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireUser();
  const schema = z.object({ id: z.string().optional(), name: z.string().min(1), defaultCurrency: z.string(), defaultGstTreatment: z.enum(["INCLUSIVE", "EXCLUSIVE", "NONE"]), defaultBrand: z.string().optional(), notes: z.string().optional() });
  try {
    const d = schema.parse(Object.fromEntries(formData.entries()));
    const data = { name: d.name.trim(), defaultCurrency: d.defaultCurrency, defaultGstTreatment: d.defaultGstTreatment, defaultBrand: d.defaultBrand || null, notes: d.notes || null };
    if (d.id) await prisma.supplier.update({ where: { id: d.id }, data });
    else await prisma.supplier.create({ data });
    revalidatePath("/suppliers");
    return { ok: true, message: "Supplier saved" };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteSupplierAction(id: string): Promise<ActionResult> {
  await requireUser("ADMIN");
  await prisma.supplier.delete({ where: { id } });
  revalidatePath("/suppliers");
  return { ok: true };
}

export async function deleteTemplateAction(id: string): Promise<ActionResult> {
  await requireUser();
  await prisma.mappingTemplate.delete({ where: { id } });
  revalidatePath("/suppliers");
  return { ok: true };
}

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
    revalidatePath("/pricing");
    return { ok: true, message: "Category rule saved" };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteCategoryRuleAction(id: string): Promise<ActionResult> {
  await requireUser("ADMIN");
  await prisma.categoryRule.delete({ where: { id } });
  revalidatePath("/pricing");
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

export async function saveLibraryEntryAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireUser();
  const schema = z.object({ brand: z.string().min(1), modelCode: z.string().min(1), colour: z.string().optional().default(""), urls: z.string().min(1) });
  try {
    const d = schema.parse(Object.fromEntries(formData.entries()));
    const urls = d.urls.split(/[\n,|]+/).map((s) => s.trim()).filter(Boolean);
    await recordLibraryImages(d.brand, d.modelCode, d.colour, urls, "MANUAL");
    revalidatePath("/images");
    return { ok: true, message: "Library entry saved" };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteLibraryEntryAction(id: string): Promise<ActionResult> {
  await requireUser();
  await prisma.imageLibraryEntry.delete({ where: { id } });
  revalidatePath("/images");
  return { ok: true };
}

export async function seedDefaultsAction(): Promise<ActionResult<{ pricingRules: number; categoryRules: number }>> {
  await requireUser("ADMIN");
  try {
    const data = await seedDefaults();
    revalidatePath("/pricing");
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}
