import { describe, expect, it } from "vitest";
import { classifySkiBoot, classifySnowboardBoot } from "./boots";

describe("snowboard boots", () => {
  it("files a Step On boot as Step On", () => {
    for (const name of ["Women's Limelight Step On® Snowboard Boots", "Men's Ruler Step On® Snowboard Boots 2025", "Men's Highshot X Pro Wide Step On® Snowboard Boots"]) {
      expect(classifySnowboardBoot(name).tags, name).toEqual(["step-on-boots"]);
    }
  });

  /** The trap: on a snowboard boot, BOA is a closure and has nothing to do with the binding. */
  it("files a BOA snowboard boot as traditional, the way the shop's own catalogue does", () => {
    for (const name of ["Men's Ruler BOA® Snowboard Boots 2025", "Women's Limelight BOA® Wide Snowboard Boots 2026", "Men's Photon BOA® Wide Snowboard Boots 2026"]) {
      expect(classifySnowboardBoot(name).tags, name).toEqual(["traditional-boots"]);
    }
    expect(classifySnowboardBoot("Men's Ruler BOA® Snowboard Boots").why).toMatch(/ordinary bindings/);
  });

  it("files a lace or speed-lace boot as traditional too", () => {
    expect(classifySnowboardBoot("Ruler Wide").tags).toEqual(["traditional-boots"]);
    expect(classifySnowboardBoot("Moto Speed Zone Boot").tags).toEqual(["traditional-boots"]);
  });
});

describe("ski boots", () => {
  it("treats a plain resort boot as alpine with buckles", () => {
    expect(classifySkiBoot("Atomic Hawx Ultra 100").tags).toEqual(["alpine-boots", "buckle-ski-boots"]);
  });

  it("spots a race boot", () => {
    expect(classifySkiBoot("Atomic Redster CS 130").tags).toContain("race-boots");
    expect(classifySkiBoot("Nordica Dobermann GP 130").tags).toContain("race-boots");
    expect(classifySkiBoot("Atomic Redster CS 130").tags).not.toContain("alpine-boots");
  });

  it("spots a touring boot", () => {
    expect(classifySkiBoot("Atomic Hawx Ultra XTD 120").tags).toContain("touring-boots");
    expect(classifySkiBoot("Tecnica Zero G Tour Pro", "walk mode and tech fittings").tags).toContain("touring-boots");
  });

  it("carries discipline and closure together, since a boot is both", () => {
    const verdict = classifySkiBoot("Atomic Hawx Ultra XTD 130 BOA");
    expect(verdict.tags).toContain("touring-boots");
    expect(verdict.tags).toContain("boa-ski-boots");
    expect(verdict.tags).not.toContain("buckle-ski-boots");
  });

  it("puts a BOA resort boot in both alpine and BOA", () => {
    expect(classifySkiBoot("Salomon S/Pro Supra BOA 120").tags).toEqual(["alpine-boots", "boa-ski-boots"]);
  });

  it("explains itself", () => {
    expect(classifySkiBoot("Atomic Hawx Ultra 100").why).toMatch(/resort boot.*buckles/);
  });
});

describe("hybrid boots", () => {
  /** A Cochise skis the resort and tours, and is sold as both. */
  it("carries the alpine and the touring tag together", () => {
    for (const name of ["Tecnica Cochise 130 DYN", "Dalbello Lupo AX 120", "Salomon Shift Pro 130", "Lange XT3 Tour 130"]) {
      const tags = classifySkiBoot(name).tags;
      expect(tags, name).toContain("alpine-boots");
      expect(tags, name).toContain("touring-boots");
    }
  });

  it("says so, rather than reaching alpine by elimination", () => {
    const verdict = classifySkiBoot("Tecnica Cochise 130");
    expect(verdict.confident).toBe(true);
    expect(verdict.why).toMatch(/hybrid/);
  });

  it("leaves a pure resort or pure touring boot on one shelf", () => {
    expect(classifySkiBoot("Atomic Hawx Magna 130 BOA").tags).not.toContain("touring-boots");
    expect(classifySkiBoot("Scarpa Maestrale RS").tags).not.toContain("alpine-boots");
  });
});
