import { describe, expect, it } from "vitest";
import { accessoryKind, classifyAccessory, sportsFor } from "./accessories";

describe("working out what an accessory is", () => {
  it("reads the obvious ones", () => {
    expect(accessoryKind("Anon M4 Toric Goggles")).toBe("goggles");
    expect(accessoryKind("Anon Windham WaveCel Helmet")).toBe("helmets");
    expect(accessoryKind("Men's GORE-TEX Deluxe Gloves 2026")).toBe("gloves");
    expect(accessoryKind("Women's Gondy GORE-TEX Leather Mittens")).toBe("gloves");
    expect(accessoryKind("Gig Snowboard Bag 2026")).toBe("bags");
    expect(accessoryKind("Tri-Scraper")).toBe("tuning");
  });

  /** A wrist guard has a glove shape and is not a glove. */
  it("calls protection protection, even when it looks like a glove", () => {
    expect(accessoryKind("Impact Wrist Guard")).toBe("body-protection");
    expect(accessoryKind("Men's Impact Shorts 2026")).toBe("body-protection");
    expect(accessoryKind("Basic Knee Pad 2026")).toBe("body-protection");
  });

  it("drops the shop's odds and ends into Other, which is what Other is for", () => {
    for (const name of ["Aluminium Stud Stomp Pad", "Bullet Tool", "Cable Lock", "ReFlex Replacement Hardware", "Traditional Lace Snowboard Boot Laces", "Split Stomp Pad"]) {
      expect(accessoryKind(name), name).toBe("other");
    }
  });
});

describe("putting it on the right shelf", () => {
  it("uses each sport's own name for the same thing", () => {
    expect(classifyAccessory("Snowboard", "Anon Helmet").type).toBe("Helmets");
    expect(classifyAccessory("Ski", "Smith Helmet").type).toBe("Ski Helmets");
    expect(classifyAccessory("Snowboard", "Deluxe Gloves").type).toBe("Gloves");
    expect(classifyAccessory("Ski", "Deluxe Gloves").type).toBe("Ski Gloves");
    // Goggles are called the same thing on both sides.
    expect(classifyAccessory("Ski", "M4 Goggles").type).toBe("Goggles");
    expect(classifyAccessory("Snowboard", "M4 Goggles").type).toBe("Goggles");
  });

  it("falls back to Other where a sport has no such shelf", () => {
    // There is no ski-side body protection shelf, and no snowboard-side pole shelf.
    expect(classifyAccessory("Ski", "Impact Shorts").type).toBe("Other Ski Accessories");
    expect(classifyAccessory("Snowboard", "Ski Poles").type).toBe("Other Snowboard Accessories");
    expect(classifyAccessory("Snowboard", "Impact Shorts").type).toBe("Body Protection");
  });

  it("says when it is only filing something as Other for want of anywhere better", () => {
    expect(classifyAccessory("Snowboard", "Bullet Tool").confident).toBe(false);
    expect(classifyAccessory("Snowboard", "Anon Goggles").confident).toBe(true);
  });

  it("knows what serves both sports and what does not", () => {
    expect(sportsFor("gloves", "Snowboard")).toEqual(["Ski", "Snowboard"]);
    expect(sportsFor("goggles", "Ski")).toEqual(["Ski", "Snowboard"]);
    expect(sportsFor("poles", "Ski")).toEqual(["Ski"]);
    expect(sportsFor("other", "Snowboard")).toEqual(["Snowboard"]);
  });
});
