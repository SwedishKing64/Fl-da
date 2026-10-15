/**
 * The plans Flöda is sold on, sized by how much paperwork a shop puts through it in a month.
 *
 * One place for the landing page, the Clients page and the installed copy to agree on: the price,
 * what a month on the plan is meant to hold, and how much reading through Flöda it carries. The
 * invoice and product counts are what the plan is sized for and what the Clients page shows
 * against; nothing stops a shop that goes past them mid-season. The reading allowance is the
 * only hard stop, and it is the vendor's to raise.
 */

export type PlanId = "starter" | "shop" | "unlimited";

export interface Plan {
  id: PlanId;
  name: string;
  /** A month, in dollars. */
  price: number;
  /** Invoices a month the plan is sized for; null is unlimited. */
  invoices: number | null;
  /** Products a month the plan is sized for; null is unlimited. */
  products: number | null;
  /** Who may use it, in words. */
  people: string;
  /** Reading through Flöda a month, in cents. */
  readingCapCents: number;
  /** One line under the name. */
  blurb: string;
  /** Held at this price for the first retailers on board. */
  founding?: boolean;
}

export const PLANS: readonly Plan[] = [
  { id: "starter", name: "Starter", price: 49, invoices: 2, products: 100, people: "One person", readingCapCents: 2000, blurb: "A shop that gets a delivery or two a month." },
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

/** "Up to 10 invoices and about 500 products a month", or "Unlimited invoices and products". */
export function describePlanSize(p: Plan): string {
  if (p.invoices === null) return "Unlimited invoices and products";
  return `Up to ${p.invoices} invoices and about ${p.products} products a month`;
}

export interface MonthUse {
  invoices: number;
  products: number;
}

/** Past what the plan is sized for, on either count. */
export function overPlan(p: Plan, use: MonthUse): boolean {
  return (p.invoices !== null && use.invoices > p.invoices) || (p.products !== null && use.products > p.products);
}

/** "3 of 10 invoices, 140 of about 500 products this month". */
export function describeMonthUse(p: Plan, use: MonthUse): string {
  const inv = p.invoices === null ? `${use.invoices} invoice${use.invoices === 1 ? "" : "s"}` : `${use.invoices} of ${p.invoices} invoices`;
  const prod = p.products === null ? `${use.products} products` : `${use.products} of about ${p.products} products`;
  return `${inv}, ${prod} this month`;
}
