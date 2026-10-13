/**
 * Burton's W27 order and its description list, built into the products the shop already lists.
 *
 * Reported from the shop floor: the two files built 13 products (22 here) out of all 125 rows of the
 * price list, a board in every size at quantity one, no prices, no Type, "New Graphic" in the names,
 * and not one description — though the description list had all of them.
 *
 * The target is not guessed. The shop already lists four of these boards for 2027, in exactly the
 * sizes this order bought, and its Custom X body is Burton's own copy word for word. So the build is
 * checked against the shop's live listings: same titles, same handles, same lengths, same body.
 */

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractXlsx } from "./extract/tabular";
import { applyMapping, suggestMapping } from "./mapping";
import { keepOrderedLines, resolveAgainstReference, shopName } from "./reference-match";
import { groupLineItems } from "./grouping";
import { enrichFromSpecs } from "./specs";
import { DEFAULT_CATEGORY_RULES } from "./categorize";
import { productTitle, seasonTagFrom } from "./titles";
import { parseCsv } from "./csv";
import { addedRows } from "./diff";
import type { CanonicalLineItem } from "./types";

const UP = "/root/.claude/uploads/94fb8bfb-35a9-5176-afe9-8fcc0dec9eb3/";
const ORDER = `${UP}5c476de7-W27_VDO_amended_ORDER.xlsx`;
const LIST = `${UP}f56178ce-Items_and_Descriptions_2027.xlsx`;
const SHOP = `${UP}59a4259d-products_export_1-2.csv`;

async function read(path: string): Promise<{ items: CanonicalLineItem[]; mapping: Record<string, string> }> {
  const table = await extractXlsx(readFileSync(path));
  const mapping = suggestMapping(table.headers, table.rows);
  return { items: table.rows.map((row) => applyMapping(row, mapping)), mapping };
}

async function build() {
  const order = await read(ORDER);
  const list = await read(LIST);
  const { kept, notOrdered, footers } = keepOrderedLines(order.items.map((item) => ({ item, fileId: "order" })));
  const resolved = resolveAgainstReference(kept.map((k) => k.item), list.items, DEFAULT_CATEGORY_RULES);
  const products = enrichFromSpecs(groupLineItems(resolved.items, DEFAULT_CATEGORY_RULES), list.items)
    .map((g) => ({ ...g, fullTitle: productTitle(g.title, seasonTagFrom(g.tags)) }));
  return { order, list, kept, notOrdered, footers, resolved, products };
}

describe.skipIf(!existsSync(ORDER) || !existsSync(LIST))("Burton's W27 order and description list", () => {
  it("reads the columns for what they are", async () => {
    const { order, list } = await build();
    // The cost is the AUD wholesale, not the line total; the price is the AUD retail, not the NZD one.
    expect(order.mapping["AUD-WHSL"]).toBe("costPrice");
    expect(order.mapping["AUD-RETAIL"]).toBe("rrp");
    expect(order.mapping["TOTAL $"]).toBe("");
    expect(order.mapping["NZD-RETAIL"]).toBe("");
    expect(order.mapping["MATERIAL"]).toBe("modelCode");
    // "Model #" is the model's NUMBER. Read as its name, it swapped the title and the code.
    expect(list.mapping["Model #"]).toBe("modelCode");
    expect(list.mapping["Model name"]).toBe("title");
    expect(list.items[0].season).toBe("2027");                    // "27WIN"
  }, 60_000);

  it("builds only what was ordered: 12 boards out of a 125-row price list", async () => {
    const { kept, notOrdered, footers } = await build();
    expect(kept).toHaveLength(12);
    expect(notOrdered).toBe(113);
    // "TOTAL ORDER QTY 12, $6,586.27": a row with a quantity and nothing to say what it is. It was
    // being built into a product with no name at a cost of $548.86.
    expect(footers).toBe(1);
    expect(kept.every((k) => k.item.quantity === 1)).toBe(true);
  }, 60_000);

  it("builds five boards, named and sized the way the shop lists them", async () => {
    const { products } = await build();
    expect(products.map((p) => p.fullTitle)).toEqual(["Custom 2027", "Custom X 2027", "Process 2027", "Feelgood 2027", "Yeasayer 2027"]);
    const lengths = (title: string) => products.find((p) => p.fullTitle === title)!.variants.map((v) => v.item.length);
    // "58W" on the form is 158 wide; the shop writes it in full. And Burton's own typo, "PROCESS
    // NEW GRAHIC", is the same board as "PROCESS NEW GRAPHIC" — one product, not two.
    expect(lengths("Custom 2027")).toEqual(["154", "156", "158W", "162W"]);
    expect(lengths("Custom X 2027")).toEqual(["156", "158W"]);
    expect(lengths("Process 2027")).toEqual(["152", "155", "157W"]);
    expect(products.every((p) => p.productType === "Snowboards")).toBe(true);
    // Length alone, as on every board the shop lists — not Length and Size saying the same thing.
    expect(products.every((p) => p.option1Name === "Length" && !p.option2Name)).toBe(true);
  }, 60_000);

  it("describes the four the list covers, and leaves the one it does not alone", async () => {
    const { products, resolved } = await build();
    const described = products.filter((p) => p.description.trim()).map((p) => p.fullTitle);
    expect(described).toEqual(["Custom 2027", "Custom X 2027", "Process 2027", "Yeasayer 2027"]);
    // The list has a KIDS' Feelgood and no women's one. Giving the women's board the kids' copy is
    // the mistake this refuses to make.
    const feelgood = resolved.joined.find((j) => j.line === "FEELGOOD NEW GRAPHIC")!;
    expect("reason" in feelgood).toBe(true);
  }, 60_000);

  it.skipIf(!existsSync(SHOP))("writes the Custom X body word for word as the shop's live listing", async () => {
    const { products } = await build();
    const grid = parseCsv(readFileSync(SHOP, "utf8"));
    const at = (n: string) => grid[0].indexOf(n);
    const live = grid.find((r) => r[at("Handle")] === "custom-x-2027" && r[at("Title")])![at("Body (HTML)")];
    const built = products.find((p) => p.fullTitle === "Custom X 2027")!.description;
    expect(built).toBe(live);
  }, 60_000);
});

describe.skipIf(!existsSync(ORDER) || !existsSync(LIST))("every description on the form, matched or refused", () => {
  // The whole range, ordered or not, because the next order will tick different boxes.
  const expected: Record<string, string | null> = {
    "CUSTOM JUNGLE": "Custom",
    "CUSTOM NEW GRAPHIC": "Custom",
    "CUSTOM X NEW GRAPHIC": "Custom X",                  // not Custom: the X is another model's word
    "CUSTOM FLYING V JUNGLE": null,                      // 10707 is not on the list
    "CUSTOM FLYING V NEW GRAPHIC": null,                 // and plain Custom is not a Flying V
    "PROCESS NEW GRAPHIC": "Process",
    "PROCESS NEW GRAHIC": "Process",                     // Burton's typo
    "PROCESS FV NEW GRAPHIC": "Process Flying V",        // FV
    "CARTOGRAPHER NEW GRAPHIC": "Cartographer",
    "COUNTRBLNCE NEW GPAPHIC": "Counterbalance",         // vowels dropped, and a typo
    "COUNTRBLNCE NEW GRAPHIC": "Counterbalance",
    "FISH 3D NEW GRAPHIC": "Fish 3D",
    "FISH 3D SPLIT NO COLOR": null,                      // the splitboard, a code the list lacks
    "MYS DEEP THINKER NEW GRAPHIC": null,
    "REWIND SPRAY PAINT NEW GRAPHIC": "Rewind",
    "FEELGOOD NEW GRAPHIC": null,                        // women's; the list has only the kids' one
    "YEASAYER NEW GRAPHIC": "Yeasayer",
    "YEASAYER FV NO COLOR": "Yeasayer Flying V",
  };

  it("joins each to the right model, or to none", async () => {
    const order = await read(ORDER);
    const list = await read(LIST);
    const distinct = [...new Map(order.items.filter((i) => i.title).map((i) => [i.title, i])).values()];
    const r = resolveAgainstReference(distinct, list.items, DEFAULT_CATEGORY_RULES);
    for (const [line, want] of Object.entries(expected)) {
      const i = distinct.findIndex((d) => d.title === line);
      expect(i, line).toBeGreaterThanOrEqual(0);
      const j = r.joined[i];
      if (want === null) expect("reason" in j, line).toBe(true);
      else expect("to" in j ? shopName(j.to) : j.reason, line).toBe(want);
    }
  }, 60_000);

  it("keeps a named graphic as the colour, and drops the placeholder", async () => {
    const order = await read(ORDER);
    const list = await read(LIST);
    const pick = (title: string) => order.items.find((i) => i.title === title)!;
    const r = resolveAgainstReference([pick("CUSTOM JUNGLE"), pick("CUSTOM NEW GRAPHIC"), pick("REWIND SPRAY PAINT NEW GRAPHIC")], list.items, DEFAULT_CATEGORY_RULES);
    expect(r.items.map((i) => i.colour)).toEqual(["Jungle", "", "Spray Paint"]);
  }, 60_000);
});

/**
 * The same two files through the Bulk page, which reads the order with its own reader and matches
 * it to the shop's export rather than building a batch.
 *
 * Reported from the shop floor after the importer was fixed: the Bulk page still built the wrong
 * boards, found "no descriptions" with the list loaded, and read no cost. Its reader dropped every
 * line with no code or barcode — which is all twelve amended lines — and built the price list's
 * coded rows instead, none of which were ordered.
 */
describe.skipIf(!existsSync(ORDER) || !existsSync(LIST) || !existsSync(SHOP))("Burton's W27 order through the Bulk page", () => {
  async function bulk() {
    const { sheetGrids } = await import("./extract/tabular");
    const { readInvoiceGrids } = await import("./invoice");
    const { buildDelivery } = await import("./delivery");
    const invoice = readInvoiceGrids(await sheetGrids(readFileSync(ORDER)))!;
    const list = await read(LIST);
    return { invoice, specs: list.items, buildDelivery };
  }

  it("reads the twelve ordered boards, with the AUD retail and the AUD wholesale", async () => {
    const { invoice } = await bulk();
    expect(invoice.lines).toHaveLength(12);
    expect(invoice.shape).toBe("flat");
    expect(invoice.columns.rrp).toBe("AUD-RETAIL");
    const custom = invoice.lines[0];
    expect(custom).toMatchObject({ title: "CUSTOM NEW GRAPHIC", size: "154", quantity: 1, rrp: 999.99, costPrice: 572.72, gender: "MENS" });
    expect(invoice.lines.every((l) => l.quantity === 1 && l.rrp !== null && l.costPrice !== null)).toBe(true);
  }, 60_000);

  it("puts the four boards the shop lists onto their listings, and builds only the Feelgood", async () => {
    const { invoice, specs, buildDelivery } = await bulk();
    const result = buildDelivery(readFileSync(SHOP, "utf8"), invoice.lines, { season: "2027", vendor: "Burton", specs });
    expect(result.heldBack).toEqual([]);
    const placed = result.reconciliation.matched.map((m) => `${m.handle} ${m.line.size}`);
    expect(placed).toEqual([
      "custom-2027 154", "custom-2027 156", "custom-2027 158W", "custom-2027 162W",
      // The board, not "Custom X 2027 inc Burton Cartel Binding Package": the line names no binding.
      "custom-x-2027 156", "custom-x-2027 158W",
      "process-2027 152", "process-2027 155", "process-2027 157W",
      "yeasayer-2027 140", "yeasayer-2027 144",
    ]);
    // The shop lists the Process in 155W and 157W. A 155 is not a 155W, so it is a new size.
    expect(result.freshSizes.map((s) => s.option).sort()).toEqual(["152", "155"]);
    expect(result.fresh.map((f) => f.title)).toEqual(["Feelgood 2027"]);
  }, 60_000);

  it("describes the new boards from the list", async () => {
    const { invoice, specs, buildDelivery } = await bulk();
    const empty = "Handle,Title,Body (HTML),Vendor,Type,Tags,Option1 Name,Option1 Value,Variant Price,Cost per item,Variant Inventory Qty\r\n";
    const result = buildDelivery(empty, invoice.lines, { season: "2027", vendor: "Burton", specs });
    const built = Object.fromEntries(result.fresh.map((f) => [f.title, f]));
    expect(Object.keys(built).sort()).toEqual(["Custom 2027", "Custom X 2027", "Feelgood 2027", "Process 2027", "Yeasayer 2027"]);
    for (const name of ["Custom 2027", "Custom X 2027", "Process 2027", "Yeasayer 2027"]) expect(built[name].described).toBe(true);
    expect(built["Custom 2027"].type).toBe("Snowboards");
    expect(built["Custom 2027"].variants.map((v) => v.option)).toEqual(["154", "156", "158W", "162W"]);
    expect(built["Custom 2027"].variants[0].price).toBe("999.99");
  }, 60_000);
});

describe.skipIf(!existsSync(ORDER) || !existsSync(LIST) || !existsSync(SHOP))("what the Bulk page writes for Burton", () => {
  async function run(csv: string, withMemory: boolean) {
    const { sheetGrids } = await import("./extract/tabular");
    const { readInvoiceGrids } = await import("./invoice");
    const { buildDelivery } = await import("./delivery");
    const { listingsFromCsv } = await import("./shop-memory");
    const invoice = readInvoiceGrids(await sheetGrids(readFileSync(ORDER)))!;
    const specs = (await read(LIST)).items;
    const shop = readFileSync(SHOP, "utf8");
    return buildDelivery(csv, invoice.lines, { season: "2027", vendor: "Burton", specs, ...(withMemory ? { listings: listingsFromCsv(shop) } : {}) });
  }

  it("builds with the shop's handles, body, category and riding-style tags", async () => {
    const header = readFileSync(SHOP, "utf8").split(/\r?\n/)[0] + "\r\n";
    const result = await run(header, true);
    const byHandle = Object.fromEntries(result.fresh.map((f) => [f.handle, f]));
    expect(Object.keys(byHandle).sort()).toEqual(["custom-2027", "custom-x-2027", "feelgood-2027", "process-2027", "yeasayer-2027"]);
    // What the shop gave the Custom last time: all-mountain AND park, which Burton's copy never says.
    expect(byHandle["custom-2027"].tags).toEqual(expect.arrayContaining(["2027", "burton", "mens", "snowboard", "snowboards", "freestyle and all-mountain boards", "park boards"]));
    expect(byHandle["yeasayer-2027"].tags).toContain("freestyle and all-mountain boards");
    expect(byHandle["yeasayer-2027"].tags).not.toContain("park boards");
    // A model the shop has never listed takes the order form's own PH3: ALL MOUNTAIN.
    expect(byHandle["feelgood-2027"].tags).toContain("freestyle and all-mountain boards");
    const rows = parseCsv(result.csv);
    const h = rows[0];
    const custom = rows.find((r) => r[h.indexOf("Handle")] === "custom-2027" && r[h.indexOf("Title")])!;
    expect(custom[h.indexOf("Body (HTML)")]).toMatch(/^<p>From its humble/);
    expect(custom[h.indexOf("Body (HTML)")]).not.toMatch(/<p><p>|<p><h2>/);
    expect(custom[h.indexOf("Product Category")]).toMatch(/Skiing & Snowboarding > Snowboards$/);
  }, 60_000);

  it("adds a new length under Length, not under Colour, at the order's cost", async () => {
    const shop = readFileSync(SHOP, "utf8");
    const result = await run(shop, false);
    const rows = parseCsv(result.csv).filter((r) => r.some((c) => c.trim()));
    const h = rows[0];
    const before = parseCsv(shop).filter((r) => r.some((c) => c.trim()));
    const added = addedRows(before, rows).filter((r) => r[h.indexOf("Handle")] === "process-2027");
    expect(added.map((r) => [r[h.indexOf("Option1 Value")], r[h.indexOf("Option2 Value")], r[h.indexOf("Cost per item")]])).toEqual([
      ["Bad Dog", "152", "503.99"],
      ["Bad Dog", "155", "503.99"],
    ]);
  }, 60_000);
});
