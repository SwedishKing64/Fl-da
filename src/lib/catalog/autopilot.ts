/**
 * Pushing without the person: tiered, not all or nothing.
 *
 * The push to the store needed a person to tick two boxes on every batch, however clean. The
 * confidence score already says which products need nobody's eyes, and the supplier's record says
 * whether its paperwork has read clean before; between them they say which products can go to the
 * store as drafts on their own. A product goes when every field of it is above the bar, nothing on
 * it is wrong for the shop, and it is not a question of which listing it is. The rest wait for the
 * quick look, and go with one press once settled. Pushes always land as drafts: nothing reaches a
 * customer until a person has looked at it in the store, and a push can be rolled back.
 *
 * Three tiers, by what the batch and the supplier have earned:
 *   auto        every product above the bar and the supplier reads clean: pushed as built, with a
 *               line saying so and nothing else to do
 *   exceptions  most above the bar, a handful not: the ready ones go, the rest are the quick look
 *   full        a supplier nobody has read before, or a batch that is broadly unsure: nothing goes
 *               on its own; the quick look is shown as it is
 *
 * The shop opts in on Training and Rules → Your store. Off, nothing is ever pushed on its own and
 * the one button on the quick look is the only way products go.
 */

import { describeTier, canGoAlone, readyToPush, tierFor, type Tier } from "./autopilot-rules";

export { canGoAlone, describeTier, readyToPush, tierFor, type Tier } from "./autopilot-rules";

export interface AutoPilotOutcome { tier: Tier; pushed: number; waiting: number; failed: string[]; said: string }

/**
 * After a build, or after the check: push what has earned it, when the shop has said to.
 * Never throws; a store that will not take the push is logged and the batch waits for a person.
 */
export async function autoPilot(batchId: string, userId: string): Promise<AutoPilotOutcome | null> {
  const { getShopProfile } = await import("./shop-profile");
  const { getSettings } = await import("./settings");
  const [profile, settings] = await Promise.all([getShopProfile(), getSettings()]);
  if (!profile.autoPush) return null;
  if (!(settings.shopify.storeDomain && settings.shopify.accessToken)) return null;
  const { prisma } = await import("./db");
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId }, select: { supplierId: true, status: true } });
  if (!batch || ["EXPORTED", "PUSHED", "ROLLED_BACK"].includes(batch.status)) return null;
  const { loadReview } = await import("./pipeline");
  const { supplierRecordFor } = await import("./supplier-score");
  const [review, record] = await Promise.all([loadReview(batchId), batch.supplierId ? supplierRecordFor(batch.supplierId, batchId) : Promise.resolve(null)]);
  const tier = tierFor(review.products, record);
  const ready = tier === "full" ? [] : readyToPush(review.products);
  const waiting = review.products.filter((p) => !canGoAlone(p)).length;
  if (ready.length === 0) return { tier, pushed: 0, waiting, failed: [], said: describeTier(tier, 0, waiting) };
  const { pushBatch } = await import("./shopify");
  const { logAudit } = await import("./audit");
  try {
    const r = await pushBatch(batchId, userId, { confirm: true, overrideWarnings: true, productIds: ready.map((p) => p.id) });
    const pushed = r.created + r.updated;
    await logAudit("batch.autopushed", { batchId, userId, details: { tier, pushed, waiting, failed: r.errors } });
    await prisma.batchInstruction.create({ data: { batchId, role: "ASSISTANT", body: describeTier(tier, pushed, waiting) + (r.errors.length ? ` The store refused ${r.errors.length}: ${r.errors.slice(0, 3).join("; ")}` : "") } }).catch(() => undefined);
    return { tier, pushed, waiting, failed: r.errors, said: describeTier(tier, pushed, waiting) };
  } catch (err) {
    console.warn("[autopilot] the push did not go:", err instanceof Error ? err.message : err);
    return { tier, pushed: 0, waiting, failed: [err instanceof Error ? err.message : String(err)], said: "The store would not take the push; the batch waits for a person." };
  }
}
