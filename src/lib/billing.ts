// Shopify Billing — required before a public app can charge. Uses the GraphQL Admin API's
// appSubscriptionCreate (a recurring subscription) and reads the shop's active subscriptions
// to gate access. Env is read at call-time so tests can set it first (see .env.example):
//   SHOPIFY_PLAN_PRICE   (default "19.00")   monthly price
//   SHOPIFY_PLAN_CURRENCY(default "USD")
//   SHOPIFY_TRIAL_DAYS   (default "7")        free-trial length
//   SHOPIFY_BILLING_TEST ("true"/"false")     test charge (no real money). Defaults to
//                                             true unless NODE_ENV=production.
//
// A "test" charge lets you exercise the whole approve/return flow (and pass App Store
// review) without money changing hands. Set SHOPIFY_BILLING_TEST=false in production.

const ADMIN_API_VERSION = "2025-07";

export interface Plan {
  name: string;
  price: string; // decimal string, e.g. "19.00"
  currency: string; // ISO 4217, e.g. "USD"
  trialDays: number;
}

export function plan(): Plan {
  return {
    name: "Afterword",
    price: process.env.SHOPIFY_PLAN_PRICE ?? "19.00",
    currency: process.env.SHOPIFY_PLAN_CURRENCY ?? "USD",
    trialDays: Number(process.env.SHOPIFY_TRIAL_DAYS ?? "7"),
  };
}

/** Test charges (no real money) unless explicitly turned off, or NODE_ENV=production. */
export function billingTestMode(): boolean {
  const flag = process.env.SHOPIFY_BILLING_TEST;
  if (flag === "true") return true;
  if (flag === "false") return false;
  return process.env.NODE_ENV !== "production";
}

export interface Subscription {
  id: string;
  name: string;
  status: string; // ACTIVE | FROZEN | CANCELLED | EXPIRED | PENDING | DECLINED
  test?: boolean;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

/** Minimal GraphQL Admin API call. Throws on transport / top-level GraphQL errors. */
async function graphql<T>(shop: string, token: string, query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://${shop}/admin/api/${ADMIN_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Shopify GraphQL ${res.status}`);
  const json = (await res.json()) as GraphQLResponse<T>;
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join("; "));
  if (!json.data) throw new Error("Shopify GraphQL: empty response");
  return json.data;
}

const ACTIVE_SUBS_QUERY = `{
  currentAppInstallation {
    activeSubscriptions { id name status test }
  }
}`;

/** All active (or otherwise non-terminal) subscriptions Shopify has on file for the shop. */
export async function activeSubscriptions(shop: string, token: string): Promise<Subscription[]> {
  const data = await graphql<{ currentAppInstallation: { activeSubscriptions: Subscription[] } }>(
    shop,
    token,
    ACTIVE_SUBS_QUERY,
  );
  return data.currentAppInstallation?.activeSubscriptions ?? [];
}

/** True when the shop has an ACTIVE subscription to this app — the access gate. */
export async function hasActiveSubscription(shop: string, token: string): Promise<boolean> {
  const subs = await activeSubscriptions(shop, token);
  return subs.some((s) => s.status === "ACTIVE");
}

const CREATE_SUB_MUTATION = `
mutation AppSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $trialDays: Int, $test: Boolean) {
  appSubscriptionCreate(name: $name, returnUrl: $returnUrl, trialDays: $trialDays, test: $test, lineItems: $lineItems) {
    userErrors { field message }
    confirmationUrl
    appSubscription { id status }
  }
}`;

export interface CreateSubscriptionResult {
  confirmationUrl: string;
  subscriptionId: string;
}

/**
 * Start a subscription. Returns Shopify's confirmationUrl — redirect the merchant there
 * to approve the charge; Shopify then sends them to `returnUrl`.
 */
export async function createSubscription(shop: string, token: string, returnUrl: string): Promise<CreateSubscriptionResult> {
  const p = plan();
  const data = await graphql<{
    appSubscriptionCreate: {
      userErrors: Array<{ field: string[]; message: string }>;
      confirmationUrl: string | null;
      appSubscription: { id: string; status: string } | null;
    };
  }>(shop, token, CREATE_SUB_MUTATION, {
    name: p.name,
    returnUrl,
    trialDays: p.trialDays,
    test: billingTestMode(),
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            price: { amount: p.price, currencyCode: p.currency },
            interval: "EVERY_30_DAYS",
          },
        },
      },
    ],
  });

  const result = data.appSubscriptionCreate;
  if (result.userErrors?.length) {
    throw new Error(result.userErrors.map((e) => e.message).join("; "));
  }
  if (!result.confirmationUrl || !result.appSubscription) {
    throw new Error("Shopify did not return a confirmation URL");
  }
  return { confirmationUrl: result.confirmationUrl, subscriptionId: result.appSubscription.id };
}
