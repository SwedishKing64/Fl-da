import { describe, expect, it } from "vitest";
import { describeRecord, readsKnown, recordFrom, recordWord } from "./supplier-record";

describe("a supplier's record", () => {
  it("has none until an import has finished", () => {
    const r = recordFrom("s1", "Burton", [{ products: 12, touched: 3, finished: false }]);
    expect(r.share).toBeNull();
    expect(r.imports).toBe(0);
    expect(recordWord(r).word).toBe("no record yet");
    expect(describeRecord(r)).toContain("no finished import yet");
  });
  it("counts touched products over finished imports only", () => {
    const r = recordFrom("s1", "Burton", [
      { products: 10, touched: 1, finished: true },
      { products: 30, touched: 0, finished: true },
      { products: 50, touched: 50, finished: false },
    ]);
    expect(r.imports).toBe(2);
    expect(r.products).toBe(40);
    expect(r.touched).toBe(1);
    expect(r.share).toBeCloseTo(0.025);
    expect(recordWord(r)).toEqual({ word: "reads clean", tone: "success" });
    expect(describeRecord(r)).toBe("Burton reads clean: over 2 finished imports, 3% of products needed a change after reading. Its paperwork is read on the lighter model, at about half the reading cost.");
    expect(readsKnown(r)).toBe(true);
  });
  it("never counts more touched than built", () => {
    const r = recordFrom("s1", "X", [{ products: 4, touched: 9, finished: true }]);
    expect(r.share).toBe(1);
    expect(recordWord(r).word).toBe("needs a look");
  });
  it("grades the share", () => {
    expect(recordWord(recordFrom("s", "s", [{ products: 100, touched: 15, finished: true }])).word).toBe("mostly clean");
    expect(recordWord(recordFrom("s", "s", [{ products: 100, touched: 40, finished: true }])).word).toBe("needs a look");
  });
});
