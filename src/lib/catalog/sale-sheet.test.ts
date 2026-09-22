/**
 * Reading the shop's sale template without a model.
 *
 * Driven against the real template file, because the point of a template is that the same file
 * reads the same way every time — which is only worth claiming if it is the actual file.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sheetGrids } from "./extract/tabular";
import { looksLikeProductExport, readSaleSheet } from "./sale-sheet";

const TEMPLATE = path.resolve(__dirname, "../../../samples/sale-template.xlsx");

const grid = (rows: string[][]) => [{ name: "Sale", grid: rows }];
const HEAD = ["Year tag", "Category", "Sub-type", "Brands", "Except brands", "Action", "% off", "Off", "Add tags", "Note"];
const row = (...cells: string[]) => [...cells, ...Array(HEAD.length - cells.length).fill("")];

describe("the real template", () => {
  it("is found among the workbook's tabs, past the instructions and the vocabulary", async () => {
    const read = readSaleSheet(await sheetGrids(readFileSync(TEMPLATE)));
    expect(read).not.toBeNull();
    expect(read!.sheet).toBe("Sale");
  });

  it("accounts for every row: an instruction, or a reason it was left alone", async () => {
    const read = readSaleSheet(await sheetGrids(readFileSync(TEMPLATE)))!;
    expect(read.instructions.length + read.ignored.length).toBe(81);
    expect(read.instructions.length).toBe(70);
  });

  it("opens a workbook whose cells carry comments instead of throwing", async () => {
    // The template ships with help text on its headings, and a sheet passed round an office
    // collects more. The reader used to fail outright on them.
    await expect(sheetGrids(readFileSync(TEMPLATE))).resolves.toHaveLength(3);
  });

  it("reads a whole row into one sentence, in the planner's own words", async () => {
    const read = readSaleSheet(await sheetGrids(readFileSync(TEMPLATE)))!;
    expect(read.instructions).toContain("Take 10% off the recommended retail for ski boots tagged 2026 from Atomic or Lange.");
    expect(read.instructions).toContain("Take ski boots tagged 2027 off sale: put the price back to the recommended retail and clear Compare At.");
  });
});

describe("what each column does", () => {
  it("skips a row with no year tag, and says so rather than guessing at every year", () => {
    const read = readSaleSheet(grid([HEAD, row("", "ski poles", "", "", "", "discount", "10")]))!;
    expect(read.instructions).toEqual([]);
    expect(read.ignored[0]).toContain("no year tag");
  });

  it("reads 'all' as every year, which is the one way to mean it", () => {
    const read = readSaleSheet(grid([HEAD, row("all", "ski tuning", "", "", "", "discount", "10")]))!;
    expect(read.instructions[0]).toBe("Take 10% off the recommended retail for ski tuning.");
  });

  it("reads several years as any one of them, never all at once", () => {
    const read = readSaleSheet(grid([HEAD, row("2025, 2999", "headwear", "", "", "", "discount", "20")]))!;
    expect(read.instructions[0]).toContain("tagged any of 2025, 2999");
  });

  it("obeys 'leave alone' by leaving it alone", () => {
    const read = readSaleSheet(grid([HEAD, row("2998", "gloves", "", "", "", "leave alone")]))!;
    expect(read.instructions).toEqual([]);
    expect(read.ignored[0]).toContain("leave alone");
  });

  it("turns 'full price' into taking it off sale", () => {
    const read = readSaleSheet(grid([HEAD, row("2027", "ski boots", "", "", "", "full price")]))!;
    expect(read.instructions[0]).toContain("off sale");
    expect(read.instructions[0]).toContain("clear Compare At");
  });

  it("discounts off the recommended retail unless the row says otherwise", () => {
    const rrp = readSaleSheet(grid([HEAD, row("2026", "helmets", "", "", "", "discount", "20", "RRP")]))!;
    const now = readSaleSheet(grid([HEAD, row("2026", "helmets", "", "", "", "discount", "20", "current price")]))!;
    expect(rrp.instructions[0]).toContain("off the recommended retail");
    expect(now.instructions[0]).toContain("off the current price");
  });

  it("reads a percentage written as a fraction the way the old sheet meant it", () => {
    // 0.3 in their October sheet meant thirty percent off, not nought point three.
    const read = readSaleSheet(grid([HEAD, row("2025", "snow clothing", "", "", "", "discount", "0.3")]))!;
    expect(read.instructions[0]).toContain("Take 30% off");
  });

  it("carries the brands, the exclusions and the extra tags into the sentence", () => {
    const read = readSaleSheet(grid([HEAD, row("2026", "snow clothing", "midlayer", "Burton, Nitro", "Arcteryx", "discount", "30", "RRP", "snow sale")]))!;
    expect(read.instructions[0]).toBe(
      "Take 30% off the recommended retail for snow clothing midlayer tagged 2026 from Burton or Nitro, but leave out anything from Arcteryx. Also add the tag snow sale.",
    );
  });

  it("says a discount with no percentage is incomplete instead of inventing one", () => {
    const read = readSaleSheet(grid([HEAD, row("2026", "helmets", "", "", "", "discount", "")]))!;
    expect(read.instructions).toEqual([]);
    expect(read.ignored[0]).toContain("no percentage");
  });

  it("finds its columns however they are ordered or capitalised", () => {
    const head = ["CATEGORY", "Year Tags", "Percent Off", "Action"];
    const read = readSaleSheet(grid([head, ["helmets", "2026", "20", "discount"]]))!;
    expect(read.instructions[0]).toBe("Take 20% off the recommended retail for helmets tagged 2026.");
  });
});

describe("what it refuses", () => {
  it("knows a Shopify product export is not an instruction sheet", () => {
    expect(looksLikeProductExport(["Handle", "Title", "Body (HTML)", "Vendor"])).toBe(true);
    expect(looksLikeProductExport(HEAD)).toBe(false);
    expect(readSaleSheet(grid([["Handle", "Title", "Body (HTML)"], ["a", "b", "c"]]))).toBeNull();
  });

  it("hands anything that is not the template back to the caller, rather than guessing", () => {
    expect(readSaleSheet(grid([["Notes from the buyer"], ["put the spyder jackets 30% off"]]))).toBeNull();
  });
});
