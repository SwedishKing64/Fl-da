import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extractFile } from "../extract";
import { isReaderTable, readerMapping } from "../extract/ai";
import { suggestMapping, type Mapping } from "../mapping";
import { activateConventions, SNOW_TEST_CONVENTIONS } from "../taxonomy";
import { defaultHouseFor } from "../house";
import { learnVocabulary } from "../learn";
import { listingsFromCsv } from "../shop-memory";
import { runOffline } from "../offline";
import { DEFAULT_SETTINGS } from "../types";
import { linesFromTable, scoreDocument } from "../corpus";
import { LAYOUTS } from "./documents";
import { scoreBuild } from "./score-build";
import { Rng } from "./rng";
import { colourCode, ean13, makeDelivery, makeShop, shopExportCsv, sizeCode, TRADES } from "./world";

afterAll(() => activateConventions(SNOW_TEST_CONVENTIONS));

describe("a simulated shop", () => {
  it("is the same shop from the same seed, and another from another", () => {
    const a = JSON.stringify(makeShop("bike", 7));
    expect(JSON.stringify(makeShop("bike", 7))).toBe(a);
    expect(JSON.stringify(makeShop("bike", 8))).not.toBe(a);
  });

  it("gives every variant a barcode that passes its check digit, and codes a supplier would write", () => {
    const rng = new Rng(3);
    for (let i = 0; i < 50; i++) {
      const code = ean13(rng);
      const sum = code.slice(0, 12).split("").reduce((n, d, k) => n + Number(d) * (k % 2 === 0 ? 1 : 3), 0);
      expect((10 - (sum % 10)) % 10, code).toBe(Number(code[12]));
    }
    expect(colourCode("Gloss Black")).toBe("GBL");
    expect(colourCode("Navy")).toBe("NVY");
    expect(sizeCode("US 8.5")).toBe("85");
    expect(sizeCode("158W")).toBe("158W");
  });

  it("exports what it lists in Shopify's shape, which the app then learns from", () => {
    const shop = makeShop("outdoor", 2);
    const listings = listingsFromCsv(shopExportCsv(shop));
    expect(listings.length).toBe(shop.listed.length);
    const learned = learnVocabulary(listings, "export.csv");
    expect(learned.types.map((t) => t.type)).toEqual(expect.arrayContaining([...new Set(shop.listed.map((m) => m.kind.type))]));
  });
});

describe("a season of deliveries in every trade, read and built by code alone", () => {
  // The bar: on made-up documents in known layouts, nearly every line and model comes through. A
  // real supplier's file is harder than any of these; this is the floor, not the ceiling.
  for (const trade of TRADES) {
    it(`${trade}: every layout reads its lines and builds its models`, async () => {
      const shop = makeShop(trade, 11);
      const exportCsv = shopExportCsv(shop);
      const listings = listingsFromCsv(exportCsv);
      activateConventions({ pack: shop.pack, learned: learnVocabulary(listings, "export.csv"), marker: "", house: defaultHouseFor(shop.pack) });
      const rng = new Rng(shop.seed);
      const failures: string[] = [];
      for (const layout of LAYOUTS.filter((l) => !l.needsAi)) {
        const suppliers = layout.id.startsWith("multi") ? rng.some(shop.suppliers, 2, 3) : [rng.pick(shop.suppliers)];
        let delivery = makeDelivery(shop, suppliers, rng);
        if (!layout.fits(delivery)) delivery = { ...delivery, lines: delivery.lines.filter((l) => l.variant.options.Size !== undefined || l.variant.options.Length !== undefined) };
        if (delivery.lines.length === 0 || !layout.fits(delivery)) continue;
        const d = await layout.render(delivery, shop, rng);
        const { table } = await extractFile(d.data, d.filename, d.mime, "INVOICE");
        const read = scoreDocument(linesFromTable(table), d.key);
        const mapping: Mapping = isReaderTable(table.headers) ? readerMapping(table.headers) : suggestMapping(table.headers, table.rows);
        const fixed = d.brands.length === 1 ? { brand: d.brands[0] } : {};
        const built = runOffline(table, mapping, { fixed }, { currency: "AUD", fxRateToHome: 1, gstTreatment: "EXCLUSIVE", freightTotalHome: 0, freightMode: "PER_UNIT" }, [], DEFAULT_SETTINGS, { listings });
        const build = scoreBuild(built, d.expect, [...new Set(shop.listed.map((m) => m.kind.type))]);
        if (read.found < read.expected) failures.push(`${layout.id}: read ${read.found} of ${read.expected} lines (${read.missed.slice(0, 3).join("; ")})`);
        if (build.modelsFound < build.productsExpected) failures.push(`${layout.id}: built ${build.modelsFound} of ${build.productsExpected} models (${build.problems.slice(0, 3).join("; ")})`);
        if (!build.exportable) failures.push(`${layout.id}: not exportable (${build.problems.slice(0, 3).join("; ")})`);
      }
      expect(failures).toEqual([]);
    }, 60_000);
  }
});

describe("the printed-page layouts", () => {
  beforeAll(() => activateConventions({ pack: "general", learned: null, marker: "", house: defaultHouseFor("general") }));
  it("render a page of text, a PDF of it and a photo of it, with the same key", async () => {
    const shop = makeShop("general", 4);
    const rng = new Rng(9);
    const delivery = makeDelivery(shop, [shop.suppliers[0]], rng);
    const pages = await Promise.all(LAYOUTS.filter((l) => l.needsAi).map((l) => l.render(delivery, shop, rng)));
    expect(pages.map((p) => p.mime)).toEqual(["text/plain", "application/pdf", "image/jpeg"]);
    expect(pages[1].data.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pages[2].data.length).toBeGreaterThan(10_000);
    expect(pages.map((p) => JSON.stringify(p.key.lines))).toEqual([pages[0], pages[0], pages[0]].map((p) => JSON.stringify(p.key.lines)));
  }, 30_000);
});
