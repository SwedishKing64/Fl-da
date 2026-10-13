import { describe, expect, it } from "vitest";
import { brandOf, csvNameFor, transcribeDocument, transcriptToCsv, unitCostOf } from "./transcribe";
import { parseCsv } from "../csv";

const answer = {
  supplier: "Head Oceania Pty Limited", reference: "3700388555", date: "06.10.2026", remarks: "Head closeout skis and boots arriving 10/10/26",
  rows: [
    { sku: "315445", bindingSku: "114424", description: "KORE 94 Ti inc ATTACK 14 GW W/O BR.[A] Binding Package", colour: "bk/bg", size: "177", quantity: 2, unitPrice: 675, bindingUnitPrice: 255, discountPercent: 20, rrp: 1629, season: "2026", gender: "Mens", notes: "", unsure: [] },
    { sku: "315685", bindingSku: "114467", description: "e.absolut Joy SLR BB Joy Pro inc SLR 10 GW Binding Package", colour: "wh", size: "163", quantity: 1, unitPrice: 437, bindingUnitPrice: 210, discountPercent: 20, rrp: 1099, season: "2026", gender: "Womens", notes: "QTY if it exists", unsure: ["rrp: 1099, or 1699"] },
    { sku: "315706", bindingSku: "", description: "e.pure Joy SLR BB Joy Pro", colour: "gd", size: "148", quantity: 1, unitPrice: 333, bindingUnitPrice: null, discountPercent: null, rrp: null, season: "", gender: "", notes: "+ SLR 10 binding", unsure: [] },
  ],
};

describe("a scribbled-on order read into a table", () => {
  it("sends every page and the person's hint, and parses what comes back", async () => {
    let seen: unknown[] = [];
    const t = await transcribeDocument([{ kind: "image", mediaType: "image/jpeg", data: Buffer.from("x") }, { kind: "pdf", data: Buffer.from("y") }], "the red numbers are package RRPs", {
      ask: async (_system, content) => { seen = content as unknown[]; return JSON.stringify(answer); },
    });
    expect(t.rows).toHaveLength(3);
    expect(t.supplier).toBe("Head Oceania Pty Limited");
    const kinds = (seen as Array<{ type: string; text?: string }>).map((b) => b.type);
    expect(kinds).toEqual(["text", "image", "text", "document", "text"]);
    expect((seen as Array<{ type: string; text?: string }>).at(-1)?.text).toContain("red numbers are package RRPs");
  });

  it("works the unit cost out as ski plus binding less the discount", () => {
    expect(unitCostOf({ unitPrice: 675, bindingUnitPrice: 255, discountPercent: 20 })).toBe(744);
    expect(unitCostOf({ unitPrice: 333, bindingUnitPrice: null, discountPercent: null })).toBe(333);
    expect(unitCostOf({ unitPrice: null, bindingUnitPrice: 255, discountPercent: 20 })).toBeNull();
  });

  it("writes the CSV the bulk page reads, with the doubts carried as notes", () => {
    const csv = transcriptToCsv(answer);
    const grid = parseCsv(csv);
    expect(grid[0]).toEqual(["SKU", "Binding SKU", "Brand", "Description", "Colour", "Size", "Quantity", "Unit Price", "Binding Unit Price", "Discount %", "Unit Cost", "RRP", "Season", "Gender", "Notes"]);
    expect(grid[1]).toEqual(["315445", "114424", "Head", "KORE 94 Ti inc ATTACK 14 GW W/O BR.[A] Binding Package", "bk/bg", "177", "2", "675.00", "255.00", "20", "744.00", "1629.00", "2026", "Mens", ""]);
    expect(grid[2][14]).toBe("QTY if it exists; Check: rrp: 1099, or 1699");
    expect(grid[3].slice(7, 12)).toEqual(["333.00", "", "", "333.00", ""]);
  });

  it("names the brand and the file from the paperwork", () => {
    expect(brandOf("Head Oceania Pty Limited")).toBe("Head");
    expect(csvNameFor(answer)).toBe("Head-3700388555.csv");
    expect(csvNameFor({ ...answer, reference: "", date: "06.10.2026" })).toBe("Head-06.10.2026.csv");
  });
});
