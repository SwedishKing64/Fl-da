import { describe, expect, it } from "vitest";
import { applyPlan } from "./adjust";

// A two-product export written by hand: one jacket with a sale already on it, one without.
const CSV = [
  "Handle,Title,Option1 Name,Option1 Value,Variant Price,Variant Compare At Price,Tags",
  "cyclic-jacket,Cyclic Jacket,Size,M,449.00,499.00,snow jackets",
  "cyclic-jacket,,Size,L,449.00,499.00,",
  "exos-58,Exos 58,Size,S/M,459.00,,hiking packs",
].join("\r\n") + "\r\n";

describe("the preview shows both prices on every change", () => {
  it("carries the variant's price and compare-at, before and after, on each change", () => {
    const out = applyPlan(CSV, { scope: {}, operations: [{ kind: "discount", percent: 20, from: "rrp" }] });
    const price = out.changes.filter((c) => c.column === "Variant Price");
    expect(price.length).toBeGreaterThan(0);
    const jacket = price.find((c) => c.handle === "cyclic-jacket")!;
    expect(jacket.prices).toEqual({ price: { before: "449.00", after: "399.20" }, compareAt: { before: "499.00", after: "499.00" } });
    // A product with no compare-at gets one from its price, and the line says so.
    const pack = out.changes.find((c) => c.handle === "exos-58" && c.column === "Variant Price")!;
    expect(pack.prices?.price.before).toBe("459.00");
    expect(pack.prices?.compareAt.after).not.toBe("");
  });

  it("shows the prices on a change to another column too", () => {
    const out = applyPlan(CSV, { scope: {}, operations: [{ kind: "addTags", tags: ["sale"] }] });
    const tag = out.changes.find((c) => c.handle === "cyclic-jacket" && c.column === "Tags")!;
    expect(tag.prices).toEqual({ price: { before: "449.00", after: "449.00" }, compareAt: { before: "499.00", after: "499.00" } });
  });
});
