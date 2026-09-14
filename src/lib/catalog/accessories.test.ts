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
  /** An accessory is the one place the Type stays the heading; the shelf rides along as a tag. */
  it("makes the Type the accessories heading, not the shelf", () => {
    const gloves = classifyAccessory("Snowboard", "Burton Deluxe GORE-TEX Gloves 2026");
    expect(gloves.type).toBe("Ski Accessories");
    expect(gloves.shelf).toBe("Ski Gloves");
  });

  it("files by what a thing serves, not by who made it", () => {
    // Gloves, goggles, helmets and tuning work for either sport, so they sit under Ski
    // Accessories even when the brand is a snowboard brand.
    for (const name of ["Deluxe Gloves", "M4 Goggles", "Anon Helmet", "Tri-Scraper"]) {
      expect(classifyAccessory("Snowboard", name).type, name).toBe("Ski Accessories");
    }
    // Snowboard-specific things stay on the snowboard side.
    for (const name of ["Gig Snowboard Bag", "Men's Impact Shorts", "Aluminium Stud Stomp Pad"]) {
      expect(classifyAccessory("Snowboard", name).type, name).toBe("Snowboard Accessories");
    }
  });

  it("keeps each sport's own shelf name", () => {
    expect(classifyAccessory("Ski", "Smith Helmet").shelf).toBe("Ski Helmets");
    expect(classifyAccessory("Ski", "M4 Goggles").shelf).toBe("Goggles");
    expect(classifyAccessory("Snowboard", "Gig Snowboard Bag").shelf).toBe("Snowboard Bags");
    expect(classifyAccessory("Snowboard", "Men's Impact Shorts").shelf).toBe("Body Protection");
  });

  it("drops odds and ends onto the Other shelf of the side they came from", () => {
    const tool = classifyAccessory("Snowboard", "Bullet Tool");
    expect(tool.type).toBe("Snowboard Accessories");
    expect(tool.shelf).toBe("Other Snowboard Accessories");
  });

  it("says when it is only filing something as Other for want of anywhere better", () => {
    expect(classifyAccessory("Snowboard", "Bullet Tool").confident).toBe(false);
    expect(classifyAccessory("Snowboard", "Anon Goggles").confident).toBe(true);
  });

  it("knows what serves both sports and what does not", () => {
    expect(sportsFor("gloves", "Snowboard")).toEqual(["Ski", "Snowboard"]);
    expect(sportsFor("goggles", "Ski")).toEqual(["Ski", "Snowboard"]);
    expect(sportsFor("tuning", "Snowboard")).toEqual(["Ski", "Snowboard"]);
    expect(sportsFor("poles", "Ski")).toEqual(["Ski"]);
    // A board bag and a pair of impact shorts are snowboard things, not shared ones.
    expect(sportsFor("bags", "Snowboard")).toEqual(["Snowboard"]);
    expect(sportsFor("body-protection", "Snowboard")).toEqual(["Snowboard"]);
    expect(sportsFor("other", "Snowboard")).toEqual(["Snowboard"]);
  });
});
