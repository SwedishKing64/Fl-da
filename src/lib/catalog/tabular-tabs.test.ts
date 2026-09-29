/**
 * A reference workbook split into tabs with the same columns is one list.
 *
 * Only the best single tab used to be read, and the page said to "upload the file again for each"
 * of the others — which nobody can do usefully. A tab with different columns is a different table
 * and is still left out, and named.
 */

import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { extractXlsx } from "./extract/tabular";

async function workbook(tabs: Record<string, string[][]>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(tabs)) wb.addWorksheet(name).addRows(rows);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("a workbook in tabs", () => {
  const HEAD = ["Model #", "Model name", "Long Description", "Bullet 1"];

  it("reads tabs with the same columns as one list", async () => {
    const t = await extractXlsx(await workbook({
      Skis: [HEAD, ["V1", "Mantra 88", "A ski.", "Titanal"], ["V2", "Blaze 94", "Another ski.", "Wood core"]],
      Bindings: [HEAD, ["M1", "Griffon 13", "A binding.", "DIN 4-13"]],
    }));
    expect(t.rows.map((r) => r["Model name"])).toEqual(["Mantra 88", "Blaze 94", "Griffon 13"]);
    expect(t.warnings.join(" ")).toContain("Read 2 tabs with the same columns as one list");
  });

  it("leaves out a tab with different columns, and says so", async () => {
    const t = await extractXlsx(await workbook({
      Skis: [HEAD, ["V1", "Mantra 88", "A ski.", "Titanal"], ["V2", "Blaze 94", "Another ski.", "Wood core"]],
      Summary: [["Category", "Total"], ["Skis", "2"]],
    }));
    expect(t.rows.map((r) => r["Model name"])).toEqual(["Mantra 88", "Blaze 94"]);
    expect(t.warnings.join(" ")).toContain('"Summary"');
  });
});
