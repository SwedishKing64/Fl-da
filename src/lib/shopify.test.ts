import crypto from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { verifyWebhook } from "./shopify";
import { _queue, purgeEmail, purgeShop, scheduleFollowUp } from "./schedule";

const SECRET = "test-secret";
beforeAll(() => {
  process.env.SHOPIFY_API_SECRET = SECRET; // read at call-time by verifyWebhook
});

const sign = (body: string) => crypto.createHmac("sha256", SECRET).update(body, "utf8").digest("base64");

describe("verifyWebhook (compliance webhooks)", () => {
  const body = JSON.stringify({ shop_domain: "x.myshopify.com" });

  it("accepts a correctly signed body", () => {
    expect(verifyWebhook(body, sign(body))).toBe(true);
  });
  it("rejects a tampered body", () => {
    expect(verifyWebhook(body + " ", sign(body))).toBe(false);
  });
  it("rejects a missing HMAC header", () => {
    expect(verifyWebhook(body, null)).toBe(false);
  });
  it("rejects a wrong-secret signature", () => {
    const bad = crypto.createHmac("sha256", "other").update(body).digest("base64");
    expect(verifyWebhook(body, bad)).toBe(false);
  });
});

describe("GDPR purge helpers", () => {
  const NOW = 1_700_000_000_000;

  it("purgeEmail removes a customer's queued follow-ups (case-insensitive)", async () => {
    await scheduleFollowUp("g-a.myshopify.com", { id: 900, email: "z@x.com", line_items: [{ title: "T" }] }, NOW);
    await scheduleFollowUp("g-b.myshopify.com", { id: 901, email: "z@x.com" }, NOW);
    expect(await purgeEmail("Z@X.com")).toBe(2);
    expect((await _queue()).some((f) => f.email === "z@x.com")).toBe(false);
  });

  it("purgeShop removes a shop's queued follow-ups", async () => {
    await scheduleFollowUp("g-c.myshopify.com", { id: 902, email: "q@x.com" }, NOW);
    expect(await purgeShop("g-c.myshopify.com")).toBe(1);
  });
});
