import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";
import { kindsSuffix, onlyKinds } from "./narrow-export";

describe("an export cut down to some kinds of product", () => {
  const H = "Handle,Title,Vendor,Type,Tags,Option1 Name,Option1 Value,Variant SKU,Variant Price";
  const csv = [
    H,
    "custom-camber-2027,Custom Camber 2027,Burton,Snowboards,\"2027, burton\",Length,154,W2027CUS154,999.99",
    "custom-camber-2027,,,,,Length,158,W2027CUS158,999.99",
    "freestyle-reflex-2027,Freestyle Re:Flex 2027,Burton,Snowboard Bindings,\"2027, burton\",Size,M,W2027FRM,329.99",
    "freestyle-reflex-2027,,,,,Size,L,W2027FRL,329.99",
    "gore-glove-2027,Gore Glove 2027,Burton,Gloves,\"2027, burton\",Size,M,W2027GGM,99.99",
    "process-flying-v-2027,Process Flying V 2027,Burton,Snowboards,\"2027, burton\",Length,157,W2027PRO157,899.99",
  ].join("\r\n") + "\r\n";

  it("keeps every row of the products of those kinds, and nothing else, under the same headings", () => {
    const out = onlyKinds(csv, ["snowboards"]);
    const grid = parseCsv(out.csv);
    expect(grid[0]).toEqual(H.split(","));
    expect(grid.slice(1).map((r) => r[0])).toEqual(["custom-camber-2027", "custom-camber-2027", "process-flying-v-2027"]);
    expect(out).toMatchObject({ products: 2, rows: 3, kinds: ["Snowboards"] });
    // A variant row carries no Type of its own and still travels with its product.
    expect(grid[2][6]).toBe("158");
  });

  it("takes more than one kind, however it is spelled", () => {
    const out = onlyKinds(csv, ["Snowboards", "snowboard-binding"]);
    expect(out.products).toBe(3);
    expect(out.kinds).toEqual(["Snowboard Bindings", "Snowboards"]);
    expect(parseCsv(out.csv).slice(1).some((r) => r[0] === "gore-glove-2027")).toBe(false);
  });

  it("gives the file back untouched when no kind is asked for or none is found", () => {
    expect(onlyKinds(csv, []).csv).toBe(csv);
    expect(onlyKinds(csv, ["Skis"])).toMatchObject({ products: 0, rows: 0, kinds: [] });
    expect(parseCsv(onlyKinds(csv, ["Skis"]).csv)).toHaveLength(1);
  });

  it("names the file after the kinds", () => {
    expect(kindsSuffix(["Snowboards"])).toBe("-snowboards");
    expect(kindsSuffix(["Snowboards", "Snowboard Bindings"])).toBe("-snowboards-and-snowboard-bindings");
    expect(kindsSuffix([])).toBe("");
  });
});
