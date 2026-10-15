import { describe, expect, it } from "vitest";
import { safeNext } from "./open";

describe("where an open copy goes after signing in", () => {
  it("keeps a path on this copy and drops anything else", () => {
    expect(safeNext("/batches/abc/review")).toBe("/batches/abc/review");
    expect(safeNext("/settings?tab=ai")).toBe("/settings?tab=ai");
    expect(safeNext(null)).toBe("/");
    expect(safeNext("")).toBe("/");
    expect(safeNext("https://elsewhere.example/")).toBe("/");
    expect(safeNext("//elsewhere.example/")).toBe("/");
    expect(safeNext("/open?next=/")).toBe("/");
    expect(safeNext("/login")).toBe("/");
  });
});
