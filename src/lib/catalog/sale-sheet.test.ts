/**
 * Reading the shop's sale template without a model.
 *
 * Driven against the real template file, because the point of a template is that the same file
 * reads the same way every time — which is only worth claiming if it is the actual file.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sheetGrids } from "./extract/tabular";
import { looksLikeProductExport, readFitting, readSaleSheet } from "./sale-sheet";

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
    // The midlayer, pole, apres and sock rows have no year: they are every year (2026-10-26).
    expect(read.instructions.length).toBe(77);
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
  it("reads a row with no year tag as every year, as the shop writes its untagged shelves", () => {
    // Socks, poles, apres and midlayers carry no year, and the sheet leaves the year blank for
    // them. Skipping those rows meant their sale never went on (2026-10-26).
    const read = readSaleSheet(grid([HEAD, row("", "ski poles", "", "", "", "discount", "10")]))!;
    expect(read.instructions).toEqual(["Take 10% off the recommended retail for ski poles."]);
    expect(read.ignored).toEqual([]);
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

/**
 * Their own sheet, rather than the template it was supposed to become.
 *
 * Three seasons of editing in place left it with its headings spread over two rows, the brand
 * column headed with the month somebody last touched it, the discount column headed with the name
 * of the sale, and the column that says flat or package headed with nothing at all. None of that
 * is unusual for a working spreadsheet, and all of it meant the sheet was not recognised as the
 * template — so the whole thing went to the model, which is given the words and not the columns.
 */
const THEIRS = "/root/.claude/uploads/94fb8bfb-35a9-5176-afe9-8fcc0dec9eb3/9ff42c55-2026_October_FINAL_SNOW_SALE_bulk_upload_.xlsx";

describe.skipIf(!existsSync(THEIRS))("the shop's own sheet, headings and all", () => {
  const read = async () => readSaleSheet(await sheetGrids(readFileSync(THEIRS)))!;

  it("is recognised, though not one of its five columns is headed the way the template heads it", async () => {
    const r = await read();
    expect(r).not.toBeNull();
    expect(r.instructions).toHaveLength(70);
  });

  it("tells the flat skis from the packages, which is two different discounts on two lines", async () => {
    // Their sheet: 2027 snow skis flat 15% off, 2027 snow skis "pakage" 20% off. Read without the
    // column, both lines take in both kinds and whichever ran second priced everything.
    const r = await read();
    const skis = r.instructions.filter((i) => i.includes("snow skis") && i.includes("2027"));
    expect(skis).toHaveLength(3);
    expect(skis[0]).toContain("15% off");
    expect(skis[0]).toContain("sold flat, with no binding");
    expect(skis[1]).toContain("20% off");
    expect(skis[1]).toContain("sold as a package, with a binding");
    // And the snowboards, where they spell it correctly and add a brand.
    expect(r.instructions.some((i) => i.includes("snowboards sold flat") && i.includes("NITRO"))).toBe(true);
    expect(r.instructions.some((i) => i.includes("snowboards sold as a package") && i.includes("25% off"))).toBe(true);
  });

  it("reads \"flat and package\" as both, which narrows nothing", async () => {
    const r = await read();
    const line = r.instructions.find((i) => i.includes("snow skis") && i.includes("2999"))!;
    expect(line).toContain("25% off");
    expect(line).not.toContain("sold flat");
    expect(line).not.toContain("sold as a package");
  });

  it("does not read the year column as a column of tags to add", async () => {
    // "Year tag" contains the word "tag". Matching a heading by what it contains made the year
    // column the add-tags column as well, so every row asked to add its own year as a tag.
    const r = await read();
    expect(r.instructions.filter((i) => /Also add the tag/.test(i))).toEqual([]);
  });

  it("keeps the sub-type that is not a fitting", async () => {
    const r = await read();
    expect(r.instructions.some((i) => i.includes("jackets and pants"))).toBe(true);
    expect(r.instructions.some((i) => i.includes("step on"))).toBe(true);
    // The two midlayer rows carry no year, so they are set aside — and named by their sub-type,
    // because by shelf alone both read "snow clothing 30% off" and one line appeared twice.
    expect(r.ignored.filter((i) => i.includes("midlayer"))).toHaveLength(2);
  });
});

describe("reading flat or package out of a sub-type cell", () => {
  it("knows the shop's own spelling of package", () => {
    // "pakage" is on three of the five rows that use it. A spelling to know, not to correct.
    expect(readFitting("pakage").fitting).toBe("package");
    expect(readFitting("pakage only").fitting).toBe("package");
    expect(readFitting("package ").fitting).toBe("package");
  });

  it("reads flat, and the ways of saying it", () => {
    expect(readFitting("flat").fitting).toBe("flat");
    expect(readFitting("ski only").fitting).toBe("flat");
    expect(readFitting("no bindings").fitting).toBe("flat");
  });

  it("reads both, and nothing, as the same answer: no narrowing", () => {
    expect(readFitting("flat and package").fitting).toBeNull();
    expect(readFitting("").fitting).toBeNull();
    expect(readFitting("midlayer").fitting).toBeNull();
  });

  it("hands back what is left of the cell, so a sub-type beside it is not lost", () => {
    expect(readFitting("midlayer").rest).toBe("midlayer");
    // A cell that is not about the fitting comes back whole, words and all: taking "only" out of
    // "step on only" would be editing a sub-type this knows nothing about.
    expect(readFitting("step on only").rest).toBe("step on only");
  });
});
