/**
 * A delivery against the catalogue the shop already has.
 *
 * The month's order is never all one thing. Some of it is a carry-over — the same ski, the same
 * glove, already listed and already selling — and some of it has never been in the shop. Doing
 * those two jobs separately means opening the export twice, matching by eye, and remembering which
 * of forty lines was which, which is how a carry-over gets built a second time under its own
 * handle and the shop ends up with two of it.
 *
 * So one file goes in and one comes out:
 *
 *   a line that matches something in the export   ->  its stock goes UP by what is arriving
 *   a line that matches nothing                   ->  a new draft product on the end of that file
 *
 * Both halves are proved before the file is handed over, and separately. The reorder half is the
 * same check every other change on this page passes: the rows that were there come back byte for
 * byte except where a change was asked for. The new half is the same check again with the rows
 * added on the end excused — see verifyOnlyIntended — so appending forty rows can never be cover
 * for a cell moving on row nine hundred.
 *
 * One thing this deliberately does not do: change a handle. Shopify matches an import on Handle,
 * so a new product whose handle already exists in the file is not a new product at all — it is an
 * edit to the one that has it, and importing it would rewrite that product's title, body and tags
 * from a line on an order form. Those are held back and named instead.
 */

import { DEFAULT_CATEGORY_RULES, detectCategory, metafieldColumns, type CategoryRuleLike } from "./categorize";
import { buildRows, parseCsv, type CsvProduct } from "./csv";
import { groupLineItems, type GroupedProduct } from "./grouping";
import { quote, verifyOnlyIntended, type Change } from "./adjust";
import { csvType } from "./pipeline-pure";
import { enrichFromSpecs } from "./specs";
import { productTitle, seasonTagFrom, seoTitle } from "./titles";
import { buildHandle } from "./handle";
import { applyInvoice, reconcile, type InvoiceFields, type InvoiceLine, type Match, type Reconciliation } from "./reconcile";
import type { CanonicalLineItem } from "./types";

export interface DeliveryOptions {
  /** The season the delivery is for, which an order form never says and the matcher needs. */
  season?: string;
  /** Which of the invoice's numbers to write onto the products that already exist. */
  fields?: InvoiceFields;
  /** The brand, for the products that have to be built. An order form seldom repeats it per line. */
  vendor?: string;
  /** Categorisation rules, where the app has its own. Defaults to the ones built in. */
  rules?: CategoryRuleLike[];
  /**
   * The spec sheet's rows, where one was loaded, for the products that have to be built.
   *
   * This is the other half of the delivery Burton and Volkl both send: an order form says what is
   * arriving and a spec export says what each thing IS. A carry-over needs none of it — the shop
   * wrote that listing last season — so these only ever reach the new products.
   */
  specs?: CanonicalLineItem[];
  /** Leave the new products off the end, and only add the stock. Default: both. */
  reorderOnly?: boolean;
}

/** A product the delivery had to build, as it will appear in the file. */
export interface FreshProduct {
  handle: string;
  title: string;
  vendor: string;
  type: string;
  tags: string[];
  /** Sizes or colourways, in the order they will be written. */
  variants: Array<{ option: string; barcode: string; quantity: number; price: string }>;
  /** True when the spec sheet or the order form gave it something to say. */
  described: boolean;
  rows: number;
}

export interface DeliveryResult {
  csv: string;
  /** Cells that moved on products the shop already had. */
  changes: Change[];
  /** The lines that were already in the file, with the rows they landed on. */
  carryOver: Match[];
  /** What was appended, and the rows it took. */
  fresh: FreshProduct[];
  /** Sizes added to products the shop already sells. */
  freshSizes: FreshSize[];
  appended: number;
  /** Lines that were left out of both halves, and why. */
  heldBack: Array<{ line: InvoiceLine; reason: string }>;
  reconciliation: Reconciliation;
  warnings: string[];
  refused?: boolean;
}

/** A size of a product the shop already sells that it has not had before. */
export interface FreshSize {
  handle: string;
  title: string;
  option: string;
  quantity: number;
}

/**
 * A delivery, end to end: the reorder written onto the file, then what the file has no room for.
 *
 * Three passes, each verified on its own, each taking the file the last one produced:
 *
 *   1  a line that matched a variant      its count goes up
 *   2  a line that matched a PRODUCT but a size it does not list   a variant row for that size
 *   3  a line that matched nothing        a new draft product
 *
 * That ordering is not incidental. Each pass is proved against the file it was handed, so a count
 * going up, a variant being added and a product being added can never claim the same row, and a
 * pass that cannot be written leaves the ones before it standing.
 */
export function buildDelivery(csv: string, lines: InvoiceLine[], options: DeliveryOptions = {}): DeliveryResult {
  const reconciliation = reconcile(csv, lines, { season: options.season });
  // A delivery ADDS by default. It is the whole point of this path: the goods are arriving.
  const fields: InvoiceFields = { rrp: true, quantity: true, stock: "add", ...options.fields };
  const reorder = applyInvoice(csv, reconciliation.matched, fields);
  if (reorder.refused) {
    return {
      csv, changes: [], carryOver: [], fresh: [], freshSizes: [], appended: 0, heldBack: [], reconciliation,
      warnings: reorder.warnings, refused: true,
    };
  }

  const heldBack: Array<{ line: InvoiceLine; reason: string }> = reconciliation.ambiguous.map((a) => ({ line: a.line, reason: a.reason }));
  const warnings = [...reorder.warnings];
  let csvSoFar = reorder.csv;
  let appended = 0;

  // Pass 2. A size the listing does not have is not a new product and not a count that can go
  // anywhere — applyInvoice says so and leaves it, and this is what to do about it.
  const sizes = options.reorderOnly
    ? { csv: csvSoFar, added: [] as FreshSize[], appended: 0, warnings: [] as string[], wanted: 0 }
    : appendSizes(csvSoFar, reconciliation.matched, fields);
  csvSoFar = sizes.csv;
  appended += sizes.appended;
  // applyInvoice says a size the listing has not got has to be added in Shopify first, which is
  // true where it is the only thing running and wrong here, because the pass above just added it.
  // Two warnings that contradict each other are worse than either, so the stale one goes.
  if (sizes.added.length === sizes.wanted && sizes.added.length > 0) {
    const stale = warnings.findIndex((w) => w.includes("there is no variant to put it on"));
    if (stale !== -1) warnings.splice(stale, 1);
  }
  warnings.push(...sizes.warnings);

  if (options.reorderOnly || reconciliation.unmatched.length === 0) {
    return { csv: csvSoFar, changes: reorder.changes, carryOver: reconciliation.matched, fresh: [], freshSizes: sizes.added, appended, heldBack, reconciliation, warnings };
  }

  const built = appendFresh(csvSoFar, reconciliation.unmatched, options, reconciliation.matched);
  if (built.refused) {
    // The passes before this one stand on their own and are already proved, so they are kept.
    // Losing a good half because the other half could not be written means doing it all by hand.
    return {
      csv: csvSoFar, changes: reorder.changes, carryOver: reconciliation.matched, fresh: [], freshSizes: sizes.added, appended,
      heldBack: [...heldBack, ...reconciliation.unmatched.map((line) => ({ line, reason: "the new products could not be written" }))],
      reconciliation, warnings: [...warnings, ...built.warnings],
    };
  }

  return {
    csv: built.csv,
    changes: reorder.changes,
    carryOver: reconciliation.matched,
    fresh: built.fresh,
    freshSizes: sizes.added,
    appended: appended + built.appended,
    heldBack: [...heldBack, ...built.heldBack],
    reconciliation,
    warnings: [...warnings, ...built.warnings],
  };
}

/** The columns that belong to a VARIANT rather than to the product it hangs under. */
const VARIANT_COLUMNS = new Set([
  "Handle", "Option1 Name", "Option1 Value", "Option2 Name", "Option2 Value", "Option3 Name", "Option3 Value",
  "Variant SKU", "Variant Grams", "Variant Inventory Tracker", "Variant Inventory Qty", "Variant Inventory Policy",
  "Variant Fulfillment Service", "Variant Price", "Variant Compare At Price", "Variant Requires Shipping",
  "Variant Taxable", "Variant Barcode", "Variant Barcodes", "Variant Weight Unit", "Variant Tax Code", "Cost per item",
]);

/**
 * A variant row for a size the shop has not stocked before.
 *
 * Two of the nine lines on their Volkl order are this: a Blaze 94 in 158 and a Mantra Junior in
 * 138, both skis the shop sells and neither in that length. Until now the answer was a warning
 * saying to add the size in Shopify first, which means doing the delivery in two places.
 *
 * It is written by copying a variant row the product already has and changing only what the order
 * names — so the new length arrives with the same weight band, the same inventory policy and the
 * same fulfilment service as its siblings, rather than this tool's idea of them. Every column that
 * belongs to the PRODUCT is cleared: an import row carrying a Title would be an edit to the
 * product, and this is only meant to add a variant to it.
 */
function appendSizes(
  csv: string,
  matched: Match[],
  fields: InvoiceFields,
): { csv: string; added: FreshSize[]; appended: number; warnings: string[]; wanted: number } {
  const wanted = matched.filter((m) => m.sizeMissing && (m.line.size ?? "").trim() !== "");
  if (wanted.length === 0) return { csv, added: [], appended: 0, warnings: [], wanted: 0 };

  const grid = parseCsv(csv).filter((r) => r.some((c) => c.trim() !== ""));
  const header = grid[0] ?? [];
  const at = new Map(header.map((h, i) => [h, i]));
  const optionValue = at.get("Option1 Value");
  const titleAt = at.get("Title");
  if (optionValue === undefined) {
    return { csv, added: [], appended: 0, wanted: wanted.length, warnings: ["The invoice orders sizes this listing does not have, and this export has no Option1 Value column to add them under, so they were left out."] };
  }

  const rows: string[] = [];
  const added: FreshSize[] = [];
  for (const m of wanted) {
    const size = (m.line.size ?? "").trim();
    // A row of this product that is NOT its first: it carries the variant and nothing of the
    // product, which is exactly the shape a new variant needs. Its first row will do otherwise.
    const template = m.productRows.find((r) => r > (m.productRows[0] ?? 0)) ?? m.productRows[0];
    const source = grid[template];
    if (!source) continue;
    // Never twice, and never a size the product turns out to have after all.
    const existing = new Set(m.productRows.map((r) => (grid[r]?.[optionValue] ?? "").trim().toLowerCase()));
    if (existing.has(size.toLowerCase()) || added.some((a) => a.handle === m.handle && a.option.toLowerCase() === size.toLowerCase())) continue;

    const row = header.map((column, i) => (VARIANT_COLUMNS.has(column) ? (source[i] ?? "") : ""));
    row[optionValue] = size;
    // Shopify writes an option's NAME on a product's first row only, so a template taken from a
    // later row has none. The importer does not need it for a product that already exists, but a
    // variant row with a value and no name is a thing somebody reading the file has to work out.
    for (const name of ["Option1 Name", "Option2 Name", "Option3 Name"]) {
      const i = at.get(name);
      if (i !== undefined && !(row[i] ?? "").trim()) row[i] = (grid[m.productRows[0]]?.[i] ?? "").trim();
    }
    const write = (column: string, value: string) => {
      const i = at.get(column);
      if (i !== undefined && value !== "") row[i] = value;
    };
    // A brand new variant holds only what is arriving, whichever way the counts are being written:
    // there is nothing on a shelf for a size the shop has never had.
    if (fields.quantity && m.line.quantity !== null) write("Variant Inventory Qty", String(Math.max(0, Math.round(m.line.quantity))));
    else write("Variant Inventory Qty", "0");
    if (m.line.rrp !== null && m.line.rrp > 0) {
      if (fields.price) write("Variant Price", m.line.rrp.toFixed(2));
      if (fields.rrp) write("Variant Compare At Price", m.line.rrp.toFixed(2));
    }
    const barcode = m.line.barcode.trim();
    if (barcode) { write("Variant Barcodes", barcode); write("Variant Barcode", barcode); }
    else { const b = at.get("Variant Barcodes") ?? at.get("Variant Barcode"); if (b !== undefined) row[b] = ""; }

    rows.push(header.map((_, i) => quote(row[i] ?? "")).join(","));
    added.push({ handle: m.handle, title: (grid[m.productRows[0]]?.[titleAt ?? -1] ?? "").trim(), option: size, quantity: Math.max(0, Math.round(m.line.quantity ?? 0)) });
  }
  if (rows.length === 0) return { csv, added: [], appended: 0, warnings: [], wanted: wanted.length };

  const body = csv.endsWith("\r\n") || csv.endsWith("\n") ? csv : `${csv}\r\n`;
  const out = body + rows.join("\r\n") + "\r\n";
  const unintended = verifyOnlyIntended(grid, out, [], { appended: rows.length });
  if (unintended.length > 0) {
    return {
      csv, added: [], appended: 0, wanted: wanted.length,
      warnings: [`The new sizes were NOT added. A check found ${unintended.length} thing${unintended.length === 1 ? "" : "s"} about the rest of the file that would have changed, which is a fault in this tool rather than anything you did. Please report it.`, ...unintended.slice(0, 5)],
    };
  }
  return {
    csv: out, added, appended: rows.length, wanted: wanted.length,
    warnings: [`${added.length} size${added.length === 1 ? "" : "s"} the shop has not stocked before ${added.length === 1 ? "was" : "were"} added as ${added.length === 1 ? "a variant" : "variants"} of ${added.length === 1 ? "the product" : "the products"} that already ${added.length === 1 ? "has" : "have"} the others — ${added.slice(0, 4).map((a) => `${a.option} of ${a.title || a.handle}`).join(", ")}${added.length > 4 ? `, and ${added.length - 4} more` : ""}. Each copies the settings of a size that product already carries.`],
  };
}

/**
 * Build the products that are not in the shop yet, and write them on the end of the file.
 *
 * They are written through the loaded export's OWN header, not the importer's: an import CSV only
 * has to carry the columns it wants to set, and rewriting the header would mean every row in the
 * file had to be rewritten to match it. So a column the export does not have is dropped, and the
 * specs that would have gone into one are said out loud rather than silently lost.
 */
function appendFresh(
  csv: string,
  lines: InvoiceLine[],
  options: DeliveryOptions,
  carryOver: Match[],
): { csv: string; fresh: FreshProduct[]; appended: number; heldBack: Array<{ line: InvoiceLine; reason: string }>; warnings: string[]; refused?: boolean } {
  const grid = parseCsv(csv).filter((r) => r.some((c) => c.trim() !== ""));
  const header = grid[0] ?? [];
  const at = new Map(header.map((h, i) => [h, i]));
  const handleColumn = at.get("Handle");
  const warnings: string[] = [];
  const heldBack: Array<{ line: InvoiceLine; reason: string }> = [];

  if (handleColumn === undefined) {
    return { csv, fresh: [], appended: 0, heldBack: lines.map((line) => ({ line, reason: "the file has no Handle column, so nothing can be added to it" })), warnings, refused: true };
  }

  const taken = new Set(grid.slice(1).map((r) => (r[handleColumn] ?? "").trim()).filter(Boolean));
  const vendor = (options.vendor ?? "").trim();
  const season = (options.season ?? "").trim();
  const items = lines.map((line) => canonical(line, vendor, season));
  const rules = options.rules ?? DEFAULT_CATEGORY_RULES;
  const fallback = typeFromCarryOver(grid, at, carryOver, rules);
  const grouped = enrichFromSpecs(
    groupLineItems(items, fallback ? [...rules, fallback] : rules),
    options.specs ?? [],
  );
  if (fallback) {
    // Nothing in this product's own wording said what it is; only the rest of the delivery did.
    const unrecognised = grouped.filter((g) => g.variants.every((v) => !detectCategory(v.item, rules)));
    if (unrecognised.length > 0) {
      warnings.push(`${unrecognised.length === 1 ? "One new product was" : `${unrecognised.length} new products were`} filed as ${fallback.productType} because that is what everything else in this delivery is — ${unrecognised.slice(0, 4).map((g) => productTitle(g.title, seasonTagFrom(g.tags))).join(", ")}${unrecognised.length > 4 ? `, and ${unrecognised.length - 4} more` : ""}. An order form seldom says what a thing is, so check ${unrecognised.length === 1 ? "it is" : "they are"} not something else that came in the same order.`);
    }
  }
  if (!fallback && grouped.some((g) => !g.productType.trim())) {
    warnings.push("Some of the new products have no Type. An order form seldom says what a thing is, and nothing in this delivery matched a product already in the file to read it off. Set the Type in Shopify once they are imported, or load the export that has this supplier's other products in it.");
  }

  const lineOf = (product: GroupedProduct): InvoiceLine[] => product.variants.map((v) => lines[v.sourceIndex]).filter(Boolean);

  const build: GroupedProduct[] = [];
  for (const product of grouped) {
    const clash = handlesFor(product, vendor).find((h) => taken.has(h));
    if (clash) {
      // Not a new product: the handle is the shop's key. See the note at the top of this file.
      for (const line of lineOf(product)) heldBack.push({ line, reason: `${clash} is already in this file under that URL, so adding it would edit that product rather than create one` });
      continue;
    }
    build.push(product);
  }
  if (build.length === 0) return { csv, fresh: [], appended: 0, heldBack, warnings };

  const products = build.map((g) => toProduct(g, vendor));
  const rows = buildRows(products);
  const missing = new Set<string>();
  const lines_ = rows.map((row) => {
    for (const column of Object.keys(row)) if (!at.has(column) && (row[column] ?? "") !== "") missing.add(column);
    return header.map((column) => quote(row[column] ?? "")).join(",");
  });
  if (missing.size > 0) {
    warnings.push(`This export has no column for ${[...missing].slice(0, 6).join(", ")}${missing.size > 6 ? ` and ${missing.size - 6} more` : ""}, so ${missing.size === 1 ? "that" : "those"} could not be written onto the new products. Everything else went on. Adding a column would mean rewriting every row of the file, which is not something this will do to an export somebody is about to import.`);
  }

  const body = csv.endsWith("\r\n") || csv.endsWith("\n") ? csv : `${csv}\r\n`;
  const out = body + lines_.join("\r\n") + "\r\n";

  const unintended = verifyOnlyIntended(grid, out, [], { appended: lines_.length });
  if (unintended.length > 0) {
    return {
      csv, fresh: [], appended: 0, heldBack, refused: true,
      warnings: [`The new products were NOT added. A check found ${unintended.length} thing${unintended.length === 1 ? "" : "s"} about the rest of the file that would have changed, which is a fault in this tool rather than anything you did. Please report it.`, ...unintended.slice(0, 5)],
    };
  }

  const counted = new Map<string, number>();
  for (const row of rows) counted.set(row.Handle, (counted.get(row.Handle) ?? 0) + 1);
  const fresh: FreshProduct[] = build.map((g, i) => {
    const product = products[i];
    return {
      handle: product.handle,
      title: product.title,
      vendor: product.vendor ?? "",
      type: product.productType ?? "",
      tags: product.tags ?? [],
      variants: product.variants.map((v) => ({
        option: [v.option1Value, v.option2Value, v.option3Value].filter(Boolean).join(" / "),
        barcode: v.barcode ?? "",
        quantity: v.quantity ?? 0,
        price: v.price > 0 ? v.price.toFixed(2) : "",
      })),
      described: (product.bodyHtml ?? "").trim() !== "",
      rows: counted.get(product.handle) ?? g.variants.length,
    };
  });

  return { csv: out, fresh, appended: lines_.length, heldBack, warnings };
}

/**
 * What kind of thing this delivery is, read off the products it already matched.
 *
 * An order form does not say. Volkl's December workbook names 375 skis and the word "ski" is not on
 * any line of it, so the categoriser has nothing to go on and the new products came out with no
 * Type, no collection and no options — a ski listed with "Default Title" instead of its lengths.
 *
 * The file itself knows. Every Volkl product in the shop's ski export carries Type "Skis", all 452
 * of them, so the carry-overs in the same delivery say what the new ones are. It is added as the
 * LOWEST priority rule rather than forced onto everything: a delivery of skis that also has a pair
 * of Griffon bindings in it still files the bindings as bindings, and only what nothing else
 * recognised falls through to this.
 */
function typeFromCarryOver(
  grid: string[][],
  at: Map<string, number>,
  carryOver: Match[],
  rules: CategoryRuleLike[],
): CategoryRuleLike | null {
  const typeAt = at.get("Type");
  if (typeAt === undefined || carryOver.length === 0) return null;
  const types = new Set(
    carryOver.flatMap((m) => m.productRows).map((row) => (grid[row]?.[typeAt] ?? "").trim()).filter(Boolean),
  );
  // One answer only. A delivery matching both skis and gloves says nothing about what a third
  // thing is, and guessing at that point files a product on the wrong shelf.
  if (types.size !== 1) return null;
  const type = [...types][0];
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const known = rules.find((r) => same(r.productType, type) || same(csvType(r.productType, r.collections.split(",")), type));
  // A rule that matches everything, last. Its options and collections are the ones the shop
  // already uses for this Type; where no rule names the Type, at least the Type itself travels.
  return known
    ? { ...known, pattern: ".*", priority: -1 }
    : { category: "other", pattern: ".*", productType: type, collections: type, tags: "", option1: null, option2: null, option3: null, priority: -1, active: true };
}

/**
 * Every URL this product might already be in the shop under.
 *
 * The importer builds a handle with the brand on the front — volkl-m7-mantra-2027 — and the shop
 * does not: of its 928 products with a vendor, 83 have the vendor in the handle and 845 do not. So
 * checking only the handle this tool would write misses the collision it exists to catch, and the
 * shop ends up with the same ski twice. Both spellings are checked, and the one that is already
 * taken is the one reported, because that is the product somebody has to go and look at.
 */
function handlesFor(product: GroupedProduct, vendor: string): string[] {
  const title = productTitle(product.title, seasonTagFrom(product.tags));
  const brand = product.brand || vendor;
  return [...new Set([product.handle, buildHandle({ title }), buildHandle({ brand, title })])].filter(Boolean);
}

/**
 * One order line as the importer's own line item.
 *
 * Only two judgements are made here. A size that is two or three bare digits is a ski or board
 * LENGTH, not a garment size — their order forms write both in the same column and the shop lists
 * them under different option names. And the invoice's recommended retail is also the cost field's
 * answer of last resort for nothing: a delivery that is being listed is priced at RRP, and what
 * the shop paid is not in the export at all.
 */
function canonical(line: InvoiceLine, vendor: string, season: string): CanonicalLineItem {
  const size = (line.size ?? "").trim();
  const isLength = /^\d{2,3}(\.\d)?$/.test(size);
  return {
    title: line.title.trim(),
    brand: vendor,
    modelCode: line.sku.trim(),
    sku: "",
    barcode: line.barcode.trim(),
    costPrice: line.costPrice,
    quantity: line.quantity,
    rrp: line.rrp,
    grams: null,
    length: isLength ? size : "",
    size: isLength ? "" : size,
    width: "",
    colour: (line.colour ?? "").trim(),
    gender: "",
    season,
    category: "",
    productType: "",
    description: "",
    flex: "", abilityLevel: "", dinRange: "", terrain: "",
    imageUrls: [],
    collections: "",
    tags: "",
  };
}

/**
 * A grouped product as a row-builder product.
 *
 * No landed-cost pricing here, deliberately. The importer works out a retail price from what the
 * shop paid, freight and a margin, and none of those are on an order form — what IS on one is the
 * supplier's recommended retail, which is what this shop prices at. So the RRP is the price, and
 * Compare At is left empty: a product on the shelf at its recommended retail is not on sale.
 */
function toProduct(g: GroupedProduct, vendor: string): CsvProduct {
  const title = productTitle(g.title, seasonTagFrom(g.tags));
  const brand = g.brand || vendor;
  return {
    handle: g.handle,
    title,
    bodyHtml: g.description.trim() ? `<p>${g.description.trim()}</p>` : "",
    vendor: brand,
    productType: csvType(g.productType, g.collections),
    tags: g.tags,
    published: false,
    status: "draft",
    seoTitle: seoTitle(brand, title),
    seoDescription: "",
    option1Name: g.option1Name,
    option2Name: g.option2Name,
    option3Name: g.option3Name,
    metafields: metafieldColumns(g.metafields),
    images: [],
    variants: g.variants.map((v) => ({
      sku: "",
      barcode: v.item.barcode,
      option1Value: v.option1Value,
      option2Value: v.option2Value,
      option3Value: v.option3Value,
      quantity: v.item.quantity ?? 0,
      price: v.item.rrp ?? 0,
      compareAtPrice: null,
      costPerItem: v.item.costPrice,
    })),
  };
}
