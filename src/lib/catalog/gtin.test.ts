import { describe, expect, it } from "vitest";
import { gtinVerdict, isGtin } from "./gtin";

describe("gtin", () => {
  it("accepts real EAN-13, UPC-A, EAN-8 and GTIN-14 codes", () => {
    expect(isGtin("9312345000128")).toBe(true);
    expect(isGtin("036000291452")).toBe(true);
    expect(isGtin("96385074")).toBe(true);
    expect(isGtin("10614141000415")).toBe(true);
    expect(isGtin("'9312345000128")).toBe(true);
  });
  it("rejects a wrong check digit, a wrong length and letters", () => {
    expect(gtinVerdict("9312345000127")).toBe("bad-check-digit");
    expect(gtinVerdict("20251015")).toBe("bad-check-digit");
    expect(gtinVerdict("1234567")).toBe("odd-length");
    expect(gtinVerdict("NW-9340")).toBe("not-digits");
    expect(gtinVerdict("  ")).toBe("empty");
  });
});
