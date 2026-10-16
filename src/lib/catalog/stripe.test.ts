import { describe, expect, it } from "vitest";
import { parseSignature, planForPrice, signPayload, standingFromSubscription, verifyWebhook, type StripeSubscription } from "./stripe";

const env = { STRIPE_PRICE_OWNKEY: "price_o", STRIPE_PRICE_STARTER: "price_s", STRIPE_PRICE_SHOP: "price_m", STRIPE_PRICE_UNLIMITED: "price_u" };

describe("a Stripe webhook signature", () => {
  const secret = "whsec_test";
  const body = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", data: { object: {} } });

  it("is read, checked against the secret, and must be fresh", () => {
    const t = 1_760_000_000;
    const sig = signPayload(secret, t, body);
    expect(parseSignature(`t=${t},v1=${sig}`)).toEqual({ t, v1: [sig] });
    expect(verifyWebhook(body, `t=${t},v1=${sig}`, secret, t + 10).type).toBe("checkout.session.completed");
    expect(() => verifyWebhook(body, `t=${t},v1=${sig}`, secret, t + 1000)).toThrow(/too old/);
    expect(() => verifyWebhook(body, `t=${t},v1=${"0".repeat(64)}`, secret, t)).toThrow(/does not match/);
    expect(() => verifyWebhook(body, `t=${t},v1=${sig}`, "whsec_other", t)).toThrow(/does not match/);
    expect(() => verifyWebhook(body, null, secret, t)).toThrow(/No Stripe-Signature/);
    expect(() => verifyWebhook(body, `t=${t},v1=${sig}`, "", t)).toThrow(/not set/);
  });

  it("accepts any one of several signatures, as Stripe sends while a secret rolls", () => {
    const t = 1_760_000_000;
    const sig = signPayload(secret, t, body);
    expect(verifyWebhook(body, `t=${t},v1=${"1".repeat(64)},v1=${sig}`, secret, t).id).toBe("evt_1");
  });
});

describe("what a subscription means for a client", () => {
  const now = new Date("2026-10-15T00:00:00Z");
  const base: StripeSubscription = { id: "sub_1", customer: "cus_1", status: "active", items: { data: [{ price: { id: "price_m" }, current_period_end: 1_795_000_000 }] } };

  it("is active on the plan the price names", () => {
    expect(standingFromSubscription(base, env, now)).toEqual({ status: "ACTIVE", billing: "active", expiresAt: null, plan: "shop" });
    expect(planForPrice("price_u", env)).toBe("unlimited");
    expect(planForPrice("price_o", env)).toBe("ownkey");
    expect(planForPrice("price_x", env)).toBeUndefined();
  });

  it("falls back to the plan on the subscription's metadata", () => {
    expect(standingFromSubscription({ ...base, items: { data: [{ price: { id: "price_x" } }] }, metadata: { plan: "starter" } }, env, now).plan).toBe("starter");
  });

  it("pauses on a failed renewal and ends on a cancellation, keeping the time paid for", () => {
    expect(standingFromSubscription({ ...base, status: "past_due" }, env, now)).toMatchObject({ status: "PAUSED", billing: "payment failed" });
    const cancelsLater = standingFromSubscription({ ...base, cancel_at_period_end: true }, env, now);
    expect(cancelsLater.status).toBe("ACTIVE");
    expect(cancelsLater.expiresAt?.toISOString()).toBe(new Date(1_795_000_000 * 1000).toISOString());
    expect(cancelsLater.billing).toMatch(/^cancels /);
    expect(standingFromSubscription({ ...base, status: "canceled" }, env, now)).toMatchObject({ status: "ACTIVE", billing: expect.stringMatching(/^cancelled, paid to/) });
    expect(standingFromSubscription({ ...base, status: "canceled", items: { data: [{ price: { id: "price_m" }, current_period_end: 1_700_000_000 }] } }, env, now)).toMatchObject({ status: "ENDED", billing: "cancelled" });
  });
});
