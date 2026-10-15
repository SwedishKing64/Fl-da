import { describe, expect, it } from "vitest";
import { appliedBefore, fingerprint, forgetApplied, rememberApplied, type StorageLike } from "./applied-memory";

function memory(): StorageLike {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}
const line = (over: Partial<{ sku: string; quantity: number | null }> = {}) => ({ sku: "A-1", barcode: "874452900016", title: "Bent 90", quantity: 3, costPrice: 300, rrp: 599, ...over });

describe("remembering an applied delivery", () => {
  it("fingerprints what is on the delivery, not its name or the order of its lines", () => {
    const a = fingerprint([line(), line({ sku: "A-2" })]);
    expect(fingerprint([line({ sku: "A-2" }), line()])).toBe(a);
    expect(fingerprint([line(), line({ sku: "A-2", quantity: 4 })])).not.toBe(a);
    expect(a.endsWith(":2")).toBe(true);
  });
  it("remembers across loads, and forgets when the delivery is undone", () => {
    const store = memory();
    const key = fingerprint([line()]);
    expect(appliedBefore(store, key)).toBeNull();
    rememberApplied(store, key, "order.csv", new Date("2026-10-15T04:19:00Z"));
    expect(appliedBefore(store, key)).toEqual({ filename: "order.csv", at: "2026-10-15T04:19:00.000Z" });
    forgetApplied(store, key);
    expect(appliedBefore(store, key)).toBeNull();
  });
  it("keeps only the newest fifty", () => {
    const store = memory();
    for (let i = 0; i < 60; i++) rememberApplied(store, `k${i}`, `f${i}.csv`, new Date(2026, 0, 1, 0, i));
    expect(appliedBefore(store, "k5")).toBeNull();
    expect(appliedBefore(store, "k59")).not.toBeNull();
  });
});
