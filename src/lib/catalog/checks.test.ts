import { describe, expect, it } from "vitest";
import { cleanChecks, describeChecks, modeFor, severityFor } from "./checks";

describe("what stops a push", () => {
  it("has Snaben's default until the shop says otherwise, and only for the checks it may change", () => {
    expect(modeFor("INVALID_BARCODE")).toBe("block");
    expect(modeFor("MISSING_BARCODE")).toBe("warn");
    expect(modeFor("MISSING_BARCODE", { MISSING_BARCODE: "block" })).toBe("block");
    expect(modeFor("AMBIGUOUS_MATCH", { AMBIGUOUS_MATCH: "warn" } as never)).toBeNull();
    expect(severityFor("AMBIGUOUS_MATCH", "error", { AMBIGUOUS_MATCH: "warn" } as never)).toBe("error");
    expect(severityFor("NEGATIVE_PROFIT", "error", { NEGATIVE_PROFIT: "warn" })).toBe("warning");
    expect(severityFor("NO_IMAGE", "warning", { NO_IMAGE: "block" })).toBe("error");
  });
  it("is cleaned to known checks and the two modes", () => {
    expect(cleanChecks({ NO_IMAGE: "block", AMBIGUOUS_MATCH: "warn", MISSING_COST: "maybe" })).toEqual({ NO_IMAGE: "block" });
    expect(cleanChecks("x")).toEqual({});
  });
  it("says each check as a sentence", () => {
    const lines = describeChecks({ MISSING_BARCODE: "block" });
    expect(lines.find((l) => l.code === "MISSING_BARCODE")).toEqual({ code: "MISSING_BARCODE", mode: "block", own: true, sentence: "A variant with no barcode stops a push until it is fixed." });
    expect(lines.find((l) => l.code === "NO_IMAGE")?.sentence).toBe("A product with no picture is a warning: shown, and pushed over with the override.");
  });
});
