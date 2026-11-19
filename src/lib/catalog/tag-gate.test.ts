import { describe, expect, it } from "vitest";
import { gateFrom, partitionTags } from "./tag-gate";

describe("gateFrom", () => {
  it("knows the shop's tags whatever their spelling", () => {
    const gate = gateFrom(["Skis", "all-mountain", "2027"]);
    expect(gate.known("skis")).toBe(true);
    expect(gate.known("All Mountain")).toBe(true);
    expect(gate.known("freeride")).toBe(false);
  });

  it("lets through a tag the rules work out per product", () => {
    const gate = gateFrom(["skis"]);
    expect(gate.known("2028")).toBe(true);
    expect(gate.known("mens")).toBe(true);
  });

  it("stands open until the shop has taught it something", () => {
    const gate = gateFrom([], false);
    expect(gate.closed).toBe(false);
    expect(gate.known("anything at all")).toBe(true);
  });
});

describe("partitionTags", () => {
  it("keeps the shop's tags and puts the rest forward", () => {
    const gate = gateFrom(["skis", "all-mountain"]);
    expect(partitionTags(["skis", "freeride", "All-Mountain", "", "twin-tip"], gate)).toEqual({ kept: ["skis", "All-Mountain"], proposed: ["freeride", "twin-tip"] });
  });

  it("always keeps what a rule the shop set adds", () => {
    const gate = gateFrom(["skis"]);
    expect(partitionTags(["skis", "touring"], gate, ["touring"]).proposed).toEqual([]);
  });
});
