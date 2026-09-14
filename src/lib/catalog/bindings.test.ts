import { describe, expect, it } from "vitest";
import { classifyBinding } from "./bindings";

const kind = (...parts: string[]) => classifyBinding(...parts).kind;

describe("telling a touring binding from an alpine one", () => {
  it("files the everyday resort bindings as alpine", () => {
    expect(kind("Marker Griffon 13 ID")).toBe("Alpine Bindings");
    expect(kind("Look Pivot 15 GW")).toBe("Alpine Bindings");
    expect(kind("Salomon Warden MNC 13")).toBe("Alpine Bindings");
    expect(kind("Tyrolia Attack 14 GW")).toBe("Alpine Bindings");
    expect(kind("Head Protector PR 13")).toBe("Alpine Bindings");
  });

  it("files pin and tech bindings as touring", () => {
    expect(kind("Dynafit Speed Radical")).toBe("Touring Bindings");
    expect(kind("ATK Raider 12")).toBe("Touring Bindings");
    expect(kind("Marker Alpinist 12")).toBe("Touring Bindings");
    expect(kind("Plum Guide 12 tech binding")).toBe("Touring Bindings");
    expect(kind("Atomic Backland Tour")).toBe("Touring Bindings");
  });

  it("files the hybrids as touring, but flags them for a second look", () => {
    // These tour and ski downhill, so they read as both.
    for (const name of ["Salomon Shift MNC 13", "Marker Duke PT 16", "Marker Kingpin 13", "Fritschi Tecton 13"]) {
      const verdict = classifyBinding(name, "grip walk compatible");
      expect(verdict.kind, name).toBe("Touring Bindings");
      expect(verdict.confident, name).toBe(false);
      expect(verdict.why, name).toMatch(/hybrid/);
    }
  });

  it("reads the description when the name alone says nothing", () => {
    expect(kind("Raider 12", "A lightweight pin binding for ski touring and skimo racing.")).toBe("Touring Bindings");
    expect(kind("Model 500", "A resort binding with a DIN 4-12 release range.")).toBe("Alpine Bindings");
  });

  it("says it does not know rather than guessing", () => {
    const verdict = classifyBinding("Binding 12", "A binding.");
    expect(verdict.kind).toBeUndefined();
    expect(verdict.confident).toBe(false);
    expect(verdict.why).toMatch(/heel frees/);
  });

  it("explains itself so the reasoning can be checked, not just the answer", () => {
    expect(classifyBinding("Dynafit Speed Radical").why).toMatch(/dynafit|speed radical/);
    expect(classifyBinding("Marker Griffon 13").why).toMatch(/griffon/);
  });
});
