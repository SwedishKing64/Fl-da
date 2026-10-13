import { describe, expect, it } from "vitest";
import { applyPlan, bindingPattern } from "./adjust";
import { parseCsv } from "./csv";

/**
 * The mounting charge, on packages written the way the shop's export writes them. Nothing here
 * reads a real file, so it runs anywhere.
 */
describe("the mounting charge on a ski package", () => {
  const H = "Handle,Title,Vendor,Type,Tags,Option1 Name,Option1 Value,Option2 Name,Option2 Value,Option3 Name,Option3 Value,Variant Price,Variant Compare At Price,Status";
  const drill = "mantra-88-2027-inc-marker-griffon-binding-package";
  const system = "experience-80-2026-inc-xpress-11-binding-package";
  const dearer = "omen-team-2027-inc-look-pivot-15-binding-package";
  const csv = [
    H,
    `${drill},Mantra 88 2027 inc Marker Griffon Binding Package,Volkl,Skis,"2027, ski packages",Length,170,Binding Option,Marker Griffon - Black,Binding Fitting,Please Do Not Mount My Bindings,1500.00,2000.00,active`,
    `${drill},,,,,Length,170,Binding Option,Marker Griffon - Black,Binding Fitting,Please Mount My Bindings,1530.00,2040.00,`,
    `${drill},,,,,Length,177,Binding Option,Marker Griffon - Black,Binding Fitting,Please Do Not Mount My Bindings,1500.00,2000.00,`,
    `${drill},,,,,Length,177,Binding Option,Marker Griffon - Black,Binding Fitting,Please Mount My Bindings,1530.00,2040.00,`,
    `${drill},,,,,Length,177,Binding Option,ATK Raider 13 Evo,Binding Fitting,Please Do Not Mount My Bindings,1800.00,,`,
    `${drill},,,,,Length,177,Binding Option,ATK Raider 13 Evo,Binding Fitting,Please Mount My Bindings,1840.00,,`,
    `${system},Experience 80 2026 inc Xpress 11 Binding Package,Rossignol,Skis,"2026, ski packages",Length,158,Binding Fitting,Please Do Not Mount My Bindings,,,999.99,,active`,
    `${system},,,,,Length,158,Binding Fitting,Please Mount My Bindings,,,1029.99,,`,
    `${dearer},Omen Team 2027 inc Look Pivot 15 Binding Package,Armada,Skis,"2027, ski packages",Length,188,Binding Fitting,Please Do Not Mount My Bindings,,,2599.99,3899.99,active`,
    `${dearer},,,,,Length,188,Binding Fitting,Please Mount My Bindings,,,2639.99,3959.99,`,
  ].join("\r\n") + "\r\n";
  const cell = (out: string, handle: string, fitting: RegExp, column: string, length = "") => {
    const grid = parseCsv(out);
    const ix = new Map(grid[0].map((h, i) => [h, i]));
    const row = grid.slice(1).find((r) => r[ix.get("Handle")!] === handle && (!length || r[ix.get("Option1 Value")!] === length) && [r[ix.get("Option2 Value")!], r[ix.get("Option3 Value")!]].some((v) => fitting.test(v ?? "")));
    return row?.[ix.get(column)!] ?? "";
  };

  it("prices the mounted variant the charge over its unmounted twin, keeping the sale it is on", () => {
    const out = applyPlan(csv, { scope: { fitting: "package" }, operations: [{ kind: "setMountPrice", amount: 59, bindings: "drill" }] });
    expect(out.refused).toBeUndefined();
    // 25% off stays 25% off: Compare At up by the full 59, the price by three quarters of it.
    expect(cell(out.csv, drill, /^Please Mount/, "Variant Compare At Price", "170")).toBe("2059.00");
    expect(cell(out.csv, drill, /^Please Mount/, "Variant Price", "170")).toBe("1544.25");
    expect(cell(out.csv, drill, /Do Not Mount/, "Variant Price", "170")).toBe("1500.00");
    // A touring binding on the same ski, not on sale: the full amount on the price, no Compare At invented.
    const grid = parseCsv(out.csv); const ix = new Map(grid[0].map((h, i) => [h, i]));
    const atk = grid.slice(1).find((r) => r[ix.get("Option2 Value")!] === "ATK Raider 13 Evo" && /^Please Mount/.test(r[ix.get("Option3 Value")!]))!;
    expect(atk[ix.get("Variant Price")!]).toBe("1859.00");
    expect(atk[ix.get("Variant Compare At Price")!]).toBe("");
    // The system binding was not asked for.
    expect(cell(out.csv, system, /^Please Mount/, "Variant Price")).toBe("1029.99");
    // A race package charging $60 on the recommended retail comes down to the $59 as well, and
    // its one-third discount is re-applied to the new recommended retail.
    expect(cell(out.csv, dearer, /^Please Mount/, "Variant Compare At Price")).toBe("3958.99");
    expect(cell(out.csv, dearer, /^Please Mount/, "Variant Price")).toBe("2639.32");
    expect(new Set(out.changes.map((c) => c.handle))).toEqual(new Set([drill, dearer]));
  });

  it("mirrors a twin that is not on sale: the mounted variant's own sale goes, its stale recommended retail with it, and the move is said", () => {
    // The Madshus from the shop: Do Not Mount at 1179 with no recommended retail, Please Mount on its
    // own 10% sale. Setting the charge made its price 1238 and left a retail of 1233.95 under it.
    const madshus = "madshus-annum-boot-and-nnnbc-binding-package";
    const file = [
      H,
      `${madshus},Annum Boot and NNNBC Binding Package,Madshus,Skis,"ski packages",Length,185,Binding Fitting,Please Do Not Mount My Bindings,Size,42,1179.00,,active`,
      `${madshus},,,,,Length,185,Binding Fitting,Please Mount My Bindings,Size,42,1110.56,1233.95,`,
    ].join("\r\n") + "\r\n";
    const out = applyPlan(file, { scope: { fitting: "package" }, operations: [{ kind: "setMountPrice", amount: 59, bindings: "drill" }] });
    expect(cell(out.csv, madshus, /^Please Mount/, "Variant Price")).toBe("1238.00");
    expect(cell(out.csv, madshus, /^Please Mount/, "Variant Compare At Price")).toBe("");
    expect(out.changes.map((c) => [c.column, c.before, c.after])).toEqual([["Variant Price", "1110.56", "1238.00"], ["Variant Compare At Price", "1233.95", ""]]);
    expect(out.warnings.join(" ")).toMatch(/1 mounted variant moved by more than the mounting charge itself.*Annum Boot and NNNBC Binding Package \(185 · Please Mount My Bindings · 42: 1110.56 to 1238.00\)/);
  });

  it("takes a product with a mounting option as a package whatever its title says", () => {
    // Two Elan packages in the shop are titled by the ski alone, and the package scope passed them by.
    const elan = "wingman-82cti";
    const file = [
      H,
      `${elan},Wingman 82CTI,Elan,Skis,"ski packages",Length,166,Binding Option,FX EMX 12.0,Binding Fitting,Please Do Not Mount My Bindings,937.49,1249.99,active`,
      `${elan},,,,,Length,166,Binding Option,FX EMX 12.0,Binding Fitting,Please Mount My Bindings,1226.24,1634.99,`,
    ].join("\r\n") + "\r\n";
    const out = applyPlan(file, { scope: { fitting: "package" }, operations: [{ kind: "setMountPrice", amount: 49, bindings: "system" }] });
    expect(out.matched).toBe(1);
    expect(cell(out.csv, elan, /^Please Mount/, "Variant Compare At Price")).toBe("1298.99");
    expect(cell(out.csv, elan, /^Please Mount/, "Variant Price")).toBe("974.24");
    expect(applyPlan(file, { scope: { fitting: "flat" }, operations: [{ kind: "setMountPrice", amount: 49 }] }).matched).toBe(0);
  });

  it("leaves a dearer charge alone when told to only increase", () => {
    const out = applyPlan(csv, { scope: { fitting: "package" }, operations: [{ kind: "setMountPrice", amount: 59, bindings: "drill", raiseOnly: true }] });
    expect(cell(out.csv, dearer, /^Please Mount/, "Variant Compare At Price")).toBe("3959.99");
    expect(out.changes.every((c) => c.handle === drill)).toBe(true);
  });

  it("includes the packages whose binding the instruction named, whatever kind they would count as", () => {
    // The shop's list: flat bindings it fits the dear way, said by name with the kind.
    const nx = "experience-78-inc-look-nx-10-binding-package";
    const k = "hero-elite-st-ti-k-inc-spx-14-binding-package";
    const file = [
      H,
      `${nx},Experience 78 2026 inc Look NX 10 Binding Package,Rossignol,Skis,"ski packages",Length,160,Binding Fitting,Please Do Not Mount My Bindings,,,899.00,,active`,
      `${nx},,,,,Length,160,Binding Fitting,Please Mount My Bindings,,,929.00,,`,
      `${k},Hero Elite ST Ti K 2026 inc SPX 14 Binding Package,Rossignol,Skis,"ski packages",Length,167,Binding Option,Look SPX 14 Konect GW,Binding Fitting,Please Do Not Mount My Bindings,1699.00,,active`,
      `${k},,,,,Length,167,Binding Option,Look SPX 14 Konect GW,Binding Fitting,Please Mount My Bindings,1729.00,,`,
      `${system},Experience 80 2026 inc Xpress 11 Binding Package,Rossignol,Skis,"ski packages",Length,158,Binding Fitting,Please Do Not Mount My Bindings,,,999.99,,active`,
      `${system},,,,,Length,158,Binding Fitting,Please Mount My Bindings,,,1029.99,,`,
    ].join("\r\n") + "\r\n";
    // Named alone: the named ones and nothing else, however the classifier places them.
    const only = applyPlan(file, { scope: { fitting: "package" }, operations: [{ kind: "setMountPrice", amount: 59, named: ["NX10", "SPX 14"] }] });
    expect(cell(only.csv, nx, /^Please Mount/, "Variant Price")).toBe("958.00");
    expect(cell(only.csv, k, /^Please Mount/, "Variant Price")).toBe("1758.00");
    expect(cell(only.csv, system, /^Please Mount/, "Variant Price")).toBe("1029.99");
    // Named on top of a kind: "all drill mount bindings, including SPX 14" takes the Konect one in too.
    const both = applyPlan(file, { scope: { fitting: "package" }, operations: [{ kind: "setMountPrice", amount: 59, bindings: "drill", named: ["Marker FDT 7", "SPX 14"] }] });
    expect(cell(both.csv, nx, /^Please Mount/, "Variant Price")).toBe("958.00");
    expect(cell(both.csv, k, /^Please Mount/, "Variant Price")).toBe("1758.00");
    expect(cell(both.csv, system, /^Please Mount/, "Variant Price")).toBe("1029.99");
    // A name that fits nothing in the file is simply not found.
    const none = applyPlan(file, { scope: { fitting: "package" }, operations: [{ kind: "setMountPrice", amount: 59, named: ["Freeflex 11"] }] });
    expect(none.changes).toEqual([]);
  });

  it("matches a named binding the way the shop writes it", () => {
    const hits = (name: string, texts: string[]) => texts.filter((t) => bindingPattern(name).test(t));
    expect(hits("NX7", ["Look NX 7 GW", "NX7 B83", "Look NX 10", "NX 70"])).toEqual(["Look NX 7 GW", "NX7 B83"]);
    expect(hits("M7.0", ["Marker M7.0 FDT", "M 7.0 Volkl Flair", "Marker M12.0 FDT", "EMX 7.0"])).toEqual(["Marker M7.0 FDT", "M 7.0 Volkl Flair"]);
    expect(hits("SPX 12", ["Look SPX12 GW - Black", "SPX 12 Konect", "SPX 120", "SPX 1"])).toEqual(["Look SPX12 GW - Black", "SPX 12 Konect"]);
    expect(hits("Marker FDT 7", ["Marker FDT 7.0", "FDT 7 Volkl", "Marker FDT 10"])).toEqual(["Marker FDT 7.0", "FDT 7 Volkl"]);
    expect(hits("Freeflex 11", ["Head Freeflex 11 GW", "Freeflex ST 14"])).toEqual(["Head Freeflex 11 GW"]);
    expect(bindingPattern("").test("anything")).toBe(false);
  });

  it("does the skis that come with a binding when told, and leaves the drilled ones", () => {
    const out = applyPlan(csv, { scope: { fitting: "package" }, operations: [{ kind: "setMountPrice", amount: 49, bindings: "system" }] });
    expect(out.refused).toBeUndefined();
    expect(cell(out.csv, system, /^Please Mount/, "Variant Price")).toBe("1048.99");
    expect(cell(out.csv, drill, /^Please Mount/, "Variant Price", "170")).toBe("1530.00");
    expect(out.changes.map((c) => c.handle)).toEqual([system]);
  });
});
