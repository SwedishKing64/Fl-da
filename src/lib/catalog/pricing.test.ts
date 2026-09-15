import { describe, expect, it } from "vitest";
import {
  allocateFreight,
  applyRounding,
  exGstCostAud,
  priceVariant,
  selectRule,
  summariseBatch,
  targetExGstPrice,
  type PricingRuleLike,
} from "./pricing";
import { parseMoney, roundCents } from "./money";

const settings = { gstRate: 0.1, pricesIncludeGst: true, minMarginPct: 20 };

const margin40: PricingRuleLike = {
  id: "r1", name: "Skis 40% margin", scope: "CATEGORY", matchValue: "skis",
  mode: "MARGIN", percent: 40, roundTo: "NONE", priority: 0, active: true,
};
const keystone: PricingRuleLike = {
  id: "r2", name: "Accessories keystone", scope: "CATEGORY", matchValue: "accessories",
  mode: "MARKUP", percent: 100, roundTo: "0.99", priority: 0, active: true,
};

describe("GST back-out", () => {
  it("treats GST-inclusive AUD cost as an input tax credit (ex-GST cost)", () => {
    expect(roundCents(exGstCostAud(110, "INCLUSIVE", 1, 0.1))).toBe(100);
    expect(exGstCostAud(100, "EXCLUSIVE", 1, 0.1)).toBe(100);
    expect(exGstCostAud(100, "NONE", 1, 0.1)).toBe(100);
  });

  it("converts foreign currency before any markup", () => {
    expect(roundCents(exGstCostAud(100, "NONE", 1.52, 0.1))).toBe(152);
  });

  it("profit is ex-GST revenue minus landed cost, not retail minus cost", () => {
    // Landed $300, 40% margin => ex-GST sell 500, retail 550 inc GST.
    const r = priceVariant(
      { costPrice: 300, gstTreatment: "EXCLUSIVE", fxRateToAud: 1, freightPerUnitAud: 0, quantity: 1, retailOverride: 550 },
      settings,
    );
    expect(r.landedCostAud).toBe(300);
    expect(r.retailPrice).toBe(550);
    expect(r.exGstRevenue).toBe(500);
    expect(r.gstComponent).toBe(50);
    expect(r.profitPerUnit).toBe(200); // NOT 250
    expect(r.marginPct).toBe(40);
    expect(r.markupPct).toBe(66.7);
    expect(r.lowMargin).toBe(false);
  });

  it("supports GST-exclusive storefront pricing", () => {
    const r = priceVariant(
      { costPrice: 300, gstTreatment: "EXCLUSIVE", fxRateToAud: 1, freightPerUnitAud: 0, quantity: 1, retailOverride: 500 },
      { ...settings, pricesIncludeGst: false },
    );
    expect(r.retailPrice).toBe(500);
    expect(r.exGstRevenue).toBe(500);
    expect(r.gstComponent).toBe(50);
    expect(r.profitPerUnit).toBe(200);
    expect(r.lineRevenueIncGst).toBe(550);
  });
});

describe("markup vs margin", () => {
  it("keystone markup doubles landed cost ex-GST", () => {
    expect(targetExGstPrice(50, keystone)).toBe(100);
    expect(targetExGstPrice(60, margin40)).toBe(100);
  });

  it("rejects margin >= 100%", () => {
    expect(() => targetExGstPrice(10, { ...margin40, percent: 100 })).toThrow();
  });
});

describe("rounding", () => {
  it("rounds up to price endings so target margin is never undercut", () => {
    expect(applyRounding(649.23, "0.99")).toBe(649.99);
    expect(applyRounding(649.99, "0.99")).toBe(649.99);
    expect(applyRounding(650.0, "0.99")).toBe(650.99);
    expect(applyRounding(12.3, "0.95")).toBe(12.95);
    expect(applyRounding(12.96, "0.95")).toBe(13.95);
    expect(applyRounding(12.01, "1.00")).toBe(13);
    expect(applyRounding(12.0, "1.00")).toBe(12);
    expect(applyRounding(101, "5.00")).toBe(105);
    expect(applyRounding(101.456, "NONE")).toBe(101.46);
  });

  it("prices a keystone accessory to end in .99", () => {
    const r = priceVariant(
      { costPrice: 20, gstTreatment: "EXCLUSIVE", fxRateToAud: 1, freightPerUnitAud: 0, quantity: 3, retailOverride: 44.99 },
      settings,
    );
    // keystone on a $20 cost gives ex-GST 40 => 44.00 inc GST => 44.99
    expect(r.retailPrice).toBe(44.99);
    expect(r.exGstRevenue).toBe(40.9);
    expect(r.profitPerUnit).toBe(20.9);
    expect(r.lineProfit).toBe(62.7);
    expect(r.lineRevenueIncGst).toBe(134.97);
  });
});

describe("override, freight, warnings", () => {
  it("recalculates profit from the retail price it is given", () => {
    const r = priceVariant(
      { costPrice: 300, gstTreatment: "EXCLUSIVE", fxRateToAud: 1, freightPerUnitAud: 0, quantity: 1, retailOverride: 399 },
      settings,
    );
    expect(r.retailPrice).toBe(399);
    expect(r.exGstRevenue).toBe(362.73);
    expect(r.profitPerUnit).toBe(62.73);
    expect(r.marginPct).toBe(17.3);
    expect(r.lowMargin).toBe(true);
    expect(r.negativeProfit).toBe(false);
  });

  it("flags negative profit when the retail is below landed cost", () => {
    const r = priceVariant(
      { costPrice: 300, gstTreatment: "EXCLUSIVE", fxRateToAud: 1, freightPerUnitAud: 0, quantity: 1, retailOverride: 200 },
      settings,
    );
    expect(r.profitPerUnit).toBe(-118.18);
    expect(r.negativeProfit).toBe(true);
  });

  it("adds freight into landed cost", () => {
    const r = priceVariant(
      { costPrice: 100, gstTreatment: "NONE", fxRateToAud: 1.5, freightPerUnitAud: 10, quantity: 1, retailOverride: 293.33 },
      settings,
    );
    expect(r.landedCostAud).toBe(160);
    expect(r.retailPrice).toBe(293.33);
    expect(r.exGstRevenue).toBe(266.66);
    expect(r.profitPerUnit).toBe(106.66);
  });

  it("allocates freight per unit or by value", () => {
    const lines = [
      { id: "a", quantity: 2, exGstCostAud: 100 },
      { id: "b", quantity: 2, exGstCostAud: 300 },
    ];
    expect(allocateFreight(40, "PER_UNIT", lines)).toEqual({ a: 10, b: 10 });
    expect(allocateFreight(40, "BY_VALUE", lines)).toEqual({ a: 5, b: 15 });
    expect(allocateFreight(0, "BY_VALUE", lines)).toEqual({ a: 0, b: 0 });
  });
});

describe("rule selection", () => {
  const rules: PricingRuleLike[] = [
    { ...margin40, id: "d", scope: "DEFAULT", matchValue: "", name: "default" },
    margin40,
    { ...margin40, id: "b", scope: "BRAND", matchValue: "Atomic", name: "atomic" },
    { ...margin40, id: "p", scope: "PRODUCT", matchValue: "AA0029", name: "product" },
    { ...margin40, id: "off", scope: "PRODUCT", matchValue: "AA0029", name: "inactive", active: false, priority: 99 },
  ];
  it("prefers product over brand over category over default", () => {
    expect(selectRule(rules, { category: "skis", brand: "Atomic", sku: "AA0029-172", modelCode: "AA0029" })?.name).toBe("product");
    expect(selectRule(rules, { category: "skis", brand: "atomic", sku: "x", modelCode: "y" })?.name).toBe("atomic");
    expect(selectRule(rules, { category: "Skis", brand: "Volkl", sku: "x", modelCode: "y" })?.name).toBe("Skis 40% margin");
    expect(selectRule(rules, { category: "boots", brand: "Volkl", sku: "x", modelCode: "y" })?.name).toBe("default");
    expect(selectRule([], { category: "boots", brand: "", sku: "", modelCode: "" })).toBeNull();
  });
});

describe("batch summary", () => {
  it("sums GST-inclusive revenue, GST, landed cost and true net profit", () => {
    const a = priceVariant({ costPrice: 300, gstTreatment: "EXCLUSIVE", fxRateToAud: 1, freightPerUnitAud: 0, quantity: 2, retailOverride: 550 }, settings);
    const b = priceVariant({ costPrice: 20, gstTreatment: "EXCLUSIVE", fxRateToAud: 1, freightPerUnitAud: 0, quantity: 3, retailOverride: 44.99 }, settings);
    const s = summariseBatch([
      { quantity: 2, result: a },
      { quantity: 3, result: b },
    ]);
    expect(s.units).toBe(5);
    expect(s.variants).toBe(2);
    expect(s.totalRetailIncGst).toBe(550 * 2 + 44.99 * 3); // 1234.97
    expect(s.totalGst).toBe(roundCents(50 * 2 + 4.09 * 3));
    expect(s.totalLandedCost).toBe(660);
    expect(s.totalExGstRevenue).toBe(roundCents(500 * 2 + 40.9 * 3));
    expect(s.totalNetProfit).toBe(roundCents(1122.7 - 660));
    expect(s.averageMarginPct).toBe(41.2);
  });
});

describe("money parsing", () => {
  it("handles currency symbols, separators and EU formats", () => {
    expect(parseMoney("$1,234.50")).toBe(1234.5);
    expect(parseMoney("AUD 99.00")).toBe(99);
    expect(parseMoney("1.234,50")).toBe(1234.5);
    expect(parseMoney("(12.00)")).toBe(-12);
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("n/a")).toBeNull();
    expect(parseMoney(12)).toBe(12);
  });
});

describe("the strikethrough price", () => {
  const settings = { gstRate: 0.1, pricesIncludeGst: true, minMarginPct: 25 };
  const rule = { id: "r", name: "40%", scope: "DEFAULT" as const, matchValue: "", mode: "MARGIN" as const, percent: 40, roundTo: "0.99", priority: 0, active: true };
  const base = { costPrice: 500, gstTreatment: "EXCLUSIVE" as const, fxRateToAud: 1, freightPerUnitAud: 0, quantity: 1, rule };

  it("writes the recommended retail into compare-at when the product is discounted", () => {
    // What every one of the 1657 variant rows in the shop's exports that carries a compare-at does:
    // compare above price, never equal, never below.
    const r = priceVariant({ ...base, retailOverride: 999.95, discountPct: 30 }, settings);
    expect(r.retailPrice).toBeCloseTo(699.97, 2);
    expect(r.compareAtPrice).toBeCloseTo(999.95, 2);
    expect(r.compareAtPrice!).toBeGreaterThan(r.retailPrice);
  });

  it("leaves compare-at empty when nothing is marked down", () => {
    expect(priceVariant({ ...base, retailOverride: 999.95, discountPct: null }, settings).compareAtPrice).toBeNull();
    expect(priceVariant({ ...base, retailOverride: 999.95, discountPct: 0 }, settings).compareAtPrice).toBeNull();
  });

  it("has nothing to mark down when the invoice carried no recommended retail", () => {
    // There is no priced-up figure to discount from, because nothing prices anything up.
    const cut = priceVariant({ ...base, retailOverride: null, discountPct: 20 }, settings);
    expect(cut.retailPrice).toBe(0);
    expect(cut.compareAtPrice).toBeNull();
    expect(cut.missingRetail).toBe(true);
  });

  it("prices the profit off what the shop actually takes, not the compare-at", () => {
    const r = priceVariant({ ...base, retailOverride: 1000, discountPct: 50 }, settings);
    expect(r.retailPrice).toBeCloseTo(500, 2);
    expect(r.exGstRevenue).toBeCloseTo(454.55, 1);
    expect(r.profitPerUnit).toBeCloseTo(-45.45, 1); // cost 500 ex-GST against 454.55 taken
  });
});


describe("the price is the supplier's recommended retail", () => {
  const settings = { gstRate: 0.1, pricesIncludeGst: true, minMarginPct: 25 };
  const base = { costPrice: 500, gstTreatment: "EXCLUSIVE" as const, fxRateToAud: 1, freightPerUnitAud: 0, quantity: 1 };

  it("uses the recommended retail whatever margin it leaves", () => {
    // A thin one and a fat one. Neither is improved on: the shop quoted it, so it is the price.
    expect(priceVariant({ ...base, retailOverride: 505 }, settings).retailPrice).toBe(505);
    expect(priceVariant({ ...base, retailOverride: 2500 }, settings).retailPrice).toBe(2500);
  });

  it("reports the margin without touching the price", () => {
    const thin = priceVariant({ ...base, retailOverride: 505 }, settings);
    expect(thin.retailPrice).toBe(505);
    expect(thin.lowMargin).toBe(true); // said out loud, and left alone
    expect(thin.marginPct).toBeLessThan(25);
  });

  it("gives no price at all when no recommended retail is known", () => {
    const none = priceVariant({ ...base, retailOverride: null }, settings);
    expect(none.retailPrice).toBe(0);
    expect(none.missingRetail).toBe(true);
    // Which the validator blocks the export on, rather than shipping an invented number.
    expect(none.ruleName).toBeNull();
  });

  it("treats a zero recommended retail as no price, not a free product", () => {
    expect(priceVariant({ ...base, retailOverride: 0 }, settings).missingRetail).toBe(true);
  });
});
