import { describe, expect, it } from "vitest";
import { describeMonthUse, describePlanSize, overPlan, planOf, PLANS } from "./plans";

describe("the plans", () => {
  it("are priced by the month's paperwork, and the old ids mean the Shop plan", () => {
    expect(PLANS.map((p) => p.price)).toEqual([49, 149, 299]);
    expect(planOf("founding").id).toBe("shop");
    expect(planOf("standard").id).toBe("shop");
    expect(planOf("trial").id).toBe("shop");
    expect(planOf("starter").id).toBe("starter");
    expect(planOf(undefined).id).toBe("shop");
  });
  it("say what a month holds", () => {
    expect(describePlanSize(planOf("starter"))).toBe("Up to 2 invoices and about 100 products a month");
    expect(describePlanSize(planOf("unlimited"))).toBe("Unlimited invoices and products");
  });
  it("know when a month has gone past the plan, and never on Unlimited", () => {
    expect(overPlan(planOf("starter"), { invoices: 3, products: 40 })).toBe(true);
    expect(overPlan(planOf("starter"), { invoices: 2, products: 140 })).toBe(true);
    expect(overPlan(planOf("shop"), { invoices: 10, products: 500 })).toBe(false);
    expect(overPlan(planOf("unlimited"), { invoices: 90, products: 9000 })).toBe(false);
    expect(describeMonthUse(planOf("shop"), { invoices: 3, products: 140 })).toBe("3 of 10 invoices, 140 of about 500 products this month");
    expect(describeMonthUse(planOf("unlimited"), { invoices: 1, products: 9 })).toBe("1 invoice, 9 products this month");
  });
});
