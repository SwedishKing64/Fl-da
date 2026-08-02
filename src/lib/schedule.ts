// The scheduled-send layer. When an order is fulfilled we queue a follow-up for N days
// later; a cron endpoint dispatches whatever's due. Storage is delegated to the
// persistence layer (in-memory by default, Postgres when DATABASE_URL is set), so the
// queue survives restarts in production.
//
// Sending is stubbed to a console log. Wire `sendEmail` to Resend/Postmark (RESEND_API_KEY)
// to actually deliver the "how was it?" email.

import { db } from "./db";
import type { FollowUp, FulfilledOrder } from "./db/types";

export type { FollowUp, FulfilledOrder };

export const FOLLOWUP_DELAY_DAYS = 3;

export async function scheduleFollowUp(shop: string, order: FulfilledOrder, now: number): Promise<FollowUp | null> {
  if (!order.email) return null;
  const followUp: FollowUp = {
    id: `${shop}:${order.id}`, // natural dedupe key
    shop,
    orderId: String(order.id),
    email: order.email,
    product: order.line_items?.[0]?.title ?? "your order",
    sendAt: now + FOLLOWUP_DELAY_DAYS * 86_400_000,
    sent: false,
  };
  const inserted = await db.insertFollowUp(followUp);
  return inserted ? followUp : null; // null when the order was already queued
}

export function dueFollowUps(now: number): Promise<FollowUp[]> {
  return db.dueFollowUps(now);
}

export async function dispatchDue(now: number): Promise<number> {
  const due = await db.dueFollowUps(now);
  for (const f of due) {
    await sendEmail(f);
    await db.markSent(f.id);
  }
  return due.length;
}

async function sendEmail(f: FollowUp): Promise<void> {
  // TODO: replace with a real provider, e.g.
  //   await fetch("https://api.resend.com/emails", { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` }, ... })
  console.log(`[afterword] would send follow-up to ${f.email} about "${f.product}" (${f.shop})`);
}

/** GDPR redaction: drop all queued follow-ups for a shop (shop/redact). */
export function purgeShop(shop: string): Promise<number> {
  return db.purgeShop(shop);
}

/** GDPR redaction: drop queued follow-ups for one customer's email (customers/redact). */
export function purgeEmail(email: string): Promise<number> {
  return db.purgeEmail(email);
}

/** Test/inspection helper: all not-yet-sent follow-ups. */
export function _queue(): Promise<FollowUp[]> {
  return db.dueFollowUps(Number.MAX_SAFE_INTEGER);
}
