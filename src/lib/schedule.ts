// The scheduled-send layer. When an order is fulfilled we queue a follow-up for N days
// later; a cron endpoint dispatches whatever's due. Storage here is an in-memory stub —
// swap for a real DB (Postgres/KV) for production; the shapes stay the same.
//
// Sending is stubbed to a console log. Wire `sendEmail` to Resend/Postmark (RESEND_API_KEY)
// to actually deliver the "how was it?" email.

export const FOLLOWUP_DELAY_DAYS = 3;

export interface FollowUp {
  id: string;
  shop: string;
  orderId: string;
  email: string;
  product: string;
  sendAt: number; // epoch ms
  sent: boolean;
}

// Stub queue. Replace with a table keyed by (shop, orderId).
const QUEUE: FollowUp[] = [];

export interface FulfilledOrder {
  id: string | number;
  email?: string;
  line_items?: Array<{ title?: string }>;
}

export function scheduleFollowUp(shop: string, order: FulfilledOrder, now: number): FollowUp | null {
  if (!order.email) return null;
  const id = `${shop}:${order.id}`;
  if (QUEUE.some((f) => f.id === id)) return null; // dedupe
  const followUp: FollowUp = {
    id,
    shop,
    orderId: String(order.id),
    email: order.email,
    product: order.line_items?.[0]?.title ?? "your order",
    sendAt: now + FOLLOWUP_DELAY_DAYS * 86_400_000,
    sent: false,
  };
  QUEUE.push(followUp);
  return followUp;
}

export function dueFollowUps(now: number): FollowUp[] {
  return QUEUE.filter((f) => !f.sent && f.sendAt <= now);
}

export async function dispatchDue(now: number): Promise<number> {
  const due = dueFollowUps(now);
  for (const f of due) {
    await sendEmail(f);
    f.sent = true;
  }
  return due.length;
}

async function sendEmail(f: FollowUp): Promise<void> {
  // TODO: replace with a real provider, e.g.
  //   await fetch("https://api.resend.com/emails", { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` }, ... })
  console.log(`[afterword] would send follow-up to ${f.email} about "${f.product}" (${f.shop})`);
}

/** GDPR redaction: drop all queued follow-ups for a shop (shop/redact). */
export function purgeShop(shop: string): number {
  return purge((f) => f.shop === shop);
}

/** GDPR redaction: drop queued follow-ups for one customer's email (customers/redact). */
export function purgeEmail(email: string): number {
  const target = email.trim().toLowerCase();
  return purge((f) => f.email.trim().toLowerCase() === target);
}

function purge(match: (f: FollowUp) => boolean): number {
  let removed = 0;
  for (let i = QUEUE.length - 1; i >= 0; i--) {
    if (match(QUEUE[i])) {
      QUEUE.splice(i, 1);
      removed += 1;
    }
  }
  return removed;
}

/** Test/inspection helper. */
export function _queue(): FollowUp[] {
  return QUEUE;
}
