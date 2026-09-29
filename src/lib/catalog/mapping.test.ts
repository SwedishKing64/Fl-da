import { describe, expect, it } from "vitest";
import { applyMapping, headerHash, looksLikeReference, mappingProblems, suggestMapping, seasonFrom, repairTemplate, type Mapping } from "./mapping";
import { DEFAULT_CATEGORY_RULES, chooseOptions, detectCategory, enrichFromTitle } from "./categorize";
import { groupLineItems } from "./grouping";
import { emptyLineItem } from "./types";

describe("mapping suggestions", () => {
  it("maps common supplier headers to canonical fields", () => {
    const m = suggestMapping(["Style No", "Item Description", "Colour", "Length (cm)", "EAN", "Qty", "WHS Price", "RRP", "Image URL", "Notes"]);
    expect(m["Style No"]).toBe("modelCode");
    expect(m["Item Description"]).toBe("title");
    expect(m["Colour"]).toBe("colour");
    expect(m["Length (cm)"]).toBe("length");
    expect(m["EAN"]).toBe("barcode");
    expect(m["Qty"]).toBe("quantity");
    expect(m["WHS Price"]).toBe("costPrice");
    expect(m["RRP"]).toBe("rrp");
    expect(m["Image URL"]).toBe("imageUrls");
    expect(m["Notes"]).toBe("");
  });

  it("does not assign the same canonical field twice", () => {
    const m = suggestMapping(["Price", "Unit Price"]);
    expect(Object.values(m).filter((v) => v === "costPrice")).toHaveLength(1);
  });

  it("hashes headers independent of case and punctuation", () => {
    expect(headerHash(["SKU", "Unit-Price"])).toBe(headerHash(["sku", "unit price"]));
    expect(headerHash(["SKU"])).not.toBe(headerHash(["Barcode"]));
  });

  it("applies a mapping with number parsing, fixed values and line-total costs", () => {
    const item = applyMapping(
      { Code: "AA0029-172", Name: "Bent 90 172", Cost: "$1,350.00", Qty: "3", Images: "https://a.com/1.jpg | https://a.com/2.jpg", Brand: "" },
      { Code: "sku", Name: "title", Cost: "costPrice", Qty: "quantity", Images: "imageUrls", Brand: "brand" },
      { fixed: { brand: "Atomic", season: "2026" }, costIsLineTotal: true },
    );
    expect(item.sku).toBe("AA0029-172");
    expect(item.costPrice).toBe(450);
    expect(item.quantity).toBe(3);
    expect(item.brand).toBe("Atomic");
    expect(item.season).toBe("2026");
    expect(item.imageUrls).toEqual(["https://a.com/1.jpg", "https://a.com/2.jpg"]);
    // Only the product name is required. A cost price is not: this shop sells at the supplier's
    // recommended retail, and plenty of suppliers quote only that.
    expect(mappingProblems({ Code: "sku" })).toEqual(["Map a column to Product name."]);
    expect(mappingProblems({ Code: "sku", Name: "title" })).toEqual([]);
  });
});

describe("categorisation", () => {
  it("detects categories with boots winning over skis", () => {
    const boot = { ...emptyLineItem(), title: "Hawx Ultra 100 Ski Boot" };
    const ski = { ...emptyLineItem(), title: "Bent 90", productType: "Skis" };
    const stated = { ...emptyLineItem(), title: "Thing", category: "goggles" };
    expect(detectCategory(boot, DEFAULT_CATEGORY_RULES)?.category).toBe("boots");
    expect(detectCategory(ski, DEFAULT_CATEGORY_RULES)?.category).toBe("skis");
    expect(detectCategory(stated, DEFAULT_CATEGORY_RULES)?.category).toBe("goggles");
    expect(detectCategory({ ...emptyLineItem(), title: "Mystery" }, DEFAULT_CATEGORY_RULES)).toBeNull();
  });

  it("pulls length / size / season / colour out of titles", () => {
    const ski = enrichFromTitle({ ...emptyLineItem(), title: "Bent 90 2026 172cm", colour: "Blue" }, "skis");
    expect(ski).toMatchObject({ title: "Bent 90 2026", length: "172", season: "2026" });
    const boot = enrichFromTitle({ ...emptyLineItem(), title: "Hawx Ultra 100 26.5" }, "boots");
    expect(boot).toMatchObject({ title: "Hawx Ultra 100", size: "26.5" });
    const coloured = enrichFromTitle({ ...emptyLineItem(), title: "Beanie - Black", colour: "Black" }, "accessories");
    expect(coloured.title).toBe("Beanie");
  });

  it("chooses options from attributes that are actually present", () => {
    const rule = DEFAULT_CATEGORY_RULES.find((r) => r.category === "boots")!;
    const items = [
      { ...emptyLineItem(), size: "26.5", colour: "Black" },
      { ...emptyLineItem(), size: "27.5", colour: "Black" },
    ];
    expect(chooseOptions(rule, items)).toEqual(["size", "colour"]);
    expect(chooseOptions(null, [{ ...emptyLineItem(), length: "170" }, { ...emptyLineItem(), length: "177" }])).toEqual(["length"]);
  });
});

describe("grouping", () => {
  it("groups by brand + model code into products with option values", () => {
    const items = [
      { ...emptyLineItem(), brand: "Atomic", modelCode: "AA0029", sku: "AA0029-166", title: "Bent 90 Skis", length: "166", colour: "Blue", costPrice: 450, quantity: 1 },
      { ...emptyLineItem(), brand: "Atomic", modelCode: "AA0029", sku: "AA0029-172", title: "Bent 90 Skis", length: "172", colour: "Blue", costPrice: 450, quantity: 2 },
      { ...emptyLineItem(), brand: "Atomic", modelCode: "AA0029", sku: "AA0029-172", title: "Bent 90 Skis", length: "172", colour: "Blue", costPrice: 450, quantity: 1 },
      { ...emptyLineItem(), brand: "Acme", sku: "BEANIE-BLK", title: "Beanie Black", colour: "Black", costPrice: 10, quantity: 5 },
    ];
    const products = groupLineItems(items, DEFAULT_CATEGORY_RULES);
    expect(products).toHaveLength(2);
    const skis = products[0];
    // The Title column carries the product's name, not its brand: that is the Vendor column's job.
    expect(skis.title).toBe("Bent 90 Skis");
    expect(skis.brand).toBe("Atomic");
    // The handle carries the season, because Shopify derives one from the title only at creation.
    expect(skis.handle).toBe("atomic-bent-90-skis-2027");
    expect(skis.category).toBe("skis");
    expect(skis.productType).toBe("Skis");
    expect(skis.option1Name).toBe("Length");
    expect(skis.option2Name).toBe("Colour"); // preferred attribute present on the rows
    expect(skis.variants).toHaveLength(2);
    expect(skis.variants[1].item.quantity).toBe(3); // duplicate sku line merged
    expect(skis.metafields.length_cm).toBe("166, 172");
    expect(skis.tags).toContain("atomic"); // the catalogue writes a vendor in lower case
    expect(products[1].title).toBe("Beanie");
  });
});

/**
 * Telling a delivery from something to look things up in.
 *
 * Nothing classified a spreadsheet at all: the document type came only from the model, which
 * reads PDFs and photographs, so every workbook fell through to "invoice". A Volkl spec export
 * and a Marker barcode list therefore built 1,608 products between them and matched none of them
 * to the nine that were ordered.
 */
describe("what a table is for", () => {
  it("reads a table with prices and quantities as an order", () => {
    expect(looksLikeReference(["Item No.", "SKU", "Description", "Length", "RRP", "Qty"])).toBe(false);
    expect(looksLikeReference(["item no.", "description", "colour", "DIN", "QTY", "RRP", "W/S"])).toBe(false);
  });

  it("reads a barcode list and a spec export as references", () => {
    // Their two, header for header.
    expect(looksLikeReference(["article no.", "description", "CTN", "net weight", "country of origin", "EAN No."])).toBe(true);
    expect(looksLikeReference(["basic article no.", "description", "season", "category", "GTIN", "size (ski length)", "waist width", "SKU no. // LENGTH"])).toBe(true);
  });

  it("does not call a table a reference when there is nothing on it to look up", () => {
    expect(looksLikeReference(["notes", "comments"])).toBe(false);
    expect(looksLikeReference([])).toBe(false);
  });
});

describe("reading a supplier's columns for what they are", () => {
  it("takes a blank quantity as not ordered when the sheet has a quantity column", () => {
    const m = suggestMapping(["Description", "Order Qty"]);
    expect(applyMapping({ Description: "Custom", "Order Qty": "" }, m).quantity).toBeNull();
    expect(applyMapping({ Description: "Custom", "Order Qty": "2" }, m).quantity).toBe(2);
  });

  it("still means one of each when the sheet has no quantity column at all", () => {
    expect(applyMapping({ Description: "Custom" }, suggestMapping(["Description"])).quantity).toBe(1);
  });

  it("reads Model # as the model's number and Model name as its name", () => {
    const m = suggestMapping(["Model #", "Model name"]);
    expect(m["Model #"]).toBe("modelCode");
    expect(m["Model name"]).toBe("title");
  });

  it("takes the AUD price over the NZD one, whichever column comes first", () => {
    const m = suggestMapping(["Description", "NZD-RETAIL", "AUD-RETAIL", "NZD-WHSL", "AUD-WHSL"]);
    expect(m["AUD-RETAIL"]).toBe("rrp");
    expect(m["AUD-WHSL"]).toBe("costPrice");
    expect(m["NZD-RETAIL"]).toBe("");
  });

  it("reads Material as a code only when what is under it looks like one", () => {
    // Burton's SAP code column, and an apparel sheet's fabric column, under the same heading.
    const codes = [{ Material: "106881A97DRG" }, { Material: "106891A97DRG" }];
    const fabric = [{ Material: "100% polyester" }, { Material: "Merino wool" }];
    expect(suggestMapping(["Description", "Material"], codes)["Material"]).toBe("modelCode");
    expect(suggestMapping(["Description", "Material"], fabric)["Material"]).not.toBe("modelCode");
  });

  it("reads a supplier's season code as the year", () => {
    expect(seasonFrom("27WIN")).toBe("2027");
    expect(seasonFrom("W27")).toBe("2027");
    expect(seasonFrom("2026")).toBe("2026");
    expect(seasonFrom("26/27")).toBe("2027");
    expect(seasonFrom("2026/27")).toBe("2027");
    expect(seasonFrom("2627")).toBe("2027");
    expect(seasonFrom("26/28")).toBe("26/28");
  });

  it("keeps a feature bullet whole, however long", () => {
    const long = "Directional Shape is the classic snowboard shape, designed to be ridden with a slightly longer nose than tail to concentrate pop in the tail";
    const item = applyMapping({ Name: "Custom", "Bullet 1": long, Notes: long }, suggestMapping(["Name", "Bullet 1", "Notes"]));
    expect(item.extras?.["Bullet 1"]).toBe(long);
    expect(item.extras?.["Notes"]).toBeUndefined();          // long prose that is not a bullet is still the body's job
  });
});

describe("a saved mapping, kept where it holds", () => {
  it("adds a field the fresh reading finds and the saved one leaves out", () => {
    // A template saved before AUD-RETAIL was recognised: boards with no price, for good.
    const saved = { Description: "title", "AUD-RETAIL": "" } as const;
    const fresh = suggestMapping(["Description", "AUD-RETAIL"]);
    expect(repairTemplate({ ...saved }, fresh, [])["AUD-RETAIL"]).toBe("rrp");
  });

  it("drops a saved choice the data under it rules out", () => {
    // Bare numbers are never a product's name.
    const saved = { "Model #": "title", "Model name": "modelCode" } as const;
    const rows = [{ "Model #": "10688", "Model name": "Men's Custom Camber Snowboard" }, { "Model #": "10689", "Model name": "Men's Custom X Camber Snowboard" }];
    const out = repairTemplate({ ...saved }, suggestMapping(["Model #", "Model name"], rows), rows);
    expect(out["Model #"]).toBe("modelCode");
  });

  it("leaves a deliberate choice alone when nothing disproves it", () => {
    const rows = [{ Description: "Custom", Code: "ABC-123" }];
    const suggested = suggestMapping(["Description", "Code"], rows);
    // Somebody changed Code to the SKU on the mapping screen, and the template recorded that.
    const saved: Mapping = { Description: "title", Code: suggested.Code === "sku" ? "modelCode" : "sku" };
    expect(repairTemplate({ ...saved }, suggested, rows, suggested)).toEqual(saved);
  });

  it("does not let a template saved from a bad reading override a good one", () => {
    // What the shop's first Burton run saved, with Save ticked by default: cost from the line
    // total, and the description list with the model NUMBER as the name.
    const orderHeaders = ["MATERIAL", "SKU", "DESCRIPTION ", "SIZE", "GENDER", "AUD-WHSL", "AUD-RETAIL", "NZD-WHSL", "NZD-RETAIL", "EAN", "ORDER QTY", "TOTAL $"];
    const orderRows = [{ MATERIAL: "", SKU: "", "DESCRIPTION ": "CUSTOM NEW GRAPHIC", SIZE: "154", GENDER: "MENS", "AUD-WHSL": "572.72", "AUD-RETAIL": "999.99", "NZD-WHSL": "570.65", "NZD-RETAIL": "1049.99", EAN: "", "ORDER QTY": "1", "TOTAL $": "572.72" }];
    const oldOrder: Mapping = { SKU: "sku", "DESCRIPTION ": "title", SIZE: "size", GENDER: "gender", EAN: "barcode", "ORDER QTY": "quantity", "AUD-RETAIL": "rrp", "TOTAL $": "costPrice" };
    const order = repairTemplate(oldOrder, suggestMapping(orderHeaders, orderRows), orderRows);
    expect(order["AUD-WHSL"]).toBe("costPrice");
    expect(order["TOTAL $"]).toBe("");
    expect(order["AUD-RETAIL"]).toBe("rrp");

    const listRows = [{ "Model #": "10688", "Model name": "Men's Custom Camber Snowboard", "Long Description": "From its humble beginnings…" }];
    const oldList: Mapping = { "Long Description": "description", "Model #": "title", "Model name": "modelCode" };
    const list = repairTemplate(oldList, suggestMapping(["Model #", "Model name", "Long Description"], listRows), listRows);
    expect(list).toMatchObject({ "Model #": "modelCode", "Model name": "title", "Long Description": "description" });
  });
});
