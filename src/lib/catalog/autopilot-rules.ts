/**
 * Which products may go to the store with nobody looking, and how much of a batch may: the pure
 * half of autopilot.ts, which the quick look reads in the browser as well.
 */

import { BAR } from "./confidence";
import type { ReviewProduct } from "./review-types";
import { readsKnown, type SupplierRecord } from "./supplier-record";

export type Tier = "auto" | "exceptions" | "full";

/** Whether one product can go to the store with nobody looking at it. */
export function canGoAlone(p: ReviewProduct): boolean {
  if (p.confidence.product < BAR) return false;
  if (p.reconcileStatus === "AMBIGUOUS") return false;
  if (p.flags.some((f) => f.severity === "error")) return false;
  if (p.variants.some((v) => v.flags.some((f) => f.severity === "error"))) return false;
  return true;
}

/** The products that can go now and are not in the store yet. */
export function readyToPush(products: ReviewProduct[]): ReviewProduct[] {
  return products.filter((p) => canGoAlone(p) && !p.shopifyProductId);
}

/** How much of this batch may go on its own, by what it and its supplier have earned. */
export function tierFor(products: ReviewProduct[], record: SupplierRecord | null | undefined): Tier {
  if (products.length === 0) return "full";
  const ready = products.filter(canGoAlone).length;
  const share = ready / products.length;
  if (!readsKnown(record)) return "full";
  if (ready === products.length) return "auto";
  return share >= 0.5 ? "exceptions" : "full";
}

/** One line for the batch about what went and what waits. */
export function describeTier(tier: Tier, pushed: number, waiting: number): string {
  if (tier === "auto") return `${pushed} product${pushed === 1 ? "" : "s"} went to the store as drafts on their own: every field above the bar, and this supplier reads clean. Nothing to do.`;
  if (tier === "exceptions") return `${pushed} product${pushed === 1 ? "" : "s"} went to the store as drafts on their own; ${waiting} need${waiting === 1 ? "s" : ""} a quick look and go with one press once settled.`;
  return waiting > 0 ? `Nothing went on its own: this supplier has no clean record yet, or too much of the batch is unsure. ${waiting} need${waiting === 1 ? "s" : ""} a look.` : "Nothing went on its own: this supplier has no clean record yet.";
}

