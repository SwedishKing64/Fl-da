"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { after } from "next/server";
import type { ExportResult } from "@/lib/catalog/pipeline";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PLAN_IDS, planOf, TRIAL_DAYS } from "@/lib/catalog/plans";
import { prisma, parseJson, createTables, databaseStatus } from "@/lib/catalog/db";
import { createSession, destroySession, hashPassword, recoveryUser, requireUser, usersExist, verifyPassword } from "@/lib/catalog/auth";
import { allocateBatchFreight, applyMappings, autoApplyMappings, applyRulesToBatch, attachUnassignedPhotos, extractStoredFile, loadReview, repriceBatch, repriceVariant, verifyBatchImages, exportBatch, exportFileText, type ApplyMappingInput, type ReviewData } from "@/lib/catalog/pipeline";
import { logAudit } from "@/lib/catalog/audit";
import { saveRun } from "@/lib/catalog/work-runs";
import { getSettings, saveSettings } from "@/lib/catalog/settings";
import { checkImageUrl, recordLibraryImages } from "@/lib/catalog/images";
import { backupNow, restoreBackup } from "@/lib/catalog/backup";
import { catalogueKnown, decideMatch, pushBatch, reconcileBatch, refreshCatalogueIfStale, rollbackBatch, ShopifyError, type ReconcileCounts } from "@/lib/catalog/shopify";
import { enrichBatchSeo } from "@/lib/catalog/seo";
import { slugify } from "@/lib/catalog/handle";
import { CURRENCIES, emptyLineItem, type AppSettings } from "@/lib/catalog/types";
import { seedDefaults } from "@/lib/catalog/seed";
import { planAdjustment, planAdjustments, screenInstructions, planningAvailable, describePlan, splitInstructions, type SplitInstructions } from "@/lib/catalog/adjust-plan";
import type { Plan } from "@/lib/catalog/adjust";
import { readInvoiceGrids, type InvoiceRead } from "@/lib/catalog/invoice";
import { describeApiError } from "@/lib/catalog/api-errors";
import type { CanonicalLineItem } from "@/lib/catalog/types";
import { MAX_UPLOAD, readableSize } from "@/lib/catalog/image-size";
import { aiAvailable } from "@/lib/catalog/anthropic";
import { initialsFrom } from "@/lib/catalog/tagging";
import { answerFeedback, feedbackAvailable, withRule, type FeedbackTurn } from "@/lib/catalog/feedback";
import { describeDirectives, instructionsAvailable, parseDirectives, readInstructions, NO_DIRECTIVES } from "@/lib/catalog/instructions";
import { lookupBatch, lookupEnabled, LOOKUP_LIMIT, REQUESTED_BUDGET_MS, type LookupOutcome } from "@/lib/catalog/enrich";
import { SUPPORT_EMAIL } from "@/lib/catalog/support";
import { homeCurrency } from "@/lib/catalog/shop-profile";
import { isPackSet } from "@/lib/catalog/trades";

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

/** An error as words for the page. An API error is described; anything else keeps its message. */
function said(err: unknown): string {
  return describeApiError(err) ?? (err instanceof Error ? err.message : String(err));
}

/**
 * An action that cannot throw.
 *
 * A thrown error reaches the browser in production as a digest and the words "an error occurred
 * in the Server Components render", with the message hidden — twice now the only thing anyone
 * had to go on. Returned as a failure instead, the message arrives whole and is shown where the
 * button is. Next's own signals (a redirect to the login page) are rethrown untouched.
 */
async function safely<T>(work: () => Promise<T>): Promise<T | ActionResult<never>> {
  try {
    return await work();
  } catch (err) {
    unstable_rethrow(err);
    console.error("[action]", err);
    return fail(err);
  }
}

function fail(err: unknown): ActionResult<never> {
  if (err instanceof z.ZodError) return { ok: false, error: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  if (err instanceof ShopifyError) return { ok: false, error: err.message };
  // Never the API's raw JSON. See api-errors.ts.
  const fromApi = describeApiError(err);
  if (fromApi) return { ok: false, error: fromApi };
  return { ok: false, error: said(err) };
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function loginAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return safely(async () => {
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    const found = await prisma.user.findUnique({ where: { email } });
    const user = found && verifyPassword(password, found.passwordHash) ? found : await recoveryUser(email, password);
    if (!user) {
      // Which database the site is reading, so an account that "should be there" can be looked for
      // in the right place. See databaseStatus.
      const status = await databaseStatus();
      const where = status.state === "ok" ? "" : ` The site is reading ${status.source ?? "no database"} (${status.state}).`;
      return { ok: false, error: found ? `Email or password is incorrect.${where}` : `There is no account for ${email} in the database this site is using.${where}` };
    }
    await createSession(user.id);
    redirect("/");
  });
}

export async function setupAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  if (await usersExist()) return { ok: false, error: "Setup has already been completed." };
  const schema = z.object({ name: z.string().min(1), email: z.string().email(), password: z.string().min(8) });
  try {
    const data = schema.parse({ name: formData.get("name"), email: String(formData.get("email") ?? "").trim().toLowerCase(), password: formData.get("password") });
    const user = await prisma.user.create({ data: { name: data.name, email: data.email, passwordHash: hashPassword(data.password), role: "ADMIN" } });
    await createSession(user.id);
  } catch (err) {
    return fail(err);
  }
  // The rules are seeded when the shop says what it sells, on the next step of setup.
  redirect("/setup");
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
  return safely(async () => {
    const me = await requireUser("ADMIN");
    if (me.id === userId) return { ok: false, error: "You cannot delete your own account." };
    await prisma.user.delete({ where: { id: userId } });
    revalidatePath("/settings");
    return { ok: true };
  });
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
  fxRateToHome: z.coerce.number().positive().default(1),
  freightTotalHome: z.coerce.number().min(0).default(0),
  freightMode: z.enum(["PER_UNIT", "BY_VALUE"]).default("PER_UNIT"),
  splitExportBy: z.enum(["NONE", "BRAND", "PRODUCT_TYPE"]).default("BRAND"),
  // Letters only: it becomes the suffix on the shop's marker tag, and the catalogue writes it lowercase.
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
    const fx = data.currency === homeCurrency() ? 1 : data.fxRateToHome !== 1 ? data.fxRateToHome : settings.fxRates[data.currency] ?? 1;
    const batch = await prisma.importBatch.create({
      // The marker tag names whoever built the listings, so it starts as the person creating the
      // batch and can be changed in batch settings when someone builds on another's behalf.
      data: { name: data.name, supplierId, createdById: user.id, builtBy: initialsFrom(user.name || user.email), currency: data.currency, gstTreatment: data.gstTreatment, fxRateToHome: fx, freightTotalHome: data.freightTotalHome, freightMode: data.freightMode, splitExportBy: data.splitExportBy, notes: data.notes || null },
    });
    await logAudit("batch.created", { batchId: batch.id, userId: user.id, details: { name: batch.name } });
    id = batch.id;
  } catch (err) {
    return fail(err);
  }
  redirect(`/batches/${id}`);
}

/** The tutorial's first invoice: an ordinary batch, in the shop's own currency, ready for a file. */
export async function startFirstInvoiceAction(): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  try {
    const batch = await prisma.importBatch.create({ data: { name: "First invoice", createdById: user.id, builtBy: initialsFrom(user.name || user.email), currency: homeCurrency() } });
    await logAudit("batch.created", { batchId: batch.id, userId: user.id, details: { name: batch.name, tutorial: true } });
    return { ok: true, data: { id: batch.id } };
  } catch (err) {
    return fail(err);
  }
}

export async function updateBatchAction(batchId: string, patch: Partial<z.infer<typeof batchSchema>>): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const data = batchSchema.partial().parse(patch);
    const { newSupplierName: _n, ...rest } = data;
    void _n;
    await prisma.importBatch.update({ where: { id: batchId }, data: { ...rest, supplierId: rest.supplierId === undefined ? undefined : rest.supplierId || null } });
    await allocateBatchFreight(batchId);
    if (rest.fxRateToHome !== undefined || rest.gstTreatment !== undefined || rest.currency !== undefined) {
      await prisma.variant.updateMany({
        where: { product: { batchId } },
        data: { ...(rest.fxRateToHome !== undefined ? { fxRateToHome: rest.fxRateToHome } : {}), ...(rest.gstTreatment !== undefined ? { gstTreatment: rest.gstTreatment } : {}), ...(rest.currency !== undefined ? { costCurrency: rest.currency } : {}) },
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
  return safely(async () => {
    const user = await requireUser();
    const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
    if (!batch) return { ok: false, error: "Batch not found" };
    if (batch.status === "PUSHED") return { ok: false, error: "Roll back the Shopify push before deleting this batch." };
    await prisma.importBatch.delete({ where: { id: batchId } });
    await logAudit("batch.deleted", { userId: user.id, details: { name: batch.name, batchId } });
    redirect("/batches");
  });
}

export async function deleteSourceFileAction(fileId: string): Promise<ActionResult> {
  return safely(async () => {
    await requireUser();
    const file = await prisma.sourceFile.findUnique({ where: { id: fileId } });
    if (!file) return { ok: false, error: "File not found" };
    await prisma.sourceFile.delete({ where: { id: fileId } });
    revalidatePath(`/batches/${file.batchId}`);
    return { ok: true };
  });
}

/**
 * Build the batch's products from its files, now — the way on from the upload page.
 *
 * Products are built by themselves after an upload, but only when there is something to build
 * from, and when there is not the page used to offer no way forward at all. This says why.
 */
/**
 * The build, checked by the model against the shop's conventions and the instruction chat, with
 * what is plainly wrong put right and the rest asked. See batch-agent.ts.
 */
/**
 * The first half of the build check: the files read again, forensically, and the batch rebuilt
 * where a column was read wrong. Its own request, because it and the product review are each a
 * long model call and together they outlast what a deployed request is allowed — which is how
 * the check used to die mid-way and take the page down with it.
 */
export async function auditBatchAction(batchId: string): Promise<ActionResult<{ summary: string; questions: string[] }>> {
  const user = await requireUser();
  try {
    const { auditReading } = await import("@/lib/catalog/batch-agent");
    const audit = await auditReading(batchId, user.id);
    if (!audit) return { ok: false, error: (await import("@/lib/catalog/extract/ai")).aiAvailable() ? "The check ran but its answer came back unreadable, so nothing was changed. Press it again." : "No API key is set, so the build cannot be checked. Add ANTHROPIC_API_KEY in the Vercel project's Environment Variables and redeploy." };
    revalidatePath(`/batches/${batchId}`);
    const verdict = audit.verdict === "right" ? "read right" : audit.verdict === "wrong" ? "read wrong" : "not sure";
    const remapped = audit.remapped.length ? `, ${audit.remapped.length} column${audit.remapped.length === 1 ? "" : "s"} re-read${audit.rebuilt ? " and rebuilt" : ""}` : "";
    return { ok: true, data: { summary: `Files: ${verdict}${remapped}.`, questions: audit.questions } };
  } catch (err) {
    return { ok: false, error: `The files could not be re-read: ${said(err)}` };
  }
}

export async function reviewBatchAction(batchId: string, options: { audited?: boolean } = {}): Promise<ActionResult<{ summary: string; changed: number; questions: string[] }>> {
  const user = await requireUser();
  try {
    const { reviewBatch } = await import("@/lib/catalog/batch-agent");
    const review = await reviewBatch(batchId, user.id, undefined, { audit: !options.audited });
    if (!review) return { ok: false, error: (await import("@/lib/catalog/extract/ai")).aiAvailable() ? "The check ran but its answer came back unreadable, so nothing was changed. Press it again." : "No API key is set, so the build cannot be checked. Add ANTHROPIC_API_KEY in the Vercel project's Environment Variables and redeploy." };
    revalidatePath(`/batches/${batchId}`);
    revalidatePath(`/batches/${batchId}/review`);
    // After the check's fixes, what has earned it goes to the store on its own, when the shop has said to.
    const { autoPilot } = await import("@/lib/catalog/autopilot");
    const went = await autoPilot(batchId, user.id).catch(() => null);
    const reading = `${review.audit ? `Files: ${review.audit.verdict === "right" ? "read right" : review.audit.verdict === "wrong" ? "read wrong" : "not sure"}${review.audit.remapped.length ? `, ${review.audit.remapped.length} column${review.audit.remapped.length === 1 ? "" : "s"} re-read${review.audit.rebuilt ? " and rebuilt" : ""}` : ""}. ` : ""}${went && went.pushed > 0 ? `${went.said} ` : ""}`;
    return { ok: true, data: { summary: `${reading}${review.summary}`, changed: review.applied.length, questions: [...(review.audit?.questions ?? []), ...review.questions] } };
  } catch (err) {
    return { ok: false, error: `The build could not be checked: ${said(err)}` };
  }
}

export async function buildProductsAction(batchId: string): Promise<ActionResult<{ products: number; drifted?: string[]; tookMs?: number; phases?: string[] }>> {
  const user = await requireUser();
  try {
    const files = await prisma.sourceFile.findMany({ where: { batchId }, select: { extractionStatus: true, detectedKind: true, kind: true, filename: true } });
    const read = files.filter((f) => f.extractionStatus === "DONE");
    if (read.length === 0) return { ok: false, error: files.some((f) => f.extractionStatus === "PENDING") ? "The files are still being read — give it a moment and try again." : "No file in this batch could be read. Upload the order form or invoice." };
    const orders = read.filter((f) => !["SPEC_SHEET", "PRODUCT_PHOTO", "SHOP_EXPORT"].includes(f.detectedKind ?? f.kind));
    if (orders.length === 0) {
      return { ok: false, error: `This batch only has reference sheets — ${read.map((f) => f.filename).join(", ")} — which say what things are, not what is arriving. Upload the order form or invoice as well (leave "These files are" on "Work it out").` };
    }
    const result = await autoApplyMappings(batchId, user.id);
    if (result.products === 0) {
      if (result.drifted.length > 0) return { ok: false, error: result.drifted.join(" ") };
      return { ok: false, error: result.unmapped.length > 0 ? `The columns of ${result.unmapped.join(", ")} could not be read on their own. Open Column mapping and say which column is the product's name.` : "Nothing on the order has a quantity or a price against it, so there was nothing to build." };
    }
    revalidatePath(`/batches/${batchId}`);
    // What has earned it goes to the store on its own, when the shop has said to. See autopilot.ts.
    const { autoPilot } = await import("@/lib/catalog/autopilot");
    await autoPilot(batchId, user.id).catch(() => null);
    const { lastBuild } = await import("@/lib/catalog/pipeline");
    const timing = lastBuild();
    return { ok: true, data: { products: result.products, drifted: result.drifted, ...(timing ? { tookMs: timing.tookMs, phases: timing.phases } : {}) } };
  } catch (err) {
    return { ok: false, error: `The products could not be built: ${said(err)}` };
  }
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

/** What a person changed on a product that the next build should do on its own. */
async function rememberCorrections(
  before: { productType: string; vendor: string; option1Name: string | null; option2Name: string | null; option3Name: string | null },
  after: { productType: string; vendor: string; option1Name: string | null; option2Name: string | null; option3Name: string | null },
): Promise<void> {
  const { noteCorrection } = await import("@/lib/catalog/corrections");
  const { getCorrections, saveCorrections } = await import("@/lib/catalog/shop-profile");
  let list = await getCorrections();
  const start = list;
  if (before.productType && after.productType && before.productType !== after.productType) {
    list = noteCorrection(list, { kind: "product-type", scope: "", from: before.productType, to: after.productType, brand: after.vendor });
  }
  const names = (p: typeof before) => [p.option1Name, p.option2Name, p.option3Name];
  names(before).forEach((was, i) => {
    const now = names(after)[i];
    if (was && now && was !== now) list = noteCorrection(list, { kind: "option-name", scope: after.productType, from: was, to: now, brand: after.vendor });
  });
  if (list !== start) await saveCorrections(list);
}

export async function updateProductAction(productId: string, patch: z.infer<typeof productPatch>): Promise<ActionResult> {
  await requireUser();
  try {
    const data = productPatch.parse(patch);
    const { metafields, ...rest } = data;
    const before = await prisma.product.findUnique({ where: { id: productId }, select: { productType: true, vendor: true, option1Name: true, option2Name: true, option3Name: true } });
    const product = await prisma.product.update({ where: { id: productId }, data: { ...rest, ...(metafields ? { metafields: JSON.stringify(metafields) } : {}), ...(rest.status ? { published: rest.status === "active" } : {}) } });
    // Recorded so a file added later does not rebuild the batch over this. See untouchedSinceBuilt.
    await logAudit("product.edited", { batchId: product.batchId, details: { productId, fields: Object.keys(data) } });
    // Fixed once is fixed: a renamed option or a changed Type is the shop's rule from now on. See corrections.ts.
    if (before) await rememberCorrections(before, product).catch((err) => console.warn("[corrections]", err instanceof Error ? err.message : err));
    // A tag a person types is the shop's own word: approved as written, so the build keeps it from now on.
    if (typeof rest.tags === "string") {
      const { approveTypedTags, loadTagGate } = await import("@/lib/catalog/tag-gate");
      await approveTypedTags(rest.tags.split(",").map((t) => t.trim()).filter(Boolean), await loadTagGate(), product.title);
    }
    if (rest.category !== undefined || rest.vendor !== undefined) {
      const variants = await prisma.variant.findMany({ where: { productId }, select: { id: true } });
      for (const v of variants) await repriceVariant(v.id);
    }
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/**
 * A person looked at a field the system was unsure of and said it is right. That is the end of
 * the question: the field scores as if they had typed it, and the product stops asking for eyes.
 */
export async function confirmProductFieldAction(productId: string, field: "title" | "tags" | "image" | "price"): Promise<ActionResult> {
  const user = await requireUser();
  return safely(async () => {
    const product = await prisma.product.findUnique({ where: { id: productId }, select: { batchId: true } });
    if (!product) return { ok: false, error: "That product is gone." };
    await logAudit("product.checked", { batchId: product.batchId, userId: user.id, details: { productId, fields: [field] } });
    return { ok: true };
  });
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
  freightPerUnitHome: z.coerce.number().min(0).optional(),
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
    const variant = await prisma.variant.update({ where: { id: variantId }, data: { ...rest, ...(locationQuantities ? { locationQuantities: JSON.stringify(locationQuantities), quantity: Object.values(locationQuantities).reduce((a, b) => a + b, 0) } : {}) }, include: { product: { select: { batchId: true } } } });
    await logAudit("variant.edited", { batchId: variant.product.batchId, details: { variantId, fields: Object.keys(data) } });
    await repriceVariant(variantId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteVariantAction(variantId: string): Promise<ActionResult> {
  return safely(async () => {
    await requireUser();
    const v = await prisma.variant.findUnique({ where: { id: variantId } });
    if (!v) return { ok: false, error: "Variant not found" };
    await prisma.variant.delete({ where: { id: variantId } });
    const owner = await prisma.product.findUnique({ where: { id: v.productId }, select: { batchId: true } });
    if (owner) await logAudit("variant.deleted", { batchId: owner.batchId, details: { variantId } });
    const remaining = await prisma.variant.count({ where: { productId: v.productId } });
    if (remaining === 0) await prisma.product.delete({ where: { id: v.productId } });
    return { ok: true };
  });
}

export async function deleteProductAction(productId: string): Promise<ActionResult> {
  return safely(async () => {
    await requireUser();
    await prisma.product.delete({ where: { id: productId } });
    return { ok: true };
  });
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
  return safely(async () => {
    await requireUser();
    const v = await prisma.variant.findUnique({ where: { id: variantId } });
    if (!v) return { ok: false, error: "Variant not found" };
    const set = new Set(parseJson<string[]>(v.warningsDismissed, []));
    if (dismiss) set.add(code);
    else set.delete(code);
    await prisma.variant.update({ where: { id: variantId }, data: { warningsDismissed: JSON.stringify(Array.from(set)) } });
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

export async function addImageUrlAction(productId: string, url: string, variantId: string | null): Promise<ActionResult<{ validated: boolean; reason?: string }>> {
  return safely(async () => {
    await requireUser();
    const check = await checkImageUrl(url.trim());
    if (!check.ok && check.reason === "Not a public HTTPS URL") return { ok: false, error: "Image URLs must be public https:// links." };
    const count = await prisma.productImage.count({ where: { productId } });
    await prisma.productImage.create({ data: { productId, variantId, url: url.trim(), position: count + 1, source: "MANUAL", validated: check.ok } });
    return { ok: true, data: { validated: check.ok, reason: check.reason } };
  });
}

export async function removeImageAction(imageId: string): Promise<ActionResult> {
  return safely(async () => {
    await requireUser();
    const img = await prisma.productImage.findUnique({ where: { id: imageId } });
    if (!img) return { ok: false, error: "Image not found" };
    await prisma.productImage.delete({ where: { id: imageId } });
    const rest = await prisma.productImage.findMany({ where: { productId: img.productId }, orderBy: { position: "asc" } });
    await prisma.$transaction(rest.map((r, i) => prisma.productImage.update({ where: { id: r.id }, data: { position: i + 1 } })));
    return { ok: true };
  });
}

export async function setImageVariantAction(imageId: string, variantId: string | null): Promise<ActionResult> {
  await requireUser();
  await prisma.productImage.update({ where: { id: imageId }, data: { variantId } });
  return { ok: true };
}

export async function moveImageAction(imageId: string, direction: -1 | 1): Promise<ActionResult> {
  return safely(async () => {
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
  });
}

export async function saveImagesToLibraryAction(productId: string): Promise<ActionResult> {
  return safely(async () => {
    await requireUser();
    const product = await prisma.product.findUnique({ where: { id: productId }, include: { images: true, variants: { include: { lineItem: true } } } });
    if (!product) return { ok: false, error: "Product not found" };
    const modelCode = product.variants.map((v) => parseJson<{ modelCode?: string } | null>(v.lineItem?.normalized, null)?.modelCode).find(Boolean);
    if (!modelCode) return { ok: false, error: "This product has no model code, so it cannot be keyed in the image library." };
    await recordLibraryImages(product.vendor, modelCode, "", product.images.map((i) => i.url), "MANUAL");
    return { ok: true, message: "Saved to image library" };
  });
}

export async function verifyImagesAction(batchId: string): Promise<ActionResult<{ checked: number; failed: number }>> {
  return safely(async () => {
    await requireUser();
    await prisma.productImage.updateMany({ where: { product: { batchId } }, data: { validated: false } });
    return { ok: true, data: await verifyBatchImages(batchId) };
  });
}

// ---------------------------------------------------------------------------
// Export / Shopify
// ---------------------------------------------------------------------------

export async function exportBatchAction(batchId: string): Promise<ExportResult> {
  const user = await requireUser();
  try {
    // Checked against what the shop sells right before the file is made, not only whenever
    // somebody pressed the button: a product that fits two listings is refused by name below.
    if (await catalogueKnown()) {
      await refreshCatalogueIfStale(user.id).catch(() => undefined);
      await reconcileBatch(batchId);
    }
    const result = await exportBatch(batchId, user.id);
    revalidatePath(`/batches/${batchId}`);
    return result;
  } catch (err) {
    // Said in the panel, with the message whole — thrown, it reached the browser as a digest.
    unstable_rethrow(err);
    console.error("[action] export", err);
    return { ok: false, errors: [said(err)], warnings: [], files: [], repairs: [] };
  }
}

export async function reconcileAction(batchId: string): Promise<ActionResult<ReconcileCounts>> {
  const user = await requireUser();
  try {
    await refreshCatalogueIfStale(user.id);
    const data = await reconcileBatch(batchId);
    await logAudit("batch.reconciled", { batchId, userId: user.id, details: data });
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function backupNowAction(): Promise<ActionResult> {
  const user = await requireUser("ADMIN");
  try {
    const b = await backupNow("manual");
    await logAudit("backup.made", { userId: user.id, details: { name: b.name, bytes: b.bytes } });
    revalidatePath("/settings");
    return { ok: true, message: `Backed up to ${b.name} (${(b.bytes / 1024 / 1024).toFixed(1)} MB).` };
  } catch (err) {
    return fail(err);
  }
}

export async function restoreBackupAction(name: string): Promise<ActionResult> {
  const user = await requireUser("ADMIN");
  try {
    const { safety } = await restoreBackup(name);
    await logAudit("backup.restored", { userId: user.id, details: { name, safety: safety.name } });
    revalidatePath("", "layout");
    return { ok: true, message: `Restored from ${name}. What was there is kept as ${safety.name}. Restart Flöda now so every page reads the restored data.` };
  } catch (err) {
    return fail(err);
  }
}

export async function decideMatchAction(productId: string, choice: "new" | string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await decideMatch(productId, choice);
    await logAudit("product.match_decided", { userId: user.id, details: { productId, choice } });
    return { ok: true };
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
    return { ok: false, errors: [said(err)], created: 0, updated: 0 };
  }
}

/** The one press on the quick look: everything that has earned it goes to the store as drafts. */
export async function pushReadyAction(batchId: string): Promise<ActionResult<{ pushed: number; waiting: number; errors: string[] }>> {
  const user = await requireUser();
  return safely(async () => {
    const { readyToPush, canGoAlone } = await import("@/lib/catalog/autopilot");
    const review = await loadReview(batchId);
    const ready = readyToPush(review.products);
    const waiting = review.products.filter((p) => !canGoAlone(p)).length;
    if (ready.length === 0) return { ok: false, error: waiting > 0 ? "Nothing is ready yet: settle the cards first." : "Everything is already in the store." };
    const r = await pushBatch(batchId, user.id, { confirm: true, overrideWarnings: true, productIds: ready.map((p) => p.id) });
    revalidatePath(`/batches/${batchId}`);
    return { ok: true, data: { pushed: r.created + r.updated, waiting, errors: r.errors } };
  });
}

/** Whether what has earned it goes to the store on its own after a build. */
export async function setAutoPushAction(on: boolean): Promise<ActionResult> {
  const user = await requireUser("ADMIN");
  return safely(async () => {
    const { saveShopProfile } = await import("@/lib/catalog/shop-profile");
    await saveShopProfile({ autoPush: Boolean(on) });
    await logAudit(on ? "store.autopush_on" : "store.autopush_off", { userId: user.id });
    revalidatePath("/training");
    return { ok: true };
  });
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
  return safely(async () => {
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
  });
}

export async function deletePricingRuleAction(id: string): Promise<ActionResult> {
  return safely(async () => {
    await requireUser("ADMIN");
    await prisma.pricingRule.delete({ where: { id } });
    await prisma.variant.updateMany({ where: { pricingRuleId: id }, data: { pricingRuleId: null } });
    revalidatePath("/pricing");
    return { ok: true };
  });
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
      seoTitlePattern: z.string().max(200).optional(),
      houseRules: z.string().max(8000).optional(),
      shareLayouts: z.boolean().optional(),
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

// ---------------------------------------------------------------------------
// Tag rules
// ---------------------------------------------------------------------------

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

/** Keep the store connection, proved by asking the store its name. An empty token keeps the one already kept. */
export async function saveStoreAction(input: { domain: string; token: string }): Promise<ActionResult<{ name: string }>> {
  const user = await requireUser("ADMIN");
  return safely(async () => {
    const { getSettings, saveSettings } = await import("@/lib/catalog/settings");
    const current = await getSettings();
    const domain = String(input.domain ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return { ok: false, error: "That does not look like a store domain. It reads like your-shop.myshopify.com." };
    const token = String(input.token ?? "").trim() || current.shopify.accessToken;
    if (!token) return { ok: false, error: "The Admin API access token is needed to read the store." };
    const before = { ...current.shopify };
    await saveSettings({ shopify: { ...current.shopify, storeDomain: domain, accessToken: token, connectedBy: "token", refreshToken: "", expiresAt: 0, refreshExpiresAt: 0 } });
    try {
      const { testStore } = await import("@/lib/catalog/store-sync");
      const shop = await testStore();
      await logAudit("store.connected", { userId: user.id, details: { domain, shop: shop.name } });
      revalidatePath("/training");
      return { ok: true, data: { name: shop.name } };
    } catch (err) {
      await saveSettings({ shopify: before });
      return { ok: false, error: `The store did not answer: ${err instanceof Error ? err.message : String(err)}` };
    }
  });
}

/** Read the store now: its listings, vocabulary, templates and the catalogue the batch check matches against. */
export async function syncStoreAction(): Promise<ActionResult<import("@/lib/catalog/store-sync").StoreSync>> {
  const user = await requireUser("ADMIN");
  return safely(async () => {
    const { syncStore } = await import("@/lib/catalog/store-sync");
    const data = await syncStore(user.id);
    revalidatePath("", "layout");
    return { ok: true, data };
  });
}

export async function forgetStoreAction(): Promise<ActionResult> {
  const user = await requireUser("ADMIN");
  return safely(async () => {
    const { forgetStore } = await import("@/lib/catalog/store-sync");
    await forgetStore();
    await logAudit("store.forgotten", { userId: user.id });
    revalidatePath("", "layout");
    return { ok: true };
  });
}

/**
 * Find the pages for a batch's new products (or the ones named) without anyone pasting them: the
 * brand's usual address shape first, then a search, each fetched and checked. See page-finder.ts.
 */
export async function findProductPagesAction(batchId: string, opts: { productIds?: string[] } = {}): Promise<ActionResult<import("@/lib/catalog/page-finder").FindOutcome>> {
  const user = await requireUser();
  try {
    const { findProductPages, FIND_BUDGET_MS } = await import("@/lib/catalog/page-finder");
    const data = await findProductPages(batchId, { ...opts, userId: user.id, budgetMs: FIND_BUDGET_MS });
    revalidatePath(`/batches/${batchId}/review`);
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/**
 * The link beside a product: saved, or cleared when it is empty. Nothing is fetched yet.
 * See page-link.ts.
 */
export async function setProductLinkAction(productId: string, url: string): Promise<ActionResult<{ url: string; shared: string[] }>> {
  await requireUser();
  try {
    const { setProductLink } = await import("@/lib/catalog/page-link");
    const data = await setProductLink(productId, url);
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/** One colour's own page beside a product: saved, or cleared when empty. Read with the product's. */
export async function setColourLinkAction(productId: string, colour: string, url: string): Promise<ActionResult<{ url: string }>> {
  await requireUser();
  try {
    const { setColourLink } = await import("@/lib/catalog/page-link");
    return { ok: true, data: await setColourLink(productId, colour, url) };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Read a product page that is not attached to any stored product — the Bulk page's, where the
 * products are only a preview until the file is built. One page per call. A page that cannot be
 * read comes back as an error with the reason, never as an empty success.
 */
export async function readPageAction(input: { url: string; title: string; brand?: string; colours?: string[] }): Promise<ActionResult<import("@/lib/catalog/page-types").PageDetails>> {
  await requireUser();
  try {
    const { cleanProductUrl } = await import("@/lib/catalog/page-types");
    const cleaned = cleanProductUrl(input.url);
    if ("error" in cleaned) return { ok: false, error: cleaned.error || "No link." };
    const { readProductPage, PageError } = await import("@/lib/catalog/extract/page");
    try {
      const colours = (input.colours ?? []).slice(0, 6);
      const data = await readProductPage(cleaned.url, { title: input.title, brand: input.brand, colours });
      // The pictures looked at for the colour ordered, then each set on its square and kept here.
      const { picturesForColour } = await import("@/lib/catalog/picture-colour");
      return { ok: true, data: await picturesForColour(data, input.title, colours) };
    } catch (err) {
      if (err instanceof PageError) return { ok: false, error: err.message };
      throw err;
    }
  } catch (err) {
    return fail(err);
  }
}

/**
 * Read the page a product was linked to: its description, its details and its pictures go onto the
 * product. One product per call, so each fits in the page's time limit however many are linked.
 */
export async function readProductLinkAction(productId: string): Promise<ActionResult<import("@/lib/catalog/page-link").PageRead>> {
  const user = await requireUser();
  try {
    const { readProductLink } = await import("@/lib/catalog/page-link");
    const data = await readProductLink(productId);
    const product = await prisma.product.findUnique({ where: { id: productId }, select: { batchId: true } });
    await logAudit("product.page_read", { batchId: product?.batchId ?? null, userId: user.id, details: { productId, ok: data.ok, description: data.description, details: data.details, images: data.images } });
    if (product) revalidatePath(`/batches/${product.batchId}/review`);
    return { ok: true, data };
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
/**
 * What the server said when a request failed, by the digest the browser was given.
 *
 * Production hides the message from the browser; instrumentation.ts recorded it. The error page
 * asks here, so the person sees the cause and not a hash.
 */
export async function explainErrorAction(digest: string): Promise<ActionResult<{ message: string; where: string; when: string }>> {
  return safely(async () => {
    await requireUser();
    const clean = digest.trim();
    if (!clean) return { ok: false, error: "No digest." };
    const rows = await prisma.auditLog.findMany({ where: { action: "error", details: { contains: clean } }, orderBy: { createdAt: "desc" }, take: 1 });
    const row = rows[0];
    if (!row) return { ok: false, error: "Nothing recorded for this digest yet." };
    const d = parseJson<{ message?: string; path?: string; routeType?: string; routePath?: string }>(row.details, {});
    return { ok: true, data: { message: d.message ?? "", where: `${d.routeType ?? ""} ${d.path ?? d.routePath ?? ""}`.trim(), when: row.createdAt.toISOString() } };
  });
}

export async function readingCountAction(batchId: string): Promise<number> {
  await requireUser();
  // A poll; a failed one is not worth a thrown error, the next will do.
  return prisma.sourceFile.count({ where: { batchId, extractionStatus: "PENDING" } }).catch(() => 0);
}

/**
 * Read a stored file again.
 *
 * Reading happens after the upload has been answered, and it has the same time limit the upload
 * did — so a large scan can still run out of it. The file is safe either way, so trying again is
 * the whole of the recovery, and nobody has to find the invoice and upload it twice.
 */
export async function retryExtractionAction(fileId: string): Promise<ActionResult<{ reading: true }>> {
  const user = await requireUser();
  try {
    // The read runs after this has answered, as it does after an upload: a photograph is a long
    // model call, and a button whose request carried it was answered by the host with an error
    // page when the function died, which the browser could only call "an unexpected response".
    // Answered at once, the page polls the file like any other read and builds when it is done.
    const file = await prisma.sourceFile.update({ where: { id: fileId }, data: { extractionStatus: "PENDING", extractionError: null, readStartedAt: new Date() }, select: { batchId: true } });
    after(async () => {
      try {
        const result = await extractStoredFile(fileId);
        await logAudit("file.reread", { batchId: file.batchId, userId: user.id, details: { fileId, rows: result.rows } });
      } catch (err) {
        await prisma.sourceFile.update({ where: { id: fileId }, data: { extractionStatus: "FAILED", extractionError: said(err) } }).catch(() => undefined);
      }
    });
    revalidatePath(`/batches/${file.batchId}`);
    return { ok: true, data: { reading: true } };
  } catch (err) {
    await prisma.sourceFile.update({ where: { id: fileId }, data: { extractionStatus: "FAILED", extractionError: said(err) } }).catch(() => undefined);
    return fail(err);
  }
}

/** Connect the store with a pasted Admin API token, where this copy has no Shopify app for the install link. */
export async function saveShopifyTokenAction(input: { domain: string; token: string }): Promise<ActionResult> {
  const user = await requireUser("ADMIN");
  return safely(async () => {
    const { shopDomain } = await import("@/lib/catalog/shopify-oauth");
    const domain = shopDomain(String(input.domain ?? ""));
    if (!domain) return { ok: false, error: "That is not a store address. It reads like your-shop.myshopify.com." };
    const token = String(input.token ?? "").trim();
    if (!token) return { ok: false, error: "Paste the Admin API access token." };
    const current = await getSettings();
    const before = current.shopify;
    await saveSettings({ shopify: { storeDomain: domain, accessToken: token, apiVersion: before.apiVersion, connectedBy: "token" } });
    try {
      const { graphql, shopifyConfig } = await import("@/lib/catalog/shopify");
      const shop = await graphql<{ shop: { name: string } }>(await shopifyConfig(), "{ shop { name } }");
      await logAudit("store.connected", { userId: user.id, details: { domain, by: "pasted token", shop: shop.shop.name } });
      revalidatePath("/settings");
      return { ok: true, message: `Connected to ${shop.shop.name}.` };
    } catch (err) {
      await saveSettings({ shopify: before });
      return { ok: false, error: `The store did not answer with that token: ${err instanceof Error ? err.message : String(err)}` };
    }
  });
}

/** Forget the store's token. Its products and what Flöda learned from them stay. */
export async function disconnectShopifyAction(): Promise<ActionResult> {
  const user = await requireUser("ADMIN");
  return safely(async () => {
    const current = await getSettings();
    await saveSettings({ shopify: { storeDomain: "", accessToken: "", apiVersion: current.shopify.apiVersion, connectedBy: undefined, refreshToken: "", expiresAt: 0, refreshExpiresAt: 0, scope: "" } });
    await logAudit("store.disconnected", { userId: user.id, details: { domain: current.shopify.storeDomain } });
    revalidatePath("/settings");
    return { ok: true };
  });
}

/**
 * A document that did not add up, checked by the person: its lines are right as read. The note
 * comes off the file, so the batch stops asking, and the audit trail keeps who settled it.
 */
export async function settleTotalsAction(fileId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const { settledTotals, offTotals } = await import("@/lib/catalog/totals");
    const file = await prisma.sourceFile.findUniqueOrThrow({ where: { id: fileId }, select: { batchId: true, extractionError: true } });
    await prisma.sourceFile.update({ where: { id: fileId }, data: { extractionError: settledTotals(file.extractionError) } });
    await logAudit("file.totals_settled", { batchId: file.batchId, userId: user.id, details: { fileId, said: offTotals(file.extractionError) } });
    revalidatePath(`/batches/${file.batchId}/review`);
    return { ok: true };
  } catch (err) {
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
// Price and clearance changes to products already in the shop
// ---------------------------------------------------------------------------

/**
 * Read an instruction against what the uploaded file holds.
 *
 * The file itself never leaves the browser until the moment it is applied — only the vendors,
 * types and tags in it are sent, which is all the instruction needs to be grounded in.
 */
export async function planAdjustmentAction(
  instruction: string,
  file: { products: number; vendors: string[]; types: string[]; tags: string[]; recent?: { what: string; handles: string[] } | null },
): Promise<ActionResult<{ plan: Plan; understood: string; unclear: string; blocked: string[]; described: string[] }>> {
  await requireUser();
  if (!planningAvailable()) return { ok: false, error: "Set ANTHROPIC_API_KEY to read instructions. Until then this page cannot work out what to change." };
  try {
    const result = await planAdjustment(instruction, file);
    if (!result) return { ok: false, error: "Could not make sense of that instruction. Try naming the brand or tag and the change." };
    return { ok: true, data: { ...result, described: describePlan(result.plan) } };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Read a whole sheet of instructions against the loaded files, in one go.
 *
 * Two things make a sheet slow to work through a row at a time, and both are fixed here rather
 * than in the browser. Next dispatches server actions one at a time per client, so forty rows
 * planned from the browser is forty round trips end to end however quick each one is — they are
 * read several at a time inside this single action instead.
 *
 * And most of a season's sheet is about products that are not in the export you happen to have
 * open. The sheet and the files are matched against each other first, in one call, so the rows
 * that cannot touch anything loaded are set aside with their reason rather than walked through.
 * Loading the missing export brings them straight back.
 */
export async function readSheetAgainstFilesAction(
  instructions: string[],
  file: { products: number; vendors: string[]; types: string[]; tags: string[] },
): Promise<ActionResult<{
  rows: Array<{
    instruction: string;
    group: string;
    relevant: boolean;
    why: string;
    plan: Plan | null;
    understood: string;
    unclear: string;
    blocked: string[];
    described: string[];
    failed: string;
  }>;
}>> {
  return safely(async () => {
    await requireUser();
    if (!planningAvailable()) return { ok: false, error: "Set ANTHROPIC_API_KEY to read instructions. Until then this page cannot work out what to change." };
    try {
      const screened = await screenInstructions(instructions, file);
      const wanted = screened.filter((r) => r.relevant);
      const planned = await planAdjustments(wanted.map((r) => r.instruction), file);

      const byInstruction = new Map<string, (typeof planned)[number]>();
      wanted.forEach((r, i) => byInstruction.set(`${r.index}`, planned[i]));

      return {
        ok: true,
        data: {
          rows: screened.map((r) => {
            const got = byInstruction.get(`${r.index}`);
            const p = got?.planned ?? null;
            return {
              instruction: r.instruction,
              // The screen names the group; where it could not, the grounded plan usually can.
              group: r.group || p?.category || "",
              relevant: r.relevant,
              why: r.why,
              plan: p?.plan ?? null,
              understood: p?.understood ?? "",
              unclear: p?.unclear ?? "",
              blocked: p?.blocked ?? [],
              described: p ? describePlan(p.plan) : [],
              failed: got?.failed ?? "",
            };
          }),
        },
      };
    } catch (err) {
      return fail(err);
    }
  });
}

/**
 * What a spreadsheet dropped on Prices and stock is, read off its columns with no model: a Shopify
 * export, the shop's sale sheet, or anything else (an order form, an invoice). The buyer's sheet used
 * to be taken for an order form when it was dropped beside the export or in the invoice boxes, so
 * no sale was ever applied (2026-10-26). PDFs and pictures are "other": they cannot be told apart
 * without reading them.
 */
export async function classifyDocumentAction(file: { name: string; type: string; base64: string }): Promise<ActionResult<{ kind: "sale-sheet" | "export" | "other" }>> {
  return safely(async () => {
    await requireUser();
    const isWorkbook = /\.xlsx?$/i.test(file.name) || /spreadsheet|excel/i.test(file.type);
    const isCsv = /\.csv$/i.test(file.name) || file.type === "text/csv";
    if (!isWorkbook && !isCsv) return { ok: true, data: { kind: "other" as const } };
    const buffer = Buffer.from(file.base64, "base64");
    const grids = isWorkbook
      ? await (await import("@/lib/catalog/extract/tabular")).sheetGrids(buffer)
      : [{ name: file.name, grid: (await import("@/lib/catalog/csv")).parseCsv(buffer.toString("utf8")) }];
    const { readSaleSheet, looksLikeProductExport } = await import("@/lib/catalog/sale-sheet");
    if (grids.some((g) => looksLikeProductExport((g.grid[0] ?? []).map(String)))) return { ok: true, data: { kind: "export" as const } };
    return { ok: true, data: { kind: readSaleSheet(grids) ? ("sale-sheet" as const) : ("other" as const) } };
  });
}

/**
 * Read a sheet of instructions and break it into the separate changes it asks for.
 *
 * The buyer's list for a season is a document, not a sentence: many rules about many products.
 * Read as one instruction it would produce one scope and one change, which is wrong for all of
 * them, so it is split and each piece goes through the same reading, preview and apply as
 * something typed by hand.
 *
 * The file comes as base64 because a sheet of instructions is kilobytes — unlike the catalogue
 * exports on this page, which never leave the browser.
 */
export async function readInstructionSheetAction(file: { name: string; type: string; base64: string }): Promise<ActionResult<SplitInstructions & { source: string }>> {
  return safely(async () => {
    await requireUser();

    const buffer = Buffer.from(file.base64, "base64");
    // See MAX_UPLOAD: past this the request never arrives, whatever next.config permits.
    if (buffer.byteLength > MAX_UPLOAD) {
      return { ok: false, error: `That file is ${readableSize(buffer.byteLength)}, and an upload has to stay under ${readableSize(MAX_UPLOAD)}. Instruction sheets are normally a page or two — a photo is shrunk before it is sent, so this is either a very large PDF or a picture this browser could not open.` };
    }

    const isPdf = /pdf$/i.test(file.name) || file.type === "application/pdf";
    const isImage = /^image\//.test(file.type);
    const isWorkbook = /\.xlsx?$/i.test(file.name) || /spreadsheet|excel/i.test(file.type);
    const isCsv = /\.csv$/i.test(file.name) || file.type === "text/csv";
    let source = isPdf ? "read as a PDF" : isImage ? "read as a picture" : "plain text";

    // A spreadsheet is read here rather than sent away to be interpreted. The template's columns are
    // fixed, so what every cell means is settled before the file is opened — which is faster, costs
    // nothing, and cannot read the same file two different ways on two different days. A workbook
    // that is NOT the template still goes to the model, with its rows laid out as a table.
    if (isWorkbook || isCsv) {
      try {
        const grids = isWorkbook
          ? await (await import("@/lib/catalog/extract/tabular")).sheetGrids(buffer)
          : [{ name: file.name, grid: (await import("@/lib/catalog/csv")).parseCsv(buffer.toString("utf8")) }];
        const { readSaleSheet, looksLikeProductExport } = await import("@/lib/catalog/sale-sheet");

        if (grids.some((g) => looksLikeProductExport((g.grid[0] ?? []).map(String)))) {
          return { ok: false, error: `${file.name} is a Shopify product export, not a sheet of instructions. Add it under "The files from Shopify" above instead.` };
        }

        const read = readSaleSheet(grids);
        if (read) {
          if (read.instructions.length === 0) {
            return { ok: false, error: `${file.name} was read from the "${read.sheet}" tab and none of its rows turned into a change.${read.ignored.length ? ` ${read.ignored.length} were left alone — the commonest reason is a row with no year tag.` : ""}` };
          }
          return { ok: true, data: { instructions: read.instructions, ignored: read.ignored, unclear: read.unclear, source: `the "${read.sheet}" tab, read column by column` } };
        }

        // Not the template. Lay the rows out as a table for the model rather than as loose text —
        // the columns are the whole meaning, and a flattened sheet loses them.
        const lines = grids.flatMap(({ name, grid }) => [
          `--- sheet: ${name} ---`,
          ...grid.map((row) => row.map((c) => (c ?? "").toString().trim()).join(" | ")).filter((l) => l.replace(/[|\s]/g, "")),
        ]);
        if (!planningAvailable()) return { ok: false, error: `${file.name} is not the shop's sale template, so it has to be read by the API — set ANTHROPIC_API_KEY, or use the template.` };
        const split = await splitInstructions(lines.join("\n"));
        if (!split || split.instructions.length === 0) {
          return { ok: false, error: `${file.name} was read and nothing in it reads as a change to make. If it is the shop's template, check the headings on the first row.` };
        }
        return { ok: true, data: { ...split, source: `${grids.length} sheet${grids.length === 1 ? "" : "s"}, read as a table` } };
      } catch (err) {
        return { ok: false, error: `Could not open ${file.name}: ${said(err)}` };
      }
    }

    if (!planningAvailable()) return { ok: false, error: "Set ANTHROPIC_API_KEY to read an instruction sheet." };

    // Each stage says which one it was. "It could not be read" covers reading the file, understanding
    // it, and finding anything in it, and as one message it sends people looking in the wrong place.
    try {
      if (isPdf) {
        // Counted for the operator's benefit only; the PDF itself is what gets read, because these
        // sheets are tables and a text layer does not survive being one.
        try {
          const { extractPdfText } = await import("@/lib/catalog/extract/pdf");
          const pdf = await extractPdfText(buffer);
          source = `${pdf.pages} page${pdf.pages === 1 ? "" : "s"}`;
        } catch {
          // A PDF whose text layer cannot be parsed still reads perfectly well as a document.
        }
      }
      const split = isPdf
        ? await splitInstructions({ pdf: buffer })
        : isImage
          ? await splitInstructions({ image: buffer, mediaType: file.type })
          : await splitInstructions(buffer.toString("utf8"));

      if (!split) return { ok: false, error: `${file.name} was read, but the reply did not come back in a shape that could be used. Try it again; if it keeps happening the sheet may be longer than one pass can handle.` };
      if (split.instructions.length === 0) {
        return { ok: false, error: `${file.name} was read and nothing in it reads as a change to make.${split.unclear ? ` It said: ${split.unclear}` : ""}${split.ignored.length ? ` It treated these as not-a-change: ${split.ignored.slice(0, 5).join("; ")}` : ""}` };
      }
      return { ok: true, data: { ...split, source } };
    } catch (err) {
      const message = said(err);
      if (/timed? ?out|aborted|FUNCTION_INVOCATION_TIMEOUT/i.test(message)) {
        return { ok: false, error: `Reading ${file.name} took longer than the page allows. A sheet of a few pages should fit — if this one is much longer, split it and add it in parts.` };
      }
      return { ok: false, error: `Could not read ${file.name}: ${message}` };
    }
  });
}

/**
 * Read a supplier's invoice into lines that can be matched against the shop.
 *
 * A workbook or a CSV is read by its columns, here, for nothing: an invoice's headings say what it
 * holds, and reading them is instant, works with no API key, and gives the same answer twice. A PDF
 * or a photograph of an invoice has no columns to read, so that goes to the model — which is most
 * of why this accepts a picture at all: an invoice photographed on a phone in the stockroom is a
 * real way one arrives.
 */
/**
 * A photo or scan of a supplier's paperwork, scribbled on, read into a table. See extract/transcribe.
 *
 * Several files are the pages of one document, read together. The pen's meaning, where the person
 * says it, goes to the reader as a hint.
 */
export async function transcribeDocumentAction(input: { files: Array<{ name: string; type: string; base64: string }>; hint: string }): Promise<ActionResult<import("@/lib/catalog/extract/transcribe").Transcript>> {
  return safely(async () => {
    await requireUser();
    const { isHeic, heicToJpeg } = await import("@/lib/catalog/extract/heic");
    const { transcribeDocument } = await import("@/lib/catalog/extract/transcribe");
    const pages: import("@/lib/catalog/extract/transcribe").Page[] = [];
    for (const file of input.files) {
      let buffer: Buffer = Buffer.from(file.base64, "base64");
      if (buffer.byteLength > MAX_UPLOAD) {
        return { ok: false, error: `${file.name} is ${readableSize(buffer.byteLength)}, and an upload has to stay under ${readableSize(MAX_UPLOAD)}. A photo is shrunk before it is sent, so this is a PDF too big to send — split it.` };
      }
      let type = file.type;
      if (isHeic(buffer, file.name, file.type)) { buffer = await heicToJpeg(buffer); type = "image/jpeg"; }
      const isPdf = /\.pdf$/i.test(file.name) || type === "application/pdf";
      if (isPdf) pages.push({ kind: "pdf", data: buffer });
      else if (/^image\/(jpeg|png|gif|webp)$/.test(type)) pages.push({ kind: "image", mediaType: type as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: buffer });
      else if (/\.(jpe?g)$/i.test(file.name)) pages.push({ kind: "image", mediaType: "image/jpeg", data: buffer });
      else if (/\.png$/i.test(file.name)) pages.push({ kind: "image", mediaType: "image/png", data: buffer });
      else return { ok: false, error: `${file.name} is not a photo or a PDF. This reads a picture or a scan of the paperwork; a spreadsheet goes straight to the bulk page.` };
    }
    if (pages.length === 0) return { ok: false, error: "No file was received." };
    const data = await transcribeDocument(pages, input.hint);
    await logAudit("document.transcribed", { userId: (await requireUser()).id, details: { pages: pages.length, supplier: data.supplier, reference: data.reference, rows: data.rows.length } }).catch(() => undefined);
    return { ok: true, data };
  });
}

/** A file sent from the page: its name, type and contents as base64. */
type SentFile = { name: string; type: string; base64: string };

/** The shop's binding list for ski packages — name, RRP, wholesale — loaded once and kept. See binding-list.ts. */
export async function saveBindingListAction(file: SentFile): Promise<ActionResult<import("@/lib/catalog/trades/snow/binding-list").BindingList>> {
  return safely(async () => {
    const user = await requireUser("ADMIN");
    const buffer = Buffer.from(file.base64, "base64");
    const { parseBindingList } = await import("@/lib/catalog/trades/snow/binding-list");
    const grids = /\.csv$/i.test(file.name)
      ? [{ grid: (await import("@/lib/catalog/csv")).parseCsv(buffer.toString("utf8")) }]
      : await (await import("@/lib/catalog/extract/tabular")).sheetGrids(buffer);
    const entries = grids.map((g) => parseBindingList(g.grid)).find((e) => e.length > 0) ?? [];
    if (entries.length === 0) return { ok: false, error: `${file.name} has no binding list in it: it needs a heading row with the binding's name and its RRP ("Binding Name", "RRP", "Wholesale"), then a binding a row.` };
    const list = { entries, file: file.name, updatedAt: new Date().toISOString() };
    await (await import("@/lib/catalog/trades/snow/binding-store")).saveBindingList(list);
    await logAudit("packages.binding_list", { userId: user.id, details: { file: file.name, bindings: entries.length } }).catch(() => undefined);
    revalidatePath("/settings");
    return { ok: true, data: list };
  });
}

/**
 * The bindings picked for each ski of a batch, saved, and the products built again with them — a
 * package is made at the build, so a pick only shows once the batch is rebuilt.
 */
export async function saveBatchPicksAction(batchId: string, picks: Record<string, string[]>): Promise<ActionResult<{ products: number }>> {
  return safely(async () => {
    const user = await requireUser();
    const clean = Object.fromEntries(Object.entries(picks).filter(([k, v]) => typeof k === "string" && Array.isArray(v)).map(([k, v]) => [k, v.filter((n) => typeof n === "string").slice(0, 12)]));
    await (await import("@/lib/catalog/trades/snow/binding-store")).saveBatchPicks(batchId, clean);
    const rebuilt = await autoApplyMappings(batchId, user.id);
    revalidatePath(`/batches/${batchId}/review`);
    revalidatePath(`/batches/${batchId}`);
    if (!rebuilt.applied) return { ok: false, error: `Saved, but the products could not be built again: ${rebuilt.unmapped.join(", ") || "a file"} still needs its columns mapped.` };
    return { ok: true, data: { products: rebuilt.products } };
  });
}

export async function readInvoiceAction(file: { name: string; type: string; base64: string }): Promise<ActionResult<InvoiceRead & { source: string }>> {
  return safely(async () => {
    await requireUser();

    let buffer: Buffer = Buffer.from(file.base64, "base64");
    // A serverless request body tops out around 4.5MB and this arrives base64 encoded, a third
    // bigger again — so anything past this never reaches here at all. The page shrinks pictures
    // before sending for exactly that reason; this is the backstop, and it says what to do.
    if (buffer.byteLength > MAX_UPLOAD) {
      return { ok: false, error: `That file is ${readableSize(buffer.byteLength)}, and an upload has to stay under ${readableSize(MAX_UPLOAD)}. A photo is shrunk automatically before it is sent, so this is either a very large PDF — split it — or a picture this browser could not open.` };
    }

    // An iPhone HEIC the browser could not decode is decoded here instead — see extract/heic.
    const { isHeic, heicToJpeg } = await import("@/lib/catalog/extract/heic");
    if (isHeic(buffer, file.name, file.type)) {
      buffer = await heicToJpeg(buffer);
      file = { ...file, type: "image/jpeg", name: file.name.replace(/\.hei[cf]$/i, "") + ".jpg" };
    }

    const isPdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";
    const isImage = /^image\//.test(file.type) || /\.(png|jpe?g|webp|gif|heic|heif)$/i.test(file.name);
    const isWorkbook = /\.xlsx?$/i.test(file.name) || /spreadsheet|excel/i.test(file.type);
    const isCsv = /\.csv$/i.test(file.name) || file.type === "text/csv";

    try {
      if (isWorkbook || isCsv) {
        const grids = isWorkbook
          ? await (await import("@/lib/catalog/extract/tabular")).sheetGrids(buffer)
          : [{ name: file.name, grid: (await import("@/lib/catalog/csv")).parseCsv(buffer.toString("utf8")) }];
        const read = readInvoiceGrids(grids);
        if (!read) {
          return { ok: false, error: `Nothing in ${file.name} reads as an order. An invoice needs a column identifying each line — a barcode, an EAN or an item code — and a column of prices or quantities to go with it. A list of barcodes on its own has nothing to change.` };
        }
        return { ok: true, data: { ...read, source: `read column by column from ${read.sheet.includes(",") ? "its tabs" : `the "${read.sheet}" tab`}` } };
      }

      if (!isPdf && !isImage) return { ok: false, error: `${file.name} is not a file this can read. Invoices come as a spreadsheet, a CSV, a PDF or a photograph.` };
      // A PDF order with a size grid under each product is read by where its words sit, with no
      // model — the quantities only mean something under the size they are printed beneath.
      if (isPdf) {
        const grid = await (await import("@/lib/catalog/extract/pdf-grid")).readGridPdf(buffer).catch(() => null);
        if (grid) return { ok: true, data: { lines: grid.lines, sheet: file.name, columns: { barcode: "", sku: "SKU", rrp: "R/R", quantity: "the size grid", title: "the product's name", size: "the size row", colour: "Style" }, warnings: grid.warnings, shape: "grid" as const, sizeGrid: true, source: "read from the size grid under each product" } };
      }
      if (!aiAvailable()) return { ok: false, error: `${file.name} has no columns to read, so it has to go to the API — set ANTHROPIC_API_KEY, or upload the order as a spreadsheet.` };

      const { extractFromPdf, extractFromImage } = await import("@/lib/catalog/extract/ai");
      // The four the API takes; a HEIC was turned into one of them above, so what is left here is a
      // TIFF, a BMP or something stranger, and "unsupported media type" from three layers down says
      // nothing useful.
      const READABLE = ["image/jpeg", "image/png", "image/gif", "image/webp"];
      if (!isPdf && !READABLE.includes(file.type)) {
        return { ok: false, error: `${file.name} is a ${file.type || "picture in a format"} that cannot be read. Open it and save it as a PNG or JPEG, or screenshot it, and add that.` };
      }
      const extracted = isPdf
        ? await extractFromPdf(buffer, "INVOICE")
        : await extractFromImage(buffer, file.type, "INVOICE");

      const lines = extracted.items
        .map((item) => ({
          sku: item.sku ?? "",
          barcode: item.barcode ?? "",
          title: item.title ?? "",
          costPrice: item.costPrice,
          // Same rule as the column reader: a zero is not a price, it is a line with none.
          rrp: item.rrp !== null && item.rrp > 0 ? item.rrp : null,
          quantity: item.quantity,
          size: (item.size || item.length || "").trim(),
          colour: (item.colour || "").trim(),
        }))
        .filter((l) => (l.barcode.trim() || l.sku.trim()) && (l.rrp !== null || l.quantity !== null));

      if (lines.length === 0) {
        return { ok: false, error: `${file.name} was read${extracted.summary ? ` — ${extracted.summary}` : ""}, but no line in it carries both something to match on (a barcode or an item code) and something to change (a price or a quantity).` };
      }
      return {
        ok: true,
        data: {
          lines, sheet: file.name, warnings: [],
          columns: { barcode: "", sku: "", rrp: "", quantity: "", title: "", size: "", colour: "" },
          source: `read as ${isPdf ? "a PDF" : "a picture"}${extracted.supplier ? `, from ${extracted.supplier}` : ""}`,
        },
      };
    } catch (err) {
      const message = said(err);
      if (/timed? ?out|aborted|FUNCTION_INVOCATION_TIMEOUT/i.test(message)) {
        return { ok: false, error: `Reading ${file.name} took longer than the page allows. Upload the order as a spreadsheet if you have one — that is read instantly.` };
      }
      return { ok: false, error: `Could not read ${file.name}: ${message}` };
    }
  });
}

/**
 * Remember the shop's own listings from an export loaded on the Bulk page, so the next season's
 * listing of a model — built from an order in an import batch, days later — carries the shelves
 * the shop gave it. Only the handle, title, vendor, type and tags travel. See shop-memory.
 */
export async function rememberListingsAction(listings: Array<{ handle: string; title: string; vendor: string; productType: string; tags: string[]; price?: number | null; bindingOption?: string; barcodes?: string[] }>): Promise<ActionResult<{ remembered: number }>> {
  await requireUser();
  try {
    const { rememberListings } = await import("@/lib/catalog/shop-memory-store");
    const remembered = await rememberListings(listings);
    return { ok: true, data: { remembered } };
  } catch (err) {
    return { ok: false, error: said(err) };
  }
}

/**
 * Order lines the rules could not find on the spec sheet, put to the model — when a key is set.
 *
 * The Bulk page joins an order to its spec sheet in the browser (see joinToReference), and a line
 * whose wording the rules have never seen is left out of it. Only the names and codes travel: the
 * descriptions stay in the browser, and the answer is a code from the sheet or nothing.
 */
export async function joinOrderAction(input: {
  lines: Array<{ index: number; title: string; gender: string; modelCode: string }>;
  specs: Array<{ modelCode: string; title: string }>;
}): Promise<ActionResult<Array<{ index: number; code: string }>>> {
  await requireUser();
  if (!aiAvailable() || input.lines.length === 0) return { ok: true, data: [] };
  try {
    const { askToJoin } = await import("@/lib/catalog/reference-ai");
    const item = (fields: Partial<CanonicalLineItem>): CanonicalLineItem => ({ ...emptyLineItem(), ...fields });
    const decided = await askToJoin(
      input.lines.slice(0, 200).map((l) => ({ index: l.index, line: item({ title: l.title, gender: l.gender, modelCode: l.modelCode }) })),
      input.specs.slice(0, 3000).map((s) => item({ modelCode: s.modelCode, title: s.title })),
    );
    return { ok: true, data: [...decided].map(([index, spec]) => ({ index, code: spec.modelCode })) };
  } catch (err) {
    // The rules' answer stands on its own; the model only ever adds to it.
    return { ok: false, error: said(err) };
  }
}

/**
 * Read a supplier's spec sheet or barcode list into rows the delivery can look things up in.
 *
 * The companion to readInvoiceAction, and deliberately a different reading of a different kind of
 * file. An order form says what is arriving; a spec export says what each thing IS — Volkl's has
 * the waist width, the sidecut radii, the core and the technologies, thirty-odd columns of exactly
 * what a customer wants to know — and a barcode list says which EAN belongs to which length. They
 * carry no quantities and nothing is applied from them. They are searched for the products the
 * order built, which is the order the shop does it in: the order form first, then these.
 *
 * Read by its columns, with no model involved, because a spec export is a table with headings and
 * that is what the mapping suggester is for.
 */
export async function readReferenceAction(file: { name: string; type: string; base64: string }): Promise<ActionResult<{ rows: CanonicalLineItem[]; sheet: string; columns: string[]; warnings: string[] }>> {
  return safely(async () => {
    await requireUser();

    const buffer = Buffer.from(file.base64, "base64");
    if (buffer.byteLength > MAX_UPLOAD) {
      return { ok: false, error: `That file is ${readableSize(buffer.byteLength)}, and an upload has to stay under ${readableSize(MAX_UPLOAD)}. A spec export that big is usually several seasons in one workbook — split it, or save just this season's tab.` };
    }

    const isWorkbook = /\.xlsx?$/i.test(file.name) || /spreadsheet|excel/i.test(file.type);
    const isCsv = /\.csv$/i.test(file.name) || file.type === "text/csv";
    if (!isWorkbook && !isCsv) {
      return { ok: false, error: `${file.name} has no columns to read. A spec sheet or barcode list has to be a spreadsheet or a CSV — a PDF of one has nothing to look up against.` };
    }

    try {
      const { extractXlsx, extractCsv } = await import("@/lib/catalog/extract/tabular");
      const table = isWorkbook ? await extractXlsx(buffer) : extractCsv(buffer);
      const { suggestMapping, applyMapping } = await import("@/lib/catalog/mapping");
      const mapping = suggestMapping(table.headers, table.rows);
      const rows = table.rows.map((row) => applyMapping(row, mapping)).filter((r) => r.barcode.trim() || r.sku.trim() || r.modelCode.trim() || r.description.trim());
      if (rows.length === 0) {
        return { ok: false, error: `Nothing in ${file.name} reads as a reference row. A spec sheet or barcode list needs a column identifying each row — an item code, a SKU or an EAN — and something to say about it.` };
      }
      const named = Object.entries(mapping).filter(([, header]) => header).map(([key]) => key);
      return {
        ok: true,
        data: {
          rows,
          sheet: table.method ?? file.name,
          columns: named,
          warnings: [
            `${rows.length} row${rows.length === 1 ? "" : "s"} read from ${file.name}. Nothing here is a delivery — it is searched for the products the order built, and adds none of its own.`,
            ...table.warnings,
          ],
        },
      };
    } catch (err) {
      const message = said(err);
      return { ok: false, error: `Could not read ${file.name}: ${message}` };
    }
  });
}

/**
 * Write the change down, so a price change to the live shop is not an untraceable event.
 *
 * The file is applied in the browser — it never needs to reach the server, and a Shopify export of
 * a whole catalogue is bigger than an upload limit anyway — so this records what was done.
 */
export async function logAdjustmentAction(details: { instruction: string; described: string[]; matched: number; products: number; changes: number; filename: string }): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await logAudit("catalog.adjusted", { userId: user.id, details });
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// Unassigned product photos
// ---------------------------------------------------------------------------

export async function attachPhotoAction(imageId: string, productId: string, variantId: string | null): Promise<ActionResult> {
  return safely(async () => {
    await requireUser();
    const photo = await prisma.unassignedImage.findUnique({ where: { id: imageId } });
    if (!photo) return { ok: false, error: "Photo not found" };
    const count = await prisma.productImage.count({ where: { productId } });
    await prisma.productImage.create({ data: { productId, variantId, url: photo.url, position: count + 1, source: "MANUAL", validated: /^https:/.test(photo.url) } });
    await prisma.unassignedImage.delete({ where: { id: imageId } });
    return { ok: true };
  });
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
        // What the build found on the order is the build's to say, whatever the reading made of it.
        directives = { ...reading.directives, typesSeen: directives.typesSeen };
        await prisma.importBatch.update({ where: { id: batchId }, data: { directives: JSON.stringify(directives) } });
        // Brand, Type, tags and packages are decided when products are BUILT, so the products are
        // built again with the instruction, there and then. The shop asked for exactly that: it
        // used to rebuild only a batch nobody had edited, and otherwise only re-price and say to
        // build again from Column mapping — a reply that said the change was made when it was not.
        // A hand edit on the review page is replaced by the rebuild, and the reply says so.
        let outcome = "";
        const { untouchedSinceBuilt } = await import("@/lib/catalog/pipeline");
        const built = await prisma.product.count({ where: { batchId } });
        const edited = built > 0 && !(await untouchedSinceBuilt(batchId));
        const rebuilt = await autoApplyMappings(batchId, user.id);
        if (rebuilt.products > 0) {
          outcome = ` Rebuilt the ${rebuilt.products} product${rebuilt.products === 1 ? "" : "s"} with this now${edited ? " — the edits made by hand on the review page were replaced by the rebuild" : ""}.`;
        } else if (built > 0) {
          await repriceBatch(batchId);
          outcome = " The products could not be rebuilt automatically (a file's columns need mapping first), so they were re-priced; open Column mapping to build them with this.";
        } else if (rebuilt.unmapped.length > 0) {
          outcome = ` It applies as soon as the products are built: ${rebuilt.unmapped.join(", ")} need${rebuilt.unmapped.length === 1 ? "s" : ""} its columns mapped first.`;
        }
        await prisma.batchInstruction.create({ data: { batchId, role: "ASSISTANT", body: `${reading.reply}${outcome}` } });
        await logAudit("batch.instruction", { batchId, userId: user.id, details: directives });
      } else {
        // Said plainly rather than nothing at all: the instruction is kept, but nothing acted on it.
        await prisma.batchInstruction.create({ data: { batchId, role: "ASSISTANT", body: "I could not make sense of that one, so nothing was changed. Say it again, perhaps in other words." } });
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
/**
 * "All new products": the one directive worth a tick rather than a sentence, because it is the
 * difference between a build that matches every line against the shop and one that does not.
 */
/**
 * Which of the invoice's products to build: the ones unticked on the batch page are left out.
 *
 * A product unticked goes from the batch at once and is remembered as skipped, so a later build
 * leaves it out too. One ticked back is built again — a rebuild, since the build is what makes it,
 * and only while nothing on the review page has been edited since the last one.
 */
export async function setSkippedProductsAction(batchId: string, skip: string[]): Promise<ActionResult<{ removed: number; rebuilt: boolean; said: string }>> {
  return safely(async () => {
    const user = await requireUser();
    const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: batchId }, select: { directives: true, status: true } });
    if (["EXPORTED", "PUSHED"].includes(batch.status)) return { ok: false, error: "This batch has been exported, so what it builds is no longer being changed." };
    const before = parseDirectives(batch.directives);
    const next = [...new Set(skip.map((x) => x.trim()).filter(Boolean))];
    const directives = { ...before, skip: next };
    await prisma.importBatch.update({ where: { id: batchId }, data: { directives: JSON.stringify(directives) } });
    await logAudit("batch.instruction", { batchId, userId: user.id, details: { skip: next } });
    const { isSkipped, parseDirectives: _p } = await import("@/lib/catalog/instructions");
    void _p;
    const built = await prisma.product.findMany({ where: { batchId }, select: { id: true, title: true, handle: true } });
    const gone = built.filter((p) => isSkipped(p, next));
    if (gone.length > 0) await prisma.product.deleteMany({ where: { id: { in: gone.map((p) => p.id) } } });
    // Something ticked back on: only a rebuild brings it back.
    const restored = before.skip.filter((x) => !next.includes(x));
    let rebuilt = false;
    let said = gone.length > 0 ? `${gone.length} product${gone.length === 1 ? "" : "s"} left out.` : "";
    if (restored.length > 0) {
      const { untouchedSinceBuilt } = await import("@/lib/catalog/pipeline");
      if (await untouchedSinceBuilt(batchId)) {
        await autoApplyMappings(batchId, user.id);
        rebuilt = true;
        said = `${said} Built again with ${restored.join(", ")} back in.`.trim();
      } else {
        said = `${said} ${restored.join(", ")} will be back the next time the products are built — the review page has edits, so they were not rebuilt now.`.trim();
      }
    }
    revalidatePath(`/batches/${batchId}`);
    revalidatePath(`/batches/${batchId}/review`);
    return { ok: true, data: { removed: gone.length, rebuilt, said } };
  });
}

/**
 * Which product types this batch works with.
 *
 * A Burton order carries boards, bindings, boots, outerwear and gloves at once, and the person
 * wants to do the boards today. Ticking kinds here keeps the directive; products of other kinds
 * are taken out of the batch, and a kind ticked back is built again. No kinds ticked means all.
 */
export async function setBuildTypesAction(batchId: string, types: string[]): Promise<ActionResult<{ removed: number; rebuilt: boolean; said: string }>> {
  return safely(async () => {
    const user = await requireUser();
    const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: batchId }, select: { directives: true, status: true } });
    if (["EXPORTED", "PUSHED"].includes(batch.status)) return { ok: false, error: "This batch has been exported, so what it builds is no longer being changed." };
    const before = parseDirectives(batch.directives);
    const next = [...new Set(types.map((x) => x.trim()).filter(Boolean))];
    await prisma.importBatch.update({ where: { id: batchId }, data: { directives: JSON.stringify({ ...before, types: next }) } });
    await logAudit("batch.instruction", { batchId, userId: user.id, details: { types: next } });
    const { isOfType, typeKey } = await import("@/lib/catalog/instructions");
    const built = await prisma.product.findMany({ where: { batchId }, select: { id: true, productType: true } });
    const gone = next.length > 0 ? built.filter((p) => !isOfType(p, next)) : [];
    if (gone.length > 0) await prisma.product.deleteMany({ where: { id: { in: gone.map((p) => p.id) } } });
    // A kind newly let in — or the filter lifted — only a rebuild brings back.
    const widened = next.length === 0
      ? before.types.length > 0
      : next.some((t) => before.types.length > 0 && !before.types.some((b) => typeKey(b) === typeKey(t)));
    let rebuilt = false;
    let said = gone.length > 0 ? `${gone.length} product${gone.length === 1 ? "" : "s"} of other kinds left for later.` : "";
    if (widened && built.length > 0) {
      const { untouchedSinceBuilt } = await import("@/lib/catalog/pipeline");
      if (await untouchedSinceBuilt(batchId)) {
        await autoApplyMappings(batchId, user.id);
        rebuilt = true;
        said = `${said} Built again with ${next.length ? next.join(", ") : "every kind"} in.`.trim();
      } else {
        said = `${said} ${next.length ? next.join(", ") : "The other kinds"} will be in the next time the products are built — the review page has edits, so they were not rebuilt now.`.trim();
      }
    }
    revalidatePath(`/batches/${batchId}`);
    revalidatePath(`/batches/${batchId}/review`);
    return { ok: true, data: { removed: gone.length, rebuilt, said } };
  });
}

export async function setAllNewAction(batchId: string, allNew: boolean): Promise<ActionResult<{ directives: string[]; rebuilt: number }>> {
  return safely(async () => {
    const user = await requireUser();
    const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: batchId }, select: { directives: true, status: true } });
    if (["EXPORTED", "PUSHED"].includes(batch.status)) return { ok: false, error: "This batch has been exported, so it is no longer being built." };
    const directives = { ...parseDirectives(batch.directives), allNew };
    await prisma.importBatch.update({ where: { id: batchId }, data: { directives: JSON.stringify(directives) } });
    await logAudit("batch.instruction", { batchId, userId: user.id, details: directives });
    let rebuilt = 0;
    const built = await prisma.product.count({ where: { batchId } });
    if (built > 0) {
      const { untouchedSinceBuilt } = await import("@/lib/catalog/pipeline");
      if (await untouchedSinceBuilt(batchId)) rebuilt = (await autoApplyMappings(batchId, user.id)).products;
    }
    revalidatePath(`/batches/${batchId}`);
    return { ok: true, data: { directives: describeDirectives(directives), rebuilt } };
  });
}

export async function clearInstructionsAction(batchId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await prisma.$transaction([
      prisma.batchInstruction.deleteMany({ where: { batchId } }),
      prisma.importBatch.update({ where: { id: batchId }, data: { directives: JSON.stringify(NO_DIRECTIVES) } }),
    ]);
    const built = await prisma.product.count({ where: { batchId } });
    if (built > 0) {
      const { untouchedSinceBuilt } = await import("@/lib/catalog/pipeline");
      if (await untouchedSinceBuilt(batchId)) await autoApplyMappings(batchId, user.id);
      else await repriceBatch(batchId);
    }
    await logAudit("batch.instruction.cleared", { batchId, userId: user.id });
    revalidatePath(`/batches/${batchId}`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}


// ---------------------------------------------------------------------------
// Setup: the shop, what it sells, what it has taught Flöda, how documents are read
// ---------------------------------------------------------------------------

const shopSchema = z.object({
  name: z.string().trim().min(1, "Give the shop its name"),
  sells: z.string().trim().min(1, "Say what the shop sells"),
  country: z.string().trim().min(2).max(2),
  currency: z.string().trim().regex(/^[A-Z]{3}$/, "A three-letter currency code"),
  taxName: z.string().trim().max(24),
  taxRate: z.coerce.number().min(0).max(1),
  pack: z.string().refine((p) => isPackSet(p), "Pick the trades to start from again."),
  marker: z.string().trim().toLowerCase().regex(/^[a-z0-9]{0,12}$/, "Letters and digits only, up to twelve"),
});

/**
 * Who the shop is and what it sells. Switching the snow-and-outdoor pack on seeds its rules once;
 * switching it off takes the seeded ones back out and leaves anything a person wrote.
 */
export async function saveShopAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requireUser("ADMIN");
  return safely(async () => {
    const raw = Object.fromEntries(formData.entries());
    const data = shopSchema.parse({ ...raw, taxRate: Number(raw.taxRate ?? 0) / 100 });
    const { getShopProfile, saveShopProfile } = await import("@/lib/catalog/shop-profile");
    const before = await getShopProfile();
    await saveShopProfile(data);
    // A pack that brings starting rules seeds them once when switched on, and takes the seeded ones
    // back out when switched off, leaving anything a person wrote.
    const { packFor } = await import("@/lib/catalog/trades");
    if (packFor(data.pack).seeds && !packFor(before.pack).seeds) await seedDefaults();
    if (!packFor(data.pack).seeds && packFor(before.pack).seeds) await (await import("@/lib/catalog/seed")).unseedDefaults();
    await saveSettings({ gstRate: data.taxRate });
    await logAudit("shop.saved", { userId: user.id, details: { pack: data.pack, country: data.country, currency: data.currency } });
    revalidatePath("", "layout");
    return { ok: true, message: "Saved" };
  });
}

/**
 * What the shop's own export showed about how it files and tags products. Joined to what earlier
 * exports showed, since a shop exports a category at a time: a Type seen before keeps the larger
 * count, sections and spellings are unioned, and an export of the same file name replaces its
 * own earlier reading.
 */
export async function learnVocabularyAction(learned: import("@/lib/catalog/taxonomy").LearnedVocabulary): Promise<ActionResult<{ types: number }>> {
  const user = await requireUser("ADMIN");
  return safely(async () => {
    const { saveLearnedVocabulary, saveShopProfile, getLearnedVocabulary } = await import("@/lib/catalog/shop-profile");
    const { mergeVocabulary } = await import("@/lib/catalog/learn");
    const clean: import("@/lib/catalog/taxonomy").LearnedVocabulary = {
      types: learned.types.slice(0, 2000).map((t) => ({ type: String(t.type).trim().slice(0, 120), count: Number(t.count) || 0, sections: (t.sections ?? []).map(String).slice(0, 12), ...(t.spelling ? { spelling: String(t.spelling).slice(0, 120) } : {}) })).filter((t) => t.type),
      sections: (learned.sections ?? []).map(String).slice(0, 40),
      spelling: Object.fromEntries(Object.entries(learned.spelling ?? {}).slice(0, 4000).map(([k, v]) => [String(k).slice(0, 120), String(v).slice(0, 120)])),
      vendors: (learned.vendors ?? []).slice(0, 2000).map((v) => ({ name: String(v.name).slice(0, 120), count: Number(v.count) || 0 })),
      products: Number(learned.products) || 0,
      file: String(learned.file ?? "").slice(0, 200),
      learnedAt: new Date().toISOString(),
    };
    const before = await getLearnedVocabulary();
    const merged = before ? mergeVocabulary(before, clean) : clean;
    await saveLearnedVocabulary(merged);
    await saveShopProfile({ skipped: { learn: false } });
    await logAudit("shop.learned", { userId: user.id, details: { file: clean.file, products: clean.products, types: clean.types.length, sections: clean.sections } });
    revalidatePath("", "layout");
    return { ok: true, data: { types: clean.types.length } };
  });
}

/**
 * The conventions per brand and product type, read out of the export in the browser and kept as
 * product templates. Templates learned from an earlier export are replaced; ones a person made by
 * hand are left.
 */
export async function learnTemplatesAction(input: { file: string; groups: import("@/lib/catalog/templates").TemplateGroup[] }): Promise<ActionResult<{ templates: number }>> {
  const user = await requireUser("ADMIN");
  return safely(async () => {
    const groups = input.groups.filter((g) => g.analysis && g.analysis.productCount > 0).slice(0, 1500);
    // This file's earlier reading goes; what other exports taught stays, since a shop exports a category at a time.
    await prisma.productTemplate.deleteMany({ where: { sourceFileName: `export:${String(input.file ?? "").slice(0, 150)}` } });
    let made = 0;
    for (const g of groups) {
      const a = g.analysis;
      const vendor = String(g.vendor ?? "").trim().slice(0, 120);
      const productType = String(g.productType ?? "").trim().slice(0, 120);
      if (!vendor && !productType) continue;
      await prisma.productTemplate.create({
        data: {
          name: [vendor, productType].filter(Boolean).join(" · ").slice(0, 160),
          scope: vendor ? "BRAND" : "PRODUCT_TYPE",
          matchValue: vendor || productType,
          matchProductType: vendor ? productType : "",
          sourceFileName: `export:${String(input.file ?? "").slice(0, 150)}`,
          productCount: a.productCount,
          setProductType: productType,
          addTags: (a.commonTags ?? []).slice(0, 40).join(", "),
          addCollections: (a.collections ?? []).slice(0, 20).join(", "),
          optionNames: (a.optionNames ?? []).slice(0, 3).join(", "),
          setMetafields: JSON.stringify(a.metafields ?? {}),
          analysis: JSON.stringify({ ...a, tagCounts: (a.tagCounts ?? []).slice(0, 60) }),
          priority: Math.min(a.productCount, 1000),
          active: true,
        },
      });
      made++;
    }
    await logAudit("shop.templates", { userId: user.id, details: { file: input.file, templates: made } });
    return { ok: true, data: { templates: made } };
  });
}

/** Read the shop's website for its categories. Nothing is kept until the person says so. */
export async function readWebsiteAction(url: string): Promise<ActionResult<import("@/lib/catalog/website").WebsiteCategories>> {
  await requireUser("ADMIN");
  return safely(async () => {
    const { readWebsite } = await import("@/lib/catalog/website");
    const found = await readWebsite(String(url ?? "").slice(0, 300));
    return { ok: true, data: found };
  });
}

/** Keep the categories the person ticked as the shop's product types. */
export async function saveWebsiteAction(input: { url: string; source: "types" | "shopify" | "menu"; categories: Array<{ title: string; path: string; count?: number }> }): Promise<ActionResult<{ kinds: number }>> {
  const user = await requireUser("ADMIN");
  return safely(async () => {
    const { saveWebsiteCategories } = await import("@/lib/catalog/shop-profile");
    const { siteOrigin } = await import("@/lib/catalog/website");
    const url = siteOrigin(String(input.url ?? ""));
    if (!url) throw new Error("That is not a website address.");
    const seen = new Set<string>();
    const categories = (input.categories ?? [])
      .map((c) => ({ title: String(c.title ?? "").trim().slice(0, 120), path: String(c.path ?? "").trim().slice(0, 300), ...(Number.isFinite(c.count) ? { count: Number(c.count) } : {}) }))
      .filter((c) => c.title && !seen.has(c.title.toLowerCase()) && seen.add(c.title.toLowerCase()))
      .slice(0, 1500);
    if (categories.length === 0) throw new Error("Tick at least one category to keep.");
    await saveWebsiteCategories({ url, source: input.source === "menu" || input.source === "types" ? input.source : "shopify", categories, readAt: new Date().toISOString() });
    await logAudit("shop.website", { userId: user.id, details: { url, kinds: categories.length } });
    revalidatePath("", "layout");
    return { ok: true, data: { kinds: categories.length } };
  });
}

/** Forget the website's categories; the product types come from the export alone again. */
export async function forgetWebsiteAction(): Promise<ActionResult> {
  const user = await requireUser("ADMIN");
  return safely(async () => {
    const { saveWebsiteCategories } = await import("@/lib/catalog/shop-profile");
    await saveWebsiteCategories(null);
    await logAudit("shop.website_forgotten", { userId: user.id });
    revalidatePath("", "layout");
    return { ok: true };
  });
}

/** The key the shop reads documents with, when the host sets none. Tried once before it is kept. */
export async function saveApiKeyAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requireUser("ADMIN");
  return safely(async () => {
    const key = String(formData.get("key") ?? "").trim();
    const { saveStoredApiKey, saveShopProfile } = await import("@/lib/catalog/shop-profile");
    if (!key) {
      await saveStoredApiKey("");
      return { ok: true, message: "The key has been removed." };
    }
    if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key)) return { ok: false, error: "That does not look like an Anthropic API key. It starts with sk-ant- and is pasted whole." };
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    try {
      await new Anthropic({ apiKey: key, maxRetries: 1 }).models.list({ limit: 1 });
    } catch (err) {
      const why = describeApiError(err) ?? said(err);
      return { ok: false, error: `The key was refused, so it was not kept: ${why}` };
    }
    await saveStoredApiKey(key);
    await saveShopProfile({ skipped: { ai: false } });
    await logAudit("shop.apikey", { userId: user.id, details: { set: true } });
    revalidatePath("", "layout");
    return { ok: true, message: "The key works and has been kept." };
  });
}

/** A step of setup put off until later. It stays on the Home checklist. */
export async function skipSetupStepAction(step: "store" | "learn" | "house" | "menu" | "ai" | "suppliers" | "first"): Promise<ActionResult> {
  await requireUser("ADMIN");
  return safely(async () => {
    const { saveShopProfile } = await import("@/lib/catalog/shop-profile");
    await saveShopProfile({ skipped: { [step]: true } });
    revalidatePath("", "layout");
    return { ok: true };
  });
}

export async function finishSetupAction(): Promise<void> {
  await requireUser("ADMIN");
  const { saveShopProfile } = await import("@/lib/catalog/shop-profile");
  await saveShopProfile({ setupDone: true });
  revalidatePath("", "layout");
  redirect("/");
}


// ---------------------------------------------------------------------------
// Clients of Flöda (the vendor's own deployment) and this copy's licence
// ---------------------------------------------------------------------------

async function requireVendorAdmin() {
  const user = await requireUser("ADMIN");
  const { vendorMode } = await import("@/lib/catalog/licence");
  if (!vendorMode()) throw new Error("This is not the vendor's deployment.");
  return user;
}

const clientSchema = z.object({
  name: z.string().trim().min(1, "The client needs a name").max(120),
  contact: z.string().trim().max(120).default(""),
  email: z.string().trim().max(200).default(""),
  plan: z.enum(PLAN_IDS).default("shop"),
  status: z.enum(["TRIAL", "ACTIVE", "PAUSED", "ENDED"]).default("TRIAL"),
  expiresAt: z.string().trim().default(""),
  notes: z.string().trim().max(2000).default(""),
  /** Dollars a fortnight their reading through Flöda may cost; empty for the plan's own allowance, 0 for no limit. */
  aiCap: z.string().trim().regex(/^(\d{0,5}(\.\d{1,2})?)?$/, "The reading allowance is dollars a fortnight, like 60, or empty for the plan's own").default(""),
});

/** The allowance in cents: what was typed, or the plan's own when nothing was. */
function capCents(dollars: string, plan: string): number {
  return dollars === "" ? planOf(plan).readingCapCents : Math.round(Number(dollars) * 100);
}

function expiry(value: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function createClientAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return safely(async () => {
    const user = await requireVendorAdmin();
    const { aiCap, ...data } = clientSchema.parse(Object.fromEntries(formData.entries()));
    const { newLicenceKey } = await import("@/lib/catalog/licence");
    const client = await prisma.client.create({ data: { ...data, expiresAt: expiry(data.expiresAt), aiCapCents: capCents(aiCap, data.plan), licenceKey: newLicenceKey() } });
    await logAudit("client.created", { userId: user.id, details: { client: client.id, name: client.name, plan: client.plan } });
    revalidatePath("/clients");
    return { ok: true, message: `${client.name} added. Their key is ${client.licenceKey}.` };
  });
}

export async function updateClientAction(id: string, patch: { status?: string; plan?: string; expiresAt?: string; notes?: string; contact?: string; email?: string; name?: string; aiCap?: string }): Promise<ActionResult> {
  return safely(async () => {
    const user = await requireVendorAdmin();
    const data = clientSchema.partial().parse(patch);
    const { expiresAt, aiCap, ...rest } = data;
    // An empty allowance follows the plan; a plan change with no allowance typed takes the new plan's.
    const current = aiCap !== undefined || rest.plan !== undefined ? await prisma.client.findUnique({ where: { id }, select: { plan: true } }) : null;
    const plan = rest.plan ?? current?.plan ?? "shop";
    const cap = aiCap !== undefined ? capCents(aiCap, plan) : rest.plan !== undefined ? planOf(plan).readingCapCents : undefined;
    await prisma.client.update({ where: { id }, data: { ...rest, ...(expiresAt === undefined ? {} : { expiresAt: expiry(expiresAt) }), ...(cap === undefined ? {} : { aiCapCents: cap }) } });
    await logAudit("client.updated", { userId: user.id, details: { client: id, keys: Object.keys(data) } });
    revalidatePath("/clients");
    return { ok: true, message: "Saved" };
  });
}

/** A new key for a client whose old one has leaked or been lost. Their copy must enter the new one. */
export async function regenerateClientKeyAction(id: string): Promise<ActionResult<{ key: string }>> {
  return safely(async () => {
    const user = await requireVendorAdmin();
    const { newLicenceKey } = await import("@/lib/catalog/licence");
    const key = newLicenceKey();
    await prisma.client.update({ where: { id }, data: { licenceKey: key } });
    await logAudit("client.rekeyed", { userId: user.id, details: { client: id } });
    revalidatePath("/clients");
    return { ok: true, data: { key } };
  });
}

export async function deleteClientAction(id: string): Promise<ActionResult> {
  return safely(async () => {
    const user = await requireVendorAdmin();
    const client = await prisma.client.delete({ where: { id } });
    await logAudit("client.deleted", { userId: user.id, details: { client: id, name: client.name } });
    revalidatePath("/clients");
    return { ok: true };
  });
}

/** A lead from the landing page becomes a client on a 14-day trial, with a key to send them. */
export async function clientFromLeadAction(at: string): Promise<ActionResult<{ key: string }>> {
  return safely(async () => {
    const user = await requireVendorAdmin();
    const { newLicenceKey } = await import("@/lib/catalog/licence");
    const row = await prisma.appSetting.findUnique({ where: { key: "floda.leads" } });
    const leads = parseJson<Array<{ email: string; shop: string; sells: string; platform: string; plan?: string; note: string; at: string }>>(row?.value, []);
    const lead = leads.find((l) => l.at === at);
    if (!lead) return { ok: false, error: "That lead is no longer there." };
    const key = newLicenceKey();
    const plan = planOf(lead.plan);
    const client = await prisma.client.create({
      data: { name: lead.shop, email: lead.email, plan: plan.id, status: "TRIAL", expiresAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000), licenceKey: key, aiCapCents: plan.readingCapCents, notes: [lead.sells && `Sells: ${lead.sells}`, lead.platform && `Platform: ${lead.platform}`, lead.note && `Note: ${lead.note}`].filter(Boolean).join("\n") },
    });
    const rest = leads.filter((l) => l.at !== at);
    await prisma.appSetting.update({ where: { key: "floda.leads" }, data: { value: JSON.stringify(rest) } });
    await logAudit("client.from_lead", { userId: user.id, details: { client: client.id, name: client.name } });
    revalidatePath("/clients");
    return { ok: true, data: { key } };
  });
}

export async function dismissLeadAction(at: string): Promise<ActionResult> {
  return safely(async () => {
    await requireVendorAdmin();
    const row = await prisma.appSetting.findUnique({ where: { key: "floda.leads" } });
    const leads = parseJson<Array<{ at: string }>>(row?.value, []);
    await prisma.appSetting.upsert({ where: { key: "floda.leads" }, create: { key: "floda.leads", value: "[]" }, update: { value: JSON.stringify(leads.filter((l) => l.at !== at)) } });
    revalidatePath("/clients");
    return { ok: true };
  });
}

/** This copy's licence key, entered by the shop and tried against Flöda now. */
export async function activateLicenceAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return safely(async () => {
    const user = await requireUser("ADMIN");
    const { normaliseKey, licenceServer } = await import("@/lib/catalog/licence");
    if (!licenceServer()) return { ok: false, error: "This copy is not set up to check a licence." };
    const key = normaliseKey(String(formData.get("licence") ?? ""));
    if (!key) return { ok: false, error: "That is not a Flöda licence key. It looks like FL-XXXX-XXXX-XXXX-XXXX." };
    const { activate } = await import("@/lib/catalog/licence-store");
    let licence;
    try {
      licence = await activate(key);
    } catch (err) {
      return { ok: false, error: `Flöda could not be reached to check the key: ${said(err)}` };
    }
    await logAudit("licence.entered", { userId: user.id, details: { status: licence.status, client: licence.client } });
    revalidatePath("", "layout");
    if (licence.why) return { ok: false, error: `Flöda says: ${licence.why} The key has been kept; contact ${SUPPORT_EMAIL}.` };
    return { ok: true, message: `Licensed to ${licence.client}${licence.expiresAt ? ` until ${new Date(licence.expiresAt).toLocaleDateString("en-AU")}` : ""}.` };
  });
}


/** A Stripe checkout page for a plan, or the billing page, from the vendor. The browser opens it. */
export async function billingLinkAction(what: "checkout" | "portal", plan?: string): Promise<ActionResult<{ url: string }>> {
  const user = await requireUser("ADMIN");
  return safely(async () => {
    const { billingLink } = await import("@/lib/catalog/licence-store");
    let out;
    try {
      out = await billingLink(what, plan);
    } catch (err) {
      return { ok: false, error: `Flöda could not be reached: ${said(err)}` };
    }
    if ("refused" in out) return { ok: false, error: out.refused };
    await logAudit(what === "checkout" ? "licence.checkout_opened" : "licence.portal_opened", { userId: user.id, details: { plan } });
    return { ok: true, data: { url: out.url } };
  });
}

// ---------------------------------------------------------------------------
// How the shop writes a listing, and feedback to the people who make Flöda
// ---------------------------------------------------------------------------

/** The tag rules the "How you list" form writes are named so it can find and replace its own. */
const HOUSE_RULE_PREFIX = "house: ";

/** The rules the form wrote before, in its own shape. */
export async function houseTagRules(): Promise<import("@/lib/catalog/house").TagRuleInput[]> {
  const rows = await prisma.tagRule.findMany({ where: { name: { startsWith: HOUSE_RULE_PREFIX } }, orderBy: { createdAt: "asc" } });
  return rows.map((r) => ({ id: r.id, field: (["any", "title", "brand", "productType"].includes(r.matchField) ? r.matchField : "any") as import("@/lib/catalog/house").TagRuleInput["field"], pattern: r.pattern, addTags: r.addTags }));
}

const KIND_RULE_PREFIX = "kind: ";

/**
 * The kinds the shop told Flöda about, as tag rules the build applies: every product of the kind
 * gets its tags, and its Type is written as what the shop calls it. The kind rules replace the
 * kind rules; rules made anywhere else are left alone.
 */
async function materialiseKindRules(kinds: import("@/lib/catalog/house").KindRule[]): Promise<void> {
  const { escapeRegExp } = await import("@/lib/catalog/rules");
  await prisma.tagRule.deleteMany({ where: { name: { startsWith: KIND_RULE_PREFIX } } });
  for (const k of kinds) {
    const rename = k.calledAs && k.calledAs !== k.type ? k.calledAs : "";
    if (!k.tags.length && !rename) continue;
    const pattern = `^${escapeRegExp(k.type)}$`;
    await prisma.tagRule.create({ data: { name: `${KIND_RULE_PREFIX}${k.type}`.slice(0, 160), matchField: "productType", pattern, addTags: k.tags.join(", "), setProductType: rename, priority: 50 } });
    if (rename) await prisma.tagRule.create({ data: { name: `${KIND_RULE_PREFIX}${k.calledAs} (as called)`.slice(0, 160), matchField: "productType", pattern: `^${escapeRegExp(k.calledAs)}$`, addTags: k.tags.join(", "), priority: 50 } });
  }
}

/**
 * What the shop says about the product types in an export: what each is called, the tags every
 * one gets, how its titles read. Merged by Type into what was said before, so an export a
 * category at a time builds the list up. A kind called something new is added to the vocabulary
 * so the name is a Type the shop has.
 */
export async function saveKindsAction(input: { kinds: import("@/lib/catalog/house").KindRule[] }): Promise<ActionResult<{ kinds: number }>> {
  const user = await requireUser("ADMIN");
  return safely(async () => {
    const { cleanKinds } = await import("@/lib/catalog/house");
    const { getHouseConventions, saveHouseConventions, getLearnedVocabulary, saveLearnedVocabulary } = await import("@/lib/catalog/shop-profile");
    const told = cleanKinds(input.kinds);
    const house = await getHouseConventions();
    const byType = new Map(house.kinds.map((k) => [k.type.toLowerCase(), k]));
    for (const k of told) byType.set(k.type.toLowerCase(), k);
    const kinds = [...byType.values()];
    await saveHouseConventions({ ...house, kinds });
    await materialiseKindRules(kinds);
    // A name the shop gives a kind is a Type of the shop's: it joins the vocabulary beside the export's own.
    const learned = await getLearnedVocabulary();
    if (learned) {
      const have = new Set(learned.types.map((t) => t.type.toLowerCase()));
      const added = kinds.filter((k) => k.calledAs && !have.has(k.calledAs.toLowerCase())).map((k) => {
        const from = learned.types.find((t) => t.type.toLowerCase() === k.type.toLowerCase());
        return { type: k.calledAs, count: from?.count ?? k.count, sections: from?.sections ?? [], ...(from?.spelling ? { spelling: from.spelling } : {}) };
      });
      if (added.length) await saveLearnedVocabulary({ ...learned, types: [...learned.types, ...added] });
    }
    await logAudit("shop.kinds", { userId: user.id, details: { told: told.length, kinds: kinds.length } });
    revalidatePath("", "layout");
    return { ok: true, data: { kinds: kinds.length } };
  });
}

/** How the shop writes a listing, and the tag rules it told us, from the "How you list" form. */
export async function saveHouseAction(input: { house: import("@/lib/catalog/house").HouseConventions; tagRules: import("@/lib/catalog/house").TagRuleInput[]; priceEnding?: string }): Promise<ActionResult> {
  const user = await requireUser("ADMIN");
  return safely(async () => {
    const { cleanHouse, TAG_RULE_FIELDS } = await import("@/lib/catalog/house");
    const { saveHouseConventions, saveShopProfile } = await import("@/lib/catalog/shop-profile");
    const { getHouseConventions } = await import("@/lib/catalog/shop-profile");
    const kept = await getHouseConventions();
    // The form has no say over the kinds; they are told on the catalogue step and kept here.
    const house = { ...cleanHouse({ ...input.house, kinds: kept.kinds }, kept), savedAt: new Date().toISOString() };
    // The price ending is a pricing setting; it is asked here because it is a habit like the rest.
    if (input.priceEnding && ["NONE", "0.99", "0.95", "1.00", "5.00", "10.00"].includes(input.priceEnding)) await saveSettings({ defaultRoundTo: input.priceEnding });
    await saveHouseConventions(house);
    await materialiseKindRules(house.kinds);
    const fields = new Set(TAG_RULE_FIELDS.map((f) => f.key));
    const rules = (Array.isArray(input.tagRules) ? input.tagRules : []).slice(0, 200)
      .map((r) => ({ field: fields.has(r.field) ? r.field : "any", pattern: String(r.pattern ?? "").trim().slice(0, 200), addTags: String(r.addTags ?? "").split(",").map((t) => t.trim()).filter(Boolean).slice(0, 40).join(", ") }))
      .filter((r) => r.pattern && r.addTags);
    // The form's rules replace the form's rules; rules made anywhere else are left alone.
    await prisma.tagRule.deleteMany({ where: { name: { startsWith: HOUSE_RULE_PREFIX } } });
    for (const r of rules) {
      await prisma.tagRule.create({ data: { name: `${HOUSE_RULE_PREFIX}${r.field} ~ ${r.pattern}`.slice(0, 160), matchField: r.field, pattern: r.pattern, addTags: r.addTags } });
    }
    await saveShopProfile({ skipped: { house: false } });
    await logAudit("shop.house", { userId: user.id, details: { naming: house.naming, identifiers: house.identifiers, weights: house.weights.mode, rules: rules.length } });
    revalidatePath("", "layout");
    return { ok: true, message: `Kept${rules.length ? `, with ${rules.length} tag rule${rules.length === 1 ? "" : "s"}` : ""}.` };
  });
}

/**
 * A word from someone using Flöda to the people who make it. On the vendor's own deployment it
 * is kept there; an installed copy sends it to the vendor with the shop, page and version on it,
 * and keeps it here as well if the vendor cannot be reached.
 */
export async function sendNoteToFlodaAction(input: { message: string; email?: string; page?: string }): Promise<ActionResult> {
  const user = await requireUser();
  return safely(async () => {
    const message = String(input.message ?? "").trim().slice(0, 4000);
    if (message.length < 3) return { ok: false, error: "Say a little more than that." };
    const { FEEDBACK_KEY } = await import("@/lib/catalog/feedback-box");
    const { vendorMode, licenceServer } = await import("@/lib/catalog/licence");
    const { shopName } = await import("@/lib/catalog/shop-profile");
    const row = {
      at: new Date().toISOString(),
      message,
      email: String(input.email ?? "").trim().slice(0, 200),
      page: String(input.page ?? "").slice(0, 200),
      shop: shopName(),
      user: user.name,
      version: process.env.FLODA_VERSION ?? "",
      install: "",
      key: "",
    };
    const keepHere = async () => {
      const existing = await prisma.appSetting.findUnique({ where: { key: FEEDBACK_KEY } });
      const rows = parseJson<unknown[]>(existing?.value, []);
      rows.push(row);
      const value = JSON.stringify(rows.slice(-500));
      await prisma.appSetting.upsert({ where: { key: FEEDBACK_KEY }, create: { key: FEEDBACK_KEY, value }, update: { value } });
    };
    await logAudit("feedback.sent", { userId: user.id, details: { page: row.page, length: message.length } });
    if (vendorMode() || !licenceServer()) {
      await keepHere();
      return { ok: true, message: vendorMode() ? "Kept. It is on the Clients page." : `Thank you. It is kept with this copy; write to ${SUPPORT_EMAIL} as well if it is urgent.` };
    }
    try {
      const { getLicence, installId } = await import("@/lib/catalog/licence-store");
      const [licence, install] = await Promise.all([getLicence(), installId()]);
      const res = await fetch(`${licenceServer()}/api/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...row, install, key: licence?.key ?? "" }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { ok: true, message: "Sent. Thank you — a person reads every one." };
    } catch {
      await keepHere();
      return { ok: true, message: `Flöda could not be reached just now, so it is kept with this copy. Write to ${SUPPORT_EMAIL} if it is urgent.` };
    }
  });
}

export async function dismissFeedbackAction(at: string): Promise<ActionResult> {
  return safely(async () => {
    await requireVendorAdmin();
    const { FEEDBACK_KEY } = await import("@/lib/catalog/feedback-box");
    const row = await prisma.appSetting.findUnique({ where: { key: FEEDBACK_KEY } });
    const rows = parseJson<Array<{ at: string }>>(row?.value, []);
    await prisma.appSetting.upsert({ where: { key: FEEDBACK_KEY }, create: { key: FEEDBACK_KEY, value: "[]" }, update: { value: JSON.stringify(rows.filter((r) => r.at !== at)) } });
    revalidatePath("/clients");
    return { ok: true };
  });
}

/** Start this copy's 14-day trial from inside the app. The vendor makes the key; it is kept here at once. */
/** Where this copy asks for its licence, when the built-in address cannot be reached. */
export async function setLicenceServerAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return safely(async () => {
    const user = await requireUser("ADMIN");
    const { saveServerOverride, servers } = await import("@/lib/catalog/licence-store");
    const url = String(formData.get("server") ?? "");
    try {
      await saveServerOverride(url);
    } catch (err) {
      return { ok: false, error: said(err) };
    }
    await logAudit("licence.server", { userId: user.id, details: { server: url.trim() } });
    revalidatePath("", "layout");
    const list = await servers();
    return { ok: true, message: url.trim() ? `Flöda is asked at ${list[0]} from now on.` : `Back to the built-in address${list[0] ? ` (${list[0]})` : ""}.` };
  });
}

/** Sign this copy in with the shop's Flöda account: the vendor hands over the key and it is kept. */
export async function signInLicenceAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return safely(async () => {
    const user = await requireUser("ADMIN");
    const { licenceServer } = await import("@/lib/catalog/licence");
    if (!licenceServer()) return { ok: false, error: "This copy is not set up to check a licence." };
    const parsed = z.object({ email: z.string().trim().email("That email address does not look right").max(200), password: z.string().min(1, "The password is needed").max(200) })
      .safeParse({ email: formData.get("email") ?? "", password: formData.get("password") ?? "" });
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
    const { signInWithAccount } = await import("@/lib/catalog/licence-store");
    let outcome;
    try {
      outcome = await signInWithAccount(parsed.data);
    } catch (err) {
      return { ok: false, error: `Flöda could not be reached to sign in: ${said(err)}` };
    }
    if ("refused" in outcome) return { ok: false, error: outcome.refused };
    const { saveShopProfile, getShopProfile } = await import("@/lib/catalog/shop-profile");
    const profile = await getShopProfile();
    if (!profile.name && outcome.licence.client) await saveShopProfile({ name: outcome.licence.client });
    await logAudit("licence.signed_in", { userId: user.id, details: { client: outcome.licence.client, plan: outcome.licence.plan, status: outcome.licence.status } });
    revalidatePath("", "layout");
    return { ok: true, message: `Signed in. This copy is licensed to ${outcome.licence.client} on the ${outcome.licence.plan} plan.` };
  });
}

// ---------------------------------------------------------------------------------------------
// Setup: one example of each supplier's paperwork
// ---------------------------------------------------------------------------------------------

/** A batch to read one supplier's example into, named so it is known for what it is. */
export async function createExampleBatchAction(supplierName: string, filename: string): Promise<ActionResult<{ batchId: string }>> {
  const user = await requireUser("ADMIN");
  return safely(async () => {
    const name = supplierName.trim().slice(0, 80);
    if (!name) return { ok: false, error: "Say which supplier the example is from." };
    const supplier = await prisma.supplier.upsert({ where: { name }, create: { name }, update: {} });
    const batch = await prisma.importBatch.create({
      data: { name: `Setup: ${name} example (${filename.slice(0, 60)})`, supplierId: supplier.id, createdById: user.id, builtBy: initialsFrom(user.name || user.email), currency: supplier.defaultCurrency, gstTreatment: supplier.defaultGstTreatment, notes: "Read during setup, as an example of this supplier's paperwork." },
    });
    await logAudit("batch.created", { batchId: batch.id, userId: user.id, details: { name: batch.name, setup: true } });
    return { ok: true, data: { batchId: batch.id } };
  });
}

export interface ExampleState {
  rows: number;
  method: string | null;
  /** Why the file could not be read, when it could not. */
  failed: string | null;
  groups: Array<{ hash: string; headers: string[]; sampleRows: Record<string, string>[]; suggestion: import("@/lib/catalog/mapping").Mapping; options: import("@/lib/catalog/mapping").MappingOptions; templateId: string | null; templateName: string | null; isCanonical: boolean; confident: boolean }>;
}

/** How one example came out of reading: the lines found, and each layout with what its columns were taken for. */
export async function exampleStateAction(batchId: string): Promise<ActionResult<ExampleState>> {
  await requireUser("ADMIN");
  return safely(async () => {
    const files = await prisma.sourceFile.findMany({ where: { batchId }, select: { extractionStatus: true, extractionError: true, extractionMethod: true } });
    const failed = files.find((f) => f.extractionStatus === "FAILED");
    const stillReading = files.some((f) => f.extractionStatus === "PENDING");
    const { mappingState } = await import("@/lib/catalog/pipeline");
    const groups = failed || stillReading ? [] : await mappingState(batchId);
    const rows = groups.reduce((n, g) => n + g.rowCount, 0);
    return {
      ok: true,
      data: {
        rows,
        method: files.find((f) => f.extractionMethod)?.extractionMethod ?? null,
        failed: failed ? failed.extractionError || "The file could not be read." : stillReading ? "Reading took longer than setup waits for. It carries on in the background; look under Imports in a minute." : null,
        groups: groups.map((g) => ({ hash: g.hash, headers: g.headers, sampleRows: g.sampleRows.slice(0, 3), suggestion: g.suggestion, options: g.options, templateId: g.templateId, templateName: g.templateName, isCanonical: g.isCanonical, confident: g.confident })),
      },
    };
  });
}

// ---------------------------------------------------------------------------------------------
// The rulebook: a tag rule switched off, deleted, or tried on the latest batch
// ---------------------------------------------------------------------------------------------

/** Switch one tag rule on or off, leaving it in the rulebook. */
export async function setTagRuleActiveAction(id: string, active: boolean): Promise<ActionResult> {
  const user = await requireUser("ADMIN");
  return safely(async () => {
    await prisma.tagRule.update({ where: { id }, data: { active } });
    await logAudit("rule.toggled", { userId: user.id, details: { id, active } });
    revalidatePath("/training");
    return { ok: true };
  });
}

/** Delete one tag rule. A kind's rule comes back the next time the kinds are kept; a house rule the next time the form is. */
export async function deleteTagRuleAction(id: string): Promise<ActionResult> {
  const user = await requireUser("ADMIN");
  return safely(async () => {
    const rule = await prisma.tagRule.findUnique({ where: { id } });
    if (!rule) return { ok: false, error: "That rule is already gone." };
    await prisma.tagRule.delete({ where: { id } });
    await logAudit("rule.deleted", { userId: user.id, details: { id, name: rule.name } });
    revalidatePath("/training");
    return { ok: true };
  });
}

export interface RuleReach {
  batch: string;
  matched: number;
  of: number;
  examples: string[];
}

/**
 * What a tag rule would touch on the latest batch that is still being worked on (or the latest
 * at all): how many of its products match, and a few by name. Nothing is changed; it is the
 * "try it" beside a rule in the rulebook.
 */
export async function ruleReachAction(id: string): Promise<ActionResult<RuleReach>> {
  await requireUser();
  return safely(async () => {
    const rule = await prisma.tagRule.findUnique({ where: { id } });
    if (!rule) return { ok: false, error: "That rule is gone." };
    const { ruleMatches } = await import("@/lib/catalog/rules");
    const open = await prisma.importBatch.findFirst({ where: { status: { in: ["EXTRACTED", "MAPPED", "REVIEW"] } }, orderBy: { updatedAt: "desc" }, select: { id: true, name: true } });
    const batch = open ?? (await prisma.importBatch.findFirst({ orderBy: { updatedAt: "desc" }, select: { id: true, name: true } }));
    if (!batch) return { ok: false, error: "No batch to try it on yet. Upload a supplier's file first." };
    const products = await prisma.product.findMany({ where: { batchId: batch.id }, select: { title: true, vendor: true, category: true, productType: true, tags: true, collections: true, metafields: true, variants: { select: { sku: true } } } });
    const live = { ...rule, active: true };
    const hits = products.filter((p) => ruleMatches(live, { title: p.title, vendor: p.vendor, category: p.category, productType: p.productType, skus: p.variants.map((v) => v.sku), tags: p.tags.split(",").map((t) => t.trim()).filter(Boolean), collections: p.collections.split(",").map((t) => t.trim()).filter(Boolean), metafields: parseJson<Record<string, string>>(p.metafields, {}) }));
    return { ok: true, data: { batch: batch.name, matched: hits.length, of: products.length, examples: hits.slice(0, 5).map((p) => p.title) } };
  });
}

// ---------------------------------------------------------------------------------------------
// Tags proposed by a build: approved they are the shop's, rejected they are never proposed again
// ---------------------------------------------------------------------------------------------

export async function decideTagProposalAction(id: string, approve: boolean): Promise<ActionResult> {
  const user = await requireUser("ADMIN");
  return safely(async () => {
    const proposal = await prisma.tagProposal.findUnique({ where: { id } });
    if (!proposal) return { ok: false, error: "That proposal is gone." };
    await prisma.tagProposal.update({ where: { id }, data: { status: approve ? "APPROVED" : "REJECTED", decidedAt: new Date() } });
    await logAudit(approve ? "tag.approved" : "tag.rejected", { userId: user.id, details: { tag: proposal.tag } });
    revalidatePath("/training");
    return { ok: true };
  });
}
// ---------------------------------------------------------------------------
// History of Prices and stock and of Bills
// ---------------------------------------------------------------------------

const runInput = z.object({
  kind: z.enum(["PRICES", "BILLS"]),
  title: z.string().max(2000),
  summary: z.object({ lines: z.array(z.string()), documents: z.array(z.string()), counts: z.record(z.string(), z.number()) }),
  files: z.array(z.object({ filename: z.string().min(1).max(500), gzipBase64: z.string(), sizeBytes: z.number().nonnegative() })).max(20),
  tooLarge: z.boolean().optional(),
});

export async function saveRunAction(input: z.infer<typeof runInput>): Promise<ActionResult<{ id: string; keptFiles: boolean }>> {
  const user = await requireUser();
  try {
    const parsed = runInput.parse(input);
    const saved = await saveRun({ ...parsed, userId: user.id });
    revalidatePath("/bulk");
    return { ok: true, data: saved };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// Shops on this computer (the desktop app; see shops.ts)
// ---------------------------------------------------------------------------

export async function addShopAction(input: { name: string }): Promise<ActionResult<{ id: string; name: string }>> {
  return safely(async () => {
    const user = await requireUser("ADMIN");
    const entry = await (await import("@/lib/catalog/shops")).addShop(String(input.name ?? ""));
    await logAudit("shops.add", { userId: user.id, details: entry }).catch(() => undefined);
    revalidatePath("/settings");
    return { ok: true, data: entry };
  });
}

export async function renameShopAction(input: { id: string; name: string }): Promise<ActionResult> {
  return safely(async () => {
    const user = await requireUser("ADMIN");
    await (await import("@/lib/catalog/shops")).renameShop(String(input.id ?? ""), String(input.name ?? ""));
    await logAudit("shops.rename", { userId: user.id, details: input }).catch(() => undefined);
    revalidatePath("/settings");
    return { ok: true };
  });
}

/** Open another shop. The desktop app restarts on it, and its own sign-in page opens. */
export async function openShopAction(input: { id: string }): Promise<ActionResult> {
  return safely(async () => {
    const user = await requireUser();
    await logAudit("shops.open", { userId: user.id, details: input }).catch(() => undefined);
    await (await import("@/lib/catalog/shops")).openShop(String(input.id ?? ""));
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------------------------
// Teach Flöda: one belief changed in place, one rule added
// ---------------------------------------------------------------------------------------------

type HousePatch = {
  naming?: Partial<import("@/lib/catalog/house").HouseConventions["naming"]>;
  identifiers?: Partial<import("@/lib/catalog/house").HouseConventions["identifiers"]>;
  weights?: Partial<import("@/lib/catalog/house").HouseConventions["weights"]>;
  descriptions?: Partial<import("@/lib/catalog/house").HouseConventions["descriptions"]>;
  notes?: string;
};

/** One of the shop's listing habits changed on the Teach page: the rest of them, and the kinds, stay as they were. */
export async function patchHouseAction(patch: HousePatch): Promise<ActionResult> {
  const user = await requireUser("ADMIN");
  return safely(async () => {
    const { cleanHouse } = await import("@/lib/catalog/house");
    const { getHouseConventions, saveHouseConventions, saveShopProfile } = await import("@/lib/catalog/shop-profile");
    const kept = await getHouseConventions();
    const merged = {
      ...kept,
      naming: { ...kept.naming, ...(patch.naming ?? {}) },
      identifiers: { ...kept.identifiers, ...(patch.identifiers ?? {}) },
      weights: { ...kept.weights, ...(patch.weights ?? {}) },
      descriptions: { ...kept.descriptions, ...(patch.descriptions ?? {}) },
      notes: patch.notes === undefined ? kept.notes : String(patch.notes),
    };
    // The year goes on nothing when "chosen" is left behind, so the old choices do not come back with it.
    if (patch.naming?.season && patch.naming.season !== "chosen") delete merged.naming.yearOn;
    const house = { ...cleanHouse({ ...merged, kinds: kept.kinds }, kept), savedAt: new Date().toISOString() };
    await saveHouseConventions(house);
    await saveShopProfile({ skipped: { house: false } });
    await logAudit("shop.house", { userId: user.id, details: { patched: Object.keys(patch) } });
    revalidatePath("", "layout");
    return { ok: true };
  });
}

/** One thing said about one product type: its tags, the tags that vary, how its titles read, or what it is filed as. */
export async function saveKindAction(input: { type: string; patch: Partial<Pick<import("@/lib/catalog/house").KindRule, "calledAs" | "tags" | "variesTags" | "titleFormat">> }): Promise<ActionResult> {
  const user = await requireUser("ADMIN");
  return safely(async () => {
    const { cleanKinds } = await import("@/lib/catalog/house");
    const { getHouseConventions, saveHouseConventions } = await import("@/lib/catalog/shop-profile");
    const type = String(input.type ?? "").trim();
    if (!type) return { ok: false, error: "Which product type?" };
    const house = await getHouseConventions();
    const was = house.kinds.find((k) => k.type.toLowerCase() === type.toLowerCase()) ?? { type, calledAs: type, tags: [], variesTags: [], titleFormat: "", count: 0 };
    const next = cleanKinds([{ ...was, ...input.patch, type: was.type }])[0];
    if (!next) return { ok: false, error: "That could not be kept." };
    const kinds = house.kinds.some((k) => k.type.toLowerCase() === type.toLowerCase()) ? house.kinds.map((k) => (k.type.toLowerCase() === type.toLowerCase() ? next : k)) : [...house.kinds, next];
    await saveHouseConventions({ ...house, kinds });
    await materialiseKindRules(kinds);
    await logAudit("shop.kinds", { userId: user.id, details: { type, patched: Object.keys(input.patch) } });
    revalidatePath("", "layout");
    return { ok: true };
  });
}

/** A tag rule written or changed on the Teach page: when a field says this, add these tags and, if asked, file it as a type. */
export async function saveTagRuleAction(input: { id?: string; matchField: string; pattern: string; addTags: string; setProductType?: string }): Promise<ActionResult> {
  const user = await requireUser("ADMIN");
  return safely(async () => {
    const field = ["any", "title", "brand", "productType", "category", "sku"].includes(input.matchField) ? input.matchField : "any";
    const pattern = String(input.pattern ?? "").trim().slice(0, 200);
    const addTags = String(input.addTags ?? "").split(",").map((t) => t.trim()).filter(Boolean).slice(0, 40).join(", ");
    const setProductType = String(input.setProductType ?? "").trim().slice(0, 120);
    if (!pattern) return { ok: false, error: "Say what the rule looks for." };
    if (!addTags && !setProductType) return { ok: false, error: "Say what the rule does: tags to add, a type to file it as, or both." };
    const data = { matchField: field, pattern, addTags, setProductType };
    if (input.id) {
      const was = await prisma.tagRule.findUnique({ where: { id: input.id } });
      if (!was) return { ok: false, error: "That rule is gone." };
      // A rule the kinds or the old form wrote becomes the shop's own once it is edited here, so neither writes over it again.
      const name = was.name.startsWith(KIND_RULE_PREFIX) || was.name.startsWith(HOUSE_RULE_PREFIX) ? `${field} ~ ${pattern}`.slice(0, 160) : was.name;
      await prisma.tagRule.update({ where: { id: input.id }, data: { ...data, name } });
    } else {
      await prisma.tagRule.create({ data: { ...data, name: `${field} ~ ${pattern}`.slice(0, 160) } });
    }
    await logAudit(input.id ? "rule.updated" : "rule.created", { userId: user.id, details: data });
    revalidatePath("/training");
    return { ok: true };
  });
}

/** A pricing rule written or changed on the Teach page, without the form. */
export async function savePricingRuleJsonAction(input: { id?: string; name?: string; scope: string; matchValue?: string; mode: string; percent: number; roundTo: string }): Promise<ActionResult> {
  const user = await requireUser("ADMIN");
  return safely(async () => {
    const scope = ["DEFAULT", "CATEGORY", "BRAND", "PRODUCT"].includes(input.scope) ? input.scope : "DEFAULT";
    const mode = input.mode === "MARKUP" ? "MARKUP" : "MARGIN";
    const percent = Number(input.percent);
    const roundTo = ["NONE", "0.99", "0.95", "1.00", "5.00", "10.00"].includes(input.roundTo) ? input.roundTo : "0.99";
    const matchValue = String(input.matchValue ?? "").trim().slice(0, 160);
    if (!Number.isFinite(percent) || percent < 0 || percent > 999) return { ok: false, error: "The percentage needs to be a number." };
    if (mode === "MARGIN" && percent >= 100) return { ok: false, error: "A margin must be below 100%." };
    if (scope !== "DEFAULT" && !matchValue) return { ok: false, error: scope === "BRAND" ? "Which brand?" : scope === "CATEGORY" ? "Which product type?" : "Which SKU or model code?" };
    const who = scope === "DEFAULT" ? "everything else" : matchValue;
    const name = String(input.name ?? "").trim().slice(0, 160) || `${who}: ${percent}% ${mode === "MARGIN" ? "margin" : "markup"}`;
    const data = { name, scope, matchValue, mode, percent, roundTo, priority: scope === "DEFAULT" ? 0 : scope === "PRODUCT" ? 30 : scope === "BRAND" ? 20 : 10 };
    if (input.id) await prisma.pricingRule.update({ where: { id: input.id }, data: { ...data, name: input.name === undefined ? undefined : name } });
    else await prisma.pricingRule.create({ data: { ...data, active: true } });
    await logAudit(input.id ? "pricing.updated" : "pricing.created", { userId: user.id, details: data });
    revalidatePath("/training");
    revalidatePath("/pricing");
    return { ok: true };
  });
}

export async function setPricingRuleActiveAction(id: string, active: boolean): Promise<ActionResult> {
  const user = await requireUser("ADMIN");
  return safely(async () => {
    await prisma.pricingRule.update({ where: { id }, data: { active } });
    await logAudit("pricing.toggled", { userId: user.id, details: { id, active } });
    revalidatePath("/training");
    revalidatePath("/pricing");
    return { ok: true };
  });
}

/**
 * What every product of a brand or type gets, written or changed on the Teach page: the options it
 * is sold by, the tags it always carries, the type it is filed as, and a note for the writer.
 */
export async function saveTemplateAction(input: { id?: string; scope: string; matchValue: string; matchProductType?: string; optionNames?: string[]; addTags?: string[]; setProductType?: string; notes?: string }): Promise<ActionResult> {
  const user = await requireUser("ADMIN");
  return safely(async () => {
    const scope = ["BRAND", "PRODUCT_TYPE", "CATEGORY"].includes(input.scope) ? input.scope : "PRODUCT_TYPE";
    const matchValue = String(input.matchValue ?? "").trim().slice(0, 120);
    if (!matchValue) return { ok: false, error: scope === "BRAND" ? "Which brand?" : "Which product type?" };
    const list = (xs: unknown, n: number) => [...new Set((Array.isArray(xs) ? xs : []).map((x) => String(x).trim().slice(0, 80)).filter(Boolean))].slice(0, n);
    const data = {
      scope,
      matchValue,
      matchProductType: String(input.matchProductType ?? "").trim().slice(0, 120),
      optionNames: list(input.optionNames, 3).join(", "),
      addTags: list(input.addTags, 40).join(", "),
      setProductType: String(input.setProductType ?? "").trim().slice(0, 120),
      notes: String(input.notes ?? "").trim().slice(0, 4000),
    };
    if (!data.optionNames && !data.addTags && !data.setProductType && !data.notes) return { ok: false, error: "Say at least one thing every one of them gets." };
    if (input.id) {
      await prisma.productTemplate.update({ where: { id: input.id }, data });
    } else {
      // The same brand or type said twice is one template, so a second saying replaces the first.
      const same = await prisma.productTemplate.findFirst({ where: { scope, matchValue, matchProductType: data.matchProductType } });
      if (same) await prisma.productTemplate.update({ where: { id: same.id }, data: { ...data, active: true } });
      else await prisma.productTemplate.create({ data: { ...data, name: [scope === "BRAND" ? matchValue : "", scope === "BRAND" ? data.matchProductType : matchValue].filter(Boolean).join(" · ").slice(0, 160) || matchValue, sourceFileName: "you", priority: 500, active: true } });
    }
    await logAudit(input.id ? "template.updated" : "template.created", { userId: user.id, details: { scope, matchValue } });
    revalidatePath("/training");
    return { ok: true };
  });
}

export async function deleteTemplateAction(id: string): Promise<ActionResult> {
  const user = await requireUser("ADMIN");
  return safely(async () => {
    await prisma.productTemplate.delete({ where: { id } });
    await logAudit("template.deleted", { userId: user.id, details: { id } });
    revalidatePath("/training");
    return { ok: true };
  });
}

export async function setTemplateActiveAction(id: string, active: boolean): Promise<ActionResult> {
  const user = await requireUser("ADMIN");
  return safely(async () => {
    await prisma.productTemplate.update({ where: { id }, data: { active } });
    await logAudit("template.toggled", { userId: user.id, details: { id, active } });
    revalidatePath("/training");
    return { ok: true };
  });
}

/** What a supplier's paperwork is taken to mean unless the file says otherwise: its currency, its tax, its brand. */
export async function saveSupplierDefaultsAction(input: { id: string; defaultCurrency: string; defaultGstTreatment: string; defaultBrand: string }): Promise<ActionResult> {
  const user = await requireUser("ADMIN");
  return safely(async () => {
    const currency = String(input.defaultCurrency ?? "").trim().toUpperCase().slice(0, 3);
    if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, error: "The currency is a three-letter code: AUD, USD, EUR." };
    const gst = ["INCLUSIVE", "EXCLUSIVE", "NONE"].includes(input.defaultGstTreatment) ? input.defaultGstTreatment : "EXCLUSIVE";
    await prisma.supplier.update({ where: { id: input.id }, data: { defaultCurrency: currency, defaultGstTreatment: gst, defaultBrand: String(input.defaultBrand ?? "").trim().slice(0, 120) || null } });
    await logAudit("supplier.defaults", { userId: user.id, details: { id: input.id, currency, gst } });
    revalidatePath("/training");
    return { ok: true };
  });
}

/**
 * The patterns an export shows beyond its types and tags, worked out in the browser and kept here:
 * the shape of the SEO titles, where the shop has not set one, and each brand's margin, as a pricing
 * rule where the brand has none. Both are named as the export's, so the shop can see where they came
 * from and change them.
 */
export async function learnMoreAction(input: { seoTitlePattern?: string; margins?: Array<{ brand: string; marginPct: number; products: number }> }): Promise<ActionResult<{ seoTitlePattern: string; margins: number }>> {
  const user = await requireUser("ADMIN");
  return safely(async () => {
    const { EXPORT_RULE_PREFIX } = await import("@/lib/catalog/teaching");
    const settings = await getSettings();
    let pattern = "";
    const offered = String(input.seoTitlePattern ?? "").trim().slice(0, 200);
    if (offered && /\{title\}|\{brand\}/.test(offered) && !settings.seoTitlePattern.trim()) {
      await saveSettings({ seoTitlePattern: offered });
      pattern = offered;
    }
    let made = 0;
    const have = await prisma.pricingRule.findMany({ where: { scope: "BRAND" }, select: { matchValue: true } });
    const taken = new Set(have.map((r) => r.matchValue.toLowerCase()));
    for (const m of (input.margins ?? []).slice(0, 200)) {
      const brand = String(m.brand ?? "").trim().slice(0, 120);
      const pct = Math.round(Number(m.marginPct));
      if (!brand || taken.has(brand.toLowerCase()) || !Number.isFinite(pct) || pct < 5 || pct >= 95) continue;
      taken.add(brand.toLowerCase());
      await prisma.pricingRule.create({ data: { name: `${EXPORT_RULE_PREFIX}${brand}`.slice(0, 160), scope: "BRAND", matchValue: brand, mode: "MARGIN", percent: pct, roundTo: settings.defaultRoundTo || "0.99", priority: 20, active: true } });
      made++;
    }
    await logAudit("shop.learned_more", { userId: user.id, details: { pattern, margins: made } });
    revalidatePath("", "layout");
    return { ok: true, data: { seoTitlePattern: pattern, margins: made } };
  });
}

/**
 * How the shop's descriptions are written, read off a handful of its own: the layout in a sentence
 * or two, the heading over the details, and any further sections. Kept as the shop's description
 * style where it has set none, so the writer matches it from the first product; the shop can change
 * every word of it on the Teach page.
 */
export async function describeStyleAction(input: { samples: string[] }): Promise<ActionResult<{ learned: boolean; format: string }>> {
  const user = await requireUser("ADMIN");
  return safely(async () => {
    const { getHouseConventions, saveHouseConventions } = await import("@/lib/catalog/shop-profile");
    const house = await getHouseConventions();
    if (house.descriptions.format.trim() || house.descriptions.sections?.length) return { ok: true, data: { learned: false, format: house.descriptions.format } };
    const samples = (input.samples ?? []).map((s) => String(s).slice(0, 6000)).filter((s) => s.trim().length >= 200).slice(0, 6);
    if (!aiAvailable() || samples.length < 2) return { ok: true, data: { learned: false, format: "" } };
    const { anthropicClient, LIGHT_MODEL } = await import("@/lib/catalog/anthropic");
    const { zodOutputFormat } = await import("@anthropic-ai/sdk/helpers/zod");
    const Style = z.object({
      format: z.string().describe("How these descriptions are laid out and written, as instructions to a writer in two to four plain sentences: what comes first, roughly how long, the voice, what is never said. Only what the samples show."),
      specsHeading: z.string().describe("The heading used over the list of specifications or details, exactly as written; empty if there is no such list or heading."),
      sections: z.array(z.object({ heading: z.string(), holds: z.string() })).describe("Headed sections that come after the main text, in order, each with what it holds, in a few words. Empty when the descriptions have no headed sections."),
    });
    const response = await anthropicClient(1).messages.parse({
      model: LIGHT_MODEL,
      max_tokens: 2000,
      system: "You are shown a few product descriptions from one online shop, as HTML or text. Describe the house style they share so another writer can match it. Say only what the samples show; name no product.",
      output_config: { format: zodOutputFormat(Style), effort: "low" },
      messages: [{ role: "user", content: samples.map((s, i) => `Description ${i + 1}:\n${s}`).join("\n\n---\n\n") }],
    }, { timeout: 40_000, maxRetries: 1, signal: AbortSignal.timeout(40_000) });
    const style = response.parsed_output;
    if (!style || !style.format.trim()) return { ok: true, data: { learned: false, format: "" } };
    const { cleanHouse } = await import("@/lib/catalog/house");
    const descriptions = { ...house.descriptions, format: style.format.trim(), specsHeading: style.specsHeading.trim() || house.descriptions.specsHeading, sections: style.sections.filter((s) => s.heading.trim()).slice(0, 8) };
    await saveHouseConventions({ ...cleanHouse({ ...house, descriptions }, house), savedAt: new Date().toISOString() });
    await logAudit("shop.description_style", { userId: user.id, details: { samples: samples.length } });
    revalidatePath("", "layout");
    return { ok: true, data: { learned: true, format: style.format.trim() } };
  });
}
