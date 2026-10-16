import { describe, expect, it } from "vitest";
import { describePeriodUse, describePlanSize, describeReading, invoicesFor, overPlan, planOf, PLANS } from "./plans";

describe("the plans", () => {
  it("are the own-key plan by the month and three by the fortnight, and the old ids mean the Shop plan", () => {
    expect(PLANS.map((p) => [p.id, p.price, p.period])).toEqual([["ownkey", 20, "month"], ["starter", 49, "fortnight"], ["shop", 149, "fortnight"], ["unlimited", 299, "fortnight"]]);
    expect(planOf("founding").id).toBe("shop");
    expect(planOf("standard").id).toBe("shop");
    expect(planOf("trial").id).toBe("shop");
    expect(planOf("starter").id).toBe("starter");
    expect(planOf(undefined).id).toBe("shop");
  });
  it("say what a fortnight holds", () => {
    expect(describePlanSize(planOf("ownkey"))).toBe("Unlimited invoices and products; reading with your own key");
    expect(planOf("ownkey")).toMatchObject({ price: 20, period: "month", reading: "own-key", readingCapCents: 0 });
    expect(planOf("nonsense").id).toBe("shop");
    expect(describePlanSize(planOf("starter"))).toBe("No invoice count; $20 of reading a fortnight, about 40 invoices of 5 products");
    expect(describePlanSize(planOf("shop"))).toBe("Up to 10 invoices and about 500 products a fortnight");
    expect(describeReading(planOf("shop"))).toBe("$60 of reading a fortnight, about 120 invoices of 5 products");
    expect(invoicesFor(2000)).toBe(40);
    expect(describePlanSize(planOf("unlimited"))).toBe("Unlimited invoices and products");
  });
  it("know when a fortnight has gone past the plan, and never on a plan with no count", () => {
    expect(overPlan(planOf("starter"), { invoices: 30, products: 400 })).toBe(false);
    expect(overPlan(planOf("shop"), { invoices: 11, products: 40 })).toBe(true);
    expect(overPlan(planOf("shop"), { invoices: 10, products: 500 })).toBe(false);
    expect(overPlan(planOf("unlimited"), { invoices: 90, products: 9000 })).toBe(false);
    expect(describePeriodUse(planOf("shop"), { invoices: 3, products: 140 })).toBe("3 of 10 invoices, 140 of about 500 products this fortnight");
    expect(describePeriodUse(planOf("unlimited"), { invoices: 1, products: 9 })).toBe("1 invoice, 9 products this fortnight");
  });
});
