/**
 * The plans Flöda is sold on, billed and sized by the fortnight.
 *
 * One place for the landing page, the Clients page and the installed copy to agree on: the price
 * a fortnight, what a fortnight on the plan is meant to hold, and how much reading through Flöda
 * it carries. The invoice and product counts are what a plan is sized for and what the Clients
 * page shows against; nothing stops a shop that goes past them mid-season. The reading allowance
 * is the only hard stop, and it is the vendor's to raise. The Starter plan has no invoice count at
 * all: its allowance is its size, and it is described as the invoices that buys.
 */

/** Every plan starts with this many days free. */
export const TRIAL_DAYS = 14;
/** What a plan is billed and sized by. */
export const PERIOD = "fortnight";
export const PERIOD_DAYS = 14;

/**
 * What reading one product costs through Flöda, in cents: the invoice line read, the product
 * matched and priced, its page fetched and read for the description and pictures. A rough,
 * deliberately high figure from the relay's rates, so the invoices an allowance is said to buy
 * are fewer than it will really stretch to.
 */
export const READING_CENTS_PER_PRODUCT = 10;
/** The invoice the allowances are described in: this many products on it. */
export const TYPICAL_INVOICE_PRODUCTS = 5;

/** How many typical invoices an allowance buys: $20 at 10c a product and 5 products an invoice is 40. */
export function invoicesFor(readingCapCents: number): number {
  return Math.floor(readingCapCents / (READING_CENTS_PER_PRODUCT * TYPICAL_INVOICE_PRODUCTS));
}

export type PlanId = "starter" | "shop" | "unlimited";

export interface Plan {
  id: PlanId;
  name: string;
  /** A fortnight, in dollars. */
  price: number;
  /** Invoices a fortnight the plan is sized for; null is no count. */
  invoices: number | null;
  /** Products a fortnight the plan is sized for; null is no count. */
  products: number | null;
  /** Who may use it, in words. */
  people: string;
  /** Reading through Flöda a fortnight, in cents. */
  readingCapCents: number;
  /** One line under the name. */
  blurb: string;
  /** Held at this price for the first retailers on board. */
  founding?: boolean;
}

export const PLANS: readonly Plan[] = [
  { id: "starter", name: "Starter", price: 49, invoices: null, products: null, people: "One person", readingCapCents: 2000, blurb: "A shop that gets a delivery now and then. No invoice count; sized by its reading." },
  { id: "shop", name: "Shop", price: 149, invoices: 10, products: 500, people: "Everyone on staff", readingCapCents: 6000, blurb: "A specialty shop through a full buying season.", founding: true },
  { id: "unlimited", name: "Unlimited", price: 299, invoices: null, products: null, people: "Everyone on staff", readingCapCents: 15000, blurb: "A big catalogue, many suppliers, no counting." },
];

export const PLAN_IDS = PLANS.map((p) => p.id) as [PlanId, ...PlanId[]];

/** The plan a stored id means. The ids used before there were tiers all meant the Shop plan. */
export function planOf(id: string | null | undefined): Plan {
  return PLANS.find((p) => p.id === id) ?? PLANS[1];
}

export function isPlanId(id: string): id is PlanId {
  return PLANS.some((p) => p.id === id);
}

/** "$20 of reading a fortnight, about 40 invoices of 5 products". */
export function describeReading(p: Plan): string {
  return `$${Math.round(p.readingCapCents / 100)} of reading a ${PERIOD}, about ${invoicesFor(p.readingCapCents)} invoices of ${TYPICAL_INVOICE_PRODUCTS} products`;
}

/**
 * "Up to 10 invoices and about 500 products a fortnight"; for a plan with no count, what its
 * reading buys: "No invoice count; $20 of reading a fortnight, about 40 invoices of 5 products".
 */
export function describePlanSize(p: Plan): string {
  if (p.invoices === null) return p.id === "unlimited" ? "Unlimited invoices and products" : `No invoice count; ${describeReading(p)}`;
  return `Up to ${p.invoices} invoices and about ${p.products} products a ${PERIOD}`;
}

/** Invoices and products built this fortnight. */
export interface PeriodUse {
  invoices: number;
  products: number;
}
/** The old name, for the copies that still send it. */
export type MonthUse = PeriodUse;

/** Past what the plan is sized for, on either count. A plan with no count is never past it. */
export function overPlan(p: Plan, use: PeriodUse): boolean {
  return (p.invoices !== null && use.invoices > p.invoices) || (p.products !== null && use.products > p.products);
}

/** "3 of 10 invoices, 140 of about 500 products this fortnight". */
export function describePeriodUse(p: Plan, use: PeriodUse): string {
  const inv = p.invoices === null ? `${use.invoices} invoice${use.invoices === 1 ? "" : "s"}` : `${use.invoices} of ${p.invoices} invoices`;
  const prod = p.products === null ? `${use.products} products` : `${use.products} of about ${p.products} products`;
  return `${inv}, ${prod} this ${PERIOD}`;
}
/** The old name. */
export const describeMonthUse = describePeriodUse;
