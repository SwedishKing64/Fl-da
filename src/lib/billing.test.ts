import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activeSubscriptions, billingTestMode, createSubscription, hasActiveSubscription, plan } from "./billing";

// Stub the one network call (Shopify GraphQL) so we exercise the real request-building
// and response-handling without hitting Shopify.
function mockGraphQL(payload: unknown, ok = true) {
  const fetchMock = vi.fn(async () => ({
    ok,
    status: ok ? 200 : 500,
    json: async () => payload,
  }));
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SHOPIFY_BILLING_TEST;
  delete process.env.SHOPIFY_PLAN_PRICE;
});

describe("plan / billingTestMode", () => {
  it("has sensible defaults", () => {
    expect(plan().name).toBe("Afterword");
    expect(plan().price).toBe("19.00");
    expect(plan().currency).toBe("USD");
    expect(plan().trialDays).toBe(7);
  });
  it("SHOPIFY_BILLING_TEST overrides the NODE_ENV default", () => {
    process.env.SHOPIFY_BILLING_TEST = "false";
    expect(billingTestMode()).toBe(false);
    process.env.SHOPIFY_BILLING_TEST = "true";
    expect(billingTestMode()).toBe(true);
  });
});

describe("hasActiveSubscription", () => {
  it("true when an ACTIVE subscription exists", async () => {
    mockGraphQL({ data: { currentAppInstallation: { activeSubscriptions: [{ id: "1", name: "Afterword", status: "ACTIVE" }] } } });
    expect(await hasActiveSubscription("s.myshopify.com", "tok")).toBe(true);
  });
  it("false when the only subscription is not active", async () => {
    mockGraphQL({ data: { currentAppInstallation: { activeSubscriptions: [{ id: "1", name: "Afterword", status: "FROZEN" }] } } });
    expect(await hasActiveSubscription("s.myshopify.com", "tok")).toBe(false);
  });
  it("false when there are none", async () => {
    mockGraphQL({ data: { currentAppInstallation: { activeSubscriptions: [] } } });
    expect(await activeSubscriptions("s.myshopify.com", "tok")).toEqual([]);
    expect(await hasActiveSubscription("s.myshopify.com", "tok")).toBe(false);
  });
});

describe("createSubscription", () => {
  beforeEach(() => {
    process.env.SHOPIFY_BILLING_TEST = "true";
  });

  it("returns the confirmationUrl and sends a test charge with the plan price", async () => {
    const fetchMock = mockGraphQL({
      data: {
        appSubscriptionCreate: {
          userErrors: [],
          confirmationUrl: "https://s.myshopify.com/admin/charges/1/confirm",
          appSubscription: { id: "gid://shopify/AppSubscription/1", status: "PENDING" },
        },
      },
    });
    const out = await createSubscription("s.myshopify.com", "tok", "https://app.example.com/api/billing/callback?shop=s.myshopify.com");
    expect(out.confirmationUrl).toContain("/confirm");
    expect(out.subscriptionId).toContain("AppSubscription");

    // the request carries a test charge and our price
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.variables.test).toBe(true);
    expect(body.variables.lineItems[0].plan.appRecurringPricingDetails.price.amount).toBe("19.00");
  });

  it("throws on userErrors", async () => {
    mockGraphQL({
      data: { appSubscriptionCreate: { userErrors: [{ field: ["returnUrl"], message: "is invalid" }], confirmationUrl: null, appSubscription: null } },
    });
    await expect(createSubscription("s.myshopify.com", "tok", "bad")).rejects.toThrow(/is invalid/);
  });

  it("throws on a non-200 response", async () => {
    mockGraphQL({}, false);
    await expect(createSubscription("s.myshopify.com", "tok", "x")).rejects.toThrow(/GraphQL 500/);
  });
});
