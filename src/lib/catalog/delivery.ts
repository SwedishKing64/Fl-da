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
import { audienceOfPrefix, withFit, withoutAudiencePrefix } from "./mapping";
import { expandShorthand } from "./shorthand";
import { colourName } from "./colour";
import { writeOutSize } from "./options";
import { quote, verifyOnlyIntended, type Change } from "./adjust";
import { csvType, productCategoryFor } from "./pipeline-pure";
import { houseBody } from "./body";
import { enrichFromSpecs } from "./specs";
import { productTitle, seasonTagFrom, seoTitle } from "./titles";
import { buildHandle } from "./handle";
import { applyInvoice, reconcile, sameSizeText, type InvoiceFields, type InvoiceLine, type Match, type Reconciliation } from "./reconcile";
import { resolveAgainstReference } from "./reference-match";
import { asShopPrice, listingsFromCsv, rememberedVendor, type Listing } from "./shop-memory";
import { brandIn, isDistributor } from "./brands";
import { isFlatSki, isPackageBinding, packageProducts } from "./packages";
import type { PriceRow } from "./invoice";
import type { CanonicalLineItem } from "./types";
import type { PageDetails } from "./page-types";

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
  /**
   * Lines the rules could not place on the spec sheet, placed by the model: order line index to
   * reference row. See askToJoin.
   */
  decided?: Map<number, CanonicalLineItem>;
  /** Which loaded file a spec row came from, so a line joined to one file is not filled in from lines joined to another. */
  sourceOf?: (spec: CanonicalLineItem) => string;
  /** The shop's listings, from every loaded export, for what it decided about a model last season. */
  listings?: Listing[];
  /** Every priced row of the order form, ordered or not — what a binding package is priced from. */
  priceList?: PriceRow[];
  /** Leave the new products off the end, and only add the stock. Default: both. */
  reorderOnly?: boolean;
  /**
   * What each new product's own web page said, keyed by the index of one of its lines on the
   * invoice. Read beforehand, on the server, from the links somebody pasted under each product's
   * name; a product with no entry is built exactly as it would have been without.
   *
   * By line, not by name: what a product is CALLED can change between the preview somebody typed a
   * link under and the build (the model may place a line on the spec sheet and rename it), but the
   * lines of the invoice do not. A ski's package is made from the ski's lines, so it takes the
   * ski's page without being asked.
   */
  pages?: Record<number, PageDetails>;
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
  /** Which lines of the invoice it was built from, for matching a link to it. */
  lines: number[];
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
  /** The line's place on the invoice as a whole — what a page linked to this variant is keyed by. */
  line: number;
  /** The colour, where the product is sold by colour. */
  colour?: string;
  /** A colour the listing did not have: pictures of it are wanted, as for a new product. */
  newColour?: boolean;
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
export function buildDelivery(csv: string, invoiced: InvoiceLine[], options: DeliveryOptions = {}): DeliveryResult {
  // The recommended retail ending the way the shop ends this brand's prices — Völkl's 1649 is the
  // shop's 1649.99 — so a carry-over's Compare At is not cut by 99 cents. See asShopPrice.
  const shop = [...(options.listings ?? []), ...listingsFromCsv(csv)];
  // The vendor typed on the page counts only if it is a brand: the distributor's name is not one.
  // Each line then takes its own brand where the form or the shop says one. See brands.ts.
  const vendors = [...new Set(shop.map((l) => l.vendor).filter(Boolean))];
  const typed = (options.vendor ?? "").trim();
  // A name typed on the page is a decision, kept unless it is the distributor's: Helly Hansen is not
  // on any list the first time the shop buys it. See brands.ts.
  options = { ...options, vendor: isDistributor(typed) ? "" : typed };
  const ordered = invoiced.map((line) => {
    const brand = (line.brand ?? "").trim() || rememberedVendor(line.title, shop) || brandIn(line.title, vendors) || options.vendor || "";
    return withBarcode({ ...line, ...(brand ? { brand } : {}), rrp: asShopPrice(line.rrp, brand, shop) }, options.specs ?? []);
  });
  // The order's wording, put into the shop's before anything is matched: see joinToReference.
  const joined = joinToReference(ordered, options);
  const lines = joined.lines;
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
  const warnings = [...joined.warnings, ...reorder.warnings];
  let csvSoFar = reorder.csv;
  let appended = 0;

  // Pass 2. A size the listing does not have is not a new product and not a count that can go
  // anywhere — applyInvoice says so and leaves it, and this is what to do about it.
  const sizes = options.reorderOnly
    ? { csv: csvSoFar, added: [] as FreshSize[], appended: 0, warnings: [] as string[], wanted: 0 }
    : appendSizes(csvSoFar, reconciliation.matched, fields, options.pages ?? {}, (line) => lines.indexOf(line));
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

  // Pass 2b. The same skis on their package listings. See mirrorToPackages.
  const mirrored = fields.quantity ? mirrorToPackages(csvSoFar, reconciliation.matched, fields) : { csv: csvSoFar, changes: [] as Change[], appended: 0, warnings: [] as string[] };
  csvSoFar = mirrored.csv;
  appended += mirrored.appended;
  reorder.changes.push(...mirrored.changes);
  warnings.push(...mirrored.warnings);

  if (options.reorderOnly || reconciliation.unmatched.length === 0) {
    return { csv: csvSoFar, changes: reorder.changes, carryOver: reconciliation.matched, fresh: [], freshSizes: sizes.added, appended, heldBack, reconciliation, warnings };
  }

  // The new products' lines are told by their place on the invoice, which is how a page linked to
  // a product on the screen finds it here: the unmatched lines are a subset, so their own order is not it.
  const built = appendFresh(csvSoFar, reconciliation.unmatched, options, reconciliation.matched, joined.items, (line) => lines.indexOf(line));
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

/**
 * The skis that arrived, counted onto their binding packages as well.
 *
 * The shop lists each ski twice — "M7 Mantra 2027" and "M7 Mantra 2027 inc Marker Griffon Binding
 * Package" — and both show the same stock, because they are the same skis: every variant of a
 * package carries the count of its length (their M7 Mantra 170 is 3 on the flat listing and 3 on
 * each of the package's variants). So two M7 Mantras in 177 arriving are two more on the flat ski
 * AND two more on every 177 of its package; counted onto the flat one only, the package would go on
 * saying they were out of stock.
 *
 * A length the package does not list yet is added to it under each binding and fitting it offers,
 * copied from a length it has — the same way a new size is added to the flat ski.
 */
function mirrorToPackages(
  csv: string,
  matched: Match[],
  fields: InvoiceFields,
): { csv: string; changes: Change[]; appended: number; warnings: string[] } {
  const grid = parseCsv(csv).filter((r) => r.some((c) => c.trim() !== ""));
  const header = grid[0] ?? [];
  const at = new Map(header.map((h, i) => [h, i]));
  const [H, T, Q] = [at.get("Handle"), at.get("Title"), at.get("Variant Inventory Qty")];
  if (H === undefined || T === undefined || Q === undefined) return { csv, changes: [], appended: 0, warnings: [] };

  const norm = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();
  const rowsOf = new Map<string, number[]>();
  const titleOf = new Map<string, string>();
  for (let r = 1; r < grid.length; r++) {
    const handle = (grid[r][H] ?? "").trim();
    if (!handle) continue;
    rowsOf.set(handle, [...(rowsOf.get(handle) ?? []), r]);
    const title = (grid[r][T] ?? "").trim();
    if (title && !titleOf.has(handle)) titleOf.set(handle, title);
  }
  // Package listings by the flat ski they are: the part of the title before " inc ".
  const packagesOf = new Map<string, string[]>();
  for (const [handle, title] of titleOf) {
    const m = /^(.*?)\s+inc\s+.*\bpackage\b/i.exec(title);
    if (!m) continue;
    const flat = norm(m[1]);
    packagesOf.set(flat, [...(packagesOf.get(flat) ?? []), handle]);
  }
  if (packagesOf.size === 0) return { csv, changes: [], appended: 0, warnings: [] };

  /** The option column holding the length on this product, from its first row's option names. */
  const lengthColumn = (first: string[]): number | undefined => {
    for (const n of [1, 2, 3]) {
      const name = at.get(`Option${n} Name`);
      if (name !== undefined && /length|size/i.test(first[name] ?? "")) return at.get(`Option${n} Value`);
    }
    return undefined;
  };

  const changes: Change[] = [];
  const added: string[][] = [];
  const touched: string[] = [];
  for (const m of matched) {
    const size = (m.line.size ?? "").trim();
    const qty = m.line.quantity;
    if (!size || qty === null || qty <= 0) continue;
    const flatTitle = titleOf.get(m.handle) ?? "";
    if (!flatTitle || /\binc\b/i.test(flatTitle)) continue;
    for (const pack of packagesOf.get(norm(flatTitle)) ?? []) {
      const rows = rowsOf.get(pack) ?? [];
      const first = grid[rows[0]] ?? [];
      const L = lengthColumn(first);
      if (L === undefined) continue;
      const same = rows.filter((r) => sameSizeText(grid[r][L] ?? "", size));
      if (same.length > 0) {
        for (const r of same) {
          const before = (grid[r][Q] ?? "").trim();
          const held = Number(before);
          const after = String(fields.stock === "set" ? Math.round(qty) : (Number.isFinite(held) ? held : 0) + Math.round(qty));
          if (after === before) continue;
          grid[r][Q] = after;
          changes.push({ handle: pack, title: r === rows[0] ? titleOf.get(pack) ?? "" : "", column: "Variant Inventory Qty", before, after });
        }
      } else {
        // A new length: one row per binding and fitting the package offers, copied from a length it has.
        const combos = new Map<string, number>();
        for (const r of rows) {
          const key = header.map((h, i) => (/^Option\d Value$/.test(h) && i !== L ? grid[r][i] ?? "" : "")).join("\u0000");
          if (!combos.has(key)) combos.set(key, r);
        }
        for (const r of combos.values()) {
          const row = header.map((column, i) => (VARIANT_COLUMNS.has(column) ? (grid[r][i] ?? "") : ""));
          row[H] = pack;
          row[L] = size;
          row[Q] = String(Math.round(qty));
          for (const name of ["Variant SKU", "Variant Barcodes", "Variant Barcode"]) { const i = at.get(name); if (i !== undefined) row[i] = name === "Variant SKU" ? "" : m.line.barcode.trim(); }
          for (const name of ["Option1 Name", "Option2 Name", "Option3 Name"]) { const i = at.get(name); if (i !== undefined && !(row[i] ?? "").trim()) row[i] = (first[i] ?? "").trim(); }
          added.push(row);
        }
      }
      touched.push(`${size} of ${titleOf.get(pack) ?? pack}`);
    }
  }
  if (changes.length === 0 && added.length === 0) return { csv, changes: [], appended: 0, warnings: [] };

  const out = [header, ...grid.slice(1), ...added].map((row) => header.map((_, i) => quote(row[i] ?? "")).join(",")).join("\r\n") + "\r\n";
  // The grid above was changed in place, so the check is against the file it came from.
  const original = parseCsv(csv).filter((r) => r.some((c) => c.trim() !== ""));
  const problems = verifyOnlyIntended(original, out, changes, { appended: added.length });
  if (problems.length > 0) {
    return { csv, changes: [], appended: 0, warnings: [`The stock was NOT put onto the binding packages. A check found ${problems.length} thing${problems.length === 1 ? "" : "s"} about the rest of the file that would have changed, which is a fault in this tool rather than anything you did.`, ...problems.slice(0, 3)] };
  }
  return {
    csv: out, changes, appended: added.length,
    warnings: [`The same skis were counted onto their binding packages, which show the same stock as the flat ski: ${[...new Set(touched)].slice(0, 6).join(", ")}${touched.length > 6 ? ", and more" : ""}.${added.length > 0 ? ` ${added.length} package row${added.length === 1 ? " was" : "s were"} added for lengths the package did not list yet.` : ""}`],
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
  /** The pages somebody linked, by the line's place on the invoice: a new colourway takes its pictures from one. */
  pages: Record<number, PageDetails> = {},
  placeOf: (line: InvoiceLine) => number = () => -1,
): { csv: string; added: FreshSize[]; appended: number; warnings: string[]; wanted: number } {
  // A size the listing has not got, or a colour it has not got: either is a variant to add.
  const wanted = matched.filter((m) => (m.sizeMissing && (m.line.size ?? "").trim() !== "") || (m.colourMissing && (m.line.colour ?? "").trim() !== ""));
  if (wanted.length === 0) return { csv, added: [], appended: 0, warnings: [], wanted: 0 };

  const grid = parseCsv(csv).filter((r) => r.some((c) => c.trim() !== ""));
  const header = grid[0] ?? [];
  const at = new Map(header.map((h, i) => [h, i]));
  const optionValue = at.get("Option1 Value");
  const titleAt = at.get("Title");
  if (optionValue === undefined) {
    return { csv, added: [], appended: 0, wanted: wanted.length, warnings: ["The invoice orders sizes this listing does not have, and this export has no Option1 Value column to add them under, so they were left out."] };
  }

  /**
   * Which option holds the size on this product. Not always the first: the shop's Process 2027 is
   * Colour then Length, and writing the new length into Option1 gave it Colour "152" with the
   * sibling's Length "157W" copied beside it.
   */
  const sizeColumn = (first: string[] | undefined): number => {
    for (const n of [1, 2, 3]) {
      const name = at.get(`Option${n} Name`);
      const value = at.get(`Option${n} Value`);
      if (name !== undefined && value !== undefined && /length|size|mondo|width/i.test(first?.[name] ?? "")) return value;
    }
    return optionValue;
  };

  /** Which option holds the colour, where the product has one. */
  const colourColumn = (first: string[] | undefined): number | undefined => {
    for (const n of [1, 2, 3]) {
      const name = at.get(`Option${n} Name`);
      const value = at.get(`Option${n} Value`);
      if (name !== undefined && value !== undefined && /colou?r/i.test(first?.[name] ?? "")) return value;
    }
    return undefined;
  };

  const rows: string[] = [];
  const added: FreshSize[] = [];
  for (const m of wanted) {
    const size = (m.line.size ?? "").trim();
    const sizeAt = sizeColumn(grid[m.productRows[0]]);
    const colourAt = colourColumn(grid[m.productRows[0]]);
    const colour = colourAt !== undefined ? colourName((m.line.colour ?? "").trim()) : "";
    // The size spelled as this product spells its sizes — "Medium" beside "Medium", not "M".
    const sizeSpelled = m.productRows.map((r) => (grid[r]?.[sizeAt] ?? "").trim()).find((v) => v && size && sameSizeText(size, v)) ?? writeOutSize(size);
    // A row of this product that is NOT its first: it carries the variant and nothing of the
    // product, which is exactly the shape a new variant needs. Its first row will do otherwise.
    const template = m.productRows.find((r) => r > (m.productRows[0] ?? 0)) ?? m.productRows[0];
    const source = grid[template];
    if (!source) continue;
    // Never twice, and never a variant the product turns out to have after all. A variant is its
    // size AND its colour where the product has both: True Black M is not Green Voltage M.
    const variantOf = (sz: string, col: string) => `${sz.toLowerCase()}|${col.toLowerCase()}`;
    const option = [colour, sizeSpelled].filter(Boolean).join(" / ");
    const existing = new Set(m.productRows.map((r) => variantOf((grid[r]?.[sizeAt] ?? "").trim(), colourAt !== undefined ? (grid[r]?.[colourAt] ?? "").trim() : "")));
    if (existing.has(variantOf(sizeSpelled, colour)) || added.some((a) => a.handle === m.handle && a.option.toLowerCase() === option.toLowerCase())) continue;

    const row = header.map((column, i) => (VARIANT_COLUMNS.has(column) ? (source[i] ?? "") : ""));
    if (sizeSpelled) row[sizeAt] = sizeSpelled;
    // The template row's colour is the template's; this variant's is the order's.
    if (colourAt !== undefined && colour) row[colourAt] = colour;
    // The sibling's own SKU and cost are the sibling's. The order's go on, or nothing.
    const skuAt = at.get("Variant SKU");
    if (skuAt !== undefined) row[skuAt] = m.line.sku.trim();
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
    if (m.line.costPrice !== null && m.line.costPrice > 0) write("Cost per item", m.line.costPrice.toFixed(2));
    const barcode = m.line.barcode.trim();
    if (barcode) { write("Variant Barcodes", barcode); write("Variant Barcode", barcode); }
    else { const b = at.get("Variant Barcodes") ?? at.get("Variant Barcode"); if (b !== undefined) row[b] = ""; }

    /**
     * A new colourway's pictures. The listing's own pictures are of its other colours, so a page
     * linked to this variant gives it its own: the first as the variant's picture, all of them on
     * the product, after the pictures it has. A new size of a colour the listing has needs none.
     */
    const place = placeOf(m.line);
    const page = m.colourMissing ? pages[place] : undefined;
    const imageRows: string[][] = [];
    if (page && page.images.length > 0) {
      const variantImage = at.get("Variant Image");
      if (variantImage !== undefined) row[variantImage] = page.images[0];
      const src = at.get("Image Src"), position = at.get("Image Position"), alt = at.get("Image Alt Text");
      if (src !== undefined) {
        const have = new Set(m.productRows.map((r) => (grid[r]?.[src] ?? "").trim()).filter(Boolean));
        const last = Math.max(0, ...m.productRows.map((r) => Number(grid[r]?.[position ?? -1] ?? 0) || 0));
        let n = 0;
        for (const image of page.images.filter((u) => !have.has(u))) {
          const picture = header.map((column, i) => (column === "Handle" ? (row[i] ?? "") : ""));
          picture[src] = image;
          if (position !== undefined) picture[position] = String(last + ++n);
          if (alt !== undefined) picture[alt] = `${(grid[m.productRows[0]]?.[titleAt ?? -1] ?? "").trim()} ${colour}`.trim();
          imageRows.push(picture);
        }
      }
    }
    rows.push(header.map((_, i) => quote(row[i] ?? "")).join(","));
    for (const picture of imageRows) rows.push(header.map((_, i) => quote(picture[i] ?? "")).join(","));
    added.push({ handle: m.handle, title: (grid[m.productRows[0]]?.[titleAt ?? -1] ?? "").trim(), option, quantity: Math.max(0, Math.round(m.line.quantity ?? 0)), line: place, ...(colour ? { colour } : {}), ...(m.colourMissing ? { newColour: true } : {}) });
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
  resolved: Map<InvoiceLine, CanonicalLineItem> = new Map(),
  /** A line's place on the invoice as a whole — what a product's `lines` and a linked page are keyed by. */
  placeOf: (line: InvoiceLine) => number = (line) => lines.indexOf(line),
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
  const items = lines.map((line) => resolved.get(line) ?? canonical(line, vendor, season));
  const rules = options.rules ?? DEFAULT_CATEGORY_RULES;
  const fallback = typeFromCarryOver(grid, at, carryOver, rules);
  const grouped = enrichFromSpecs(
    groupLineItems(items, fallback ? [...rules, fallback] : rules, { listings: [...(options.listings ?? []), ...listingsFromCsv(csv)] }),
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
  // The package bindings ordered with skis go on the skis, not on the shelf. See isPackageBinding.
  const skiDelivery = build.some((g) => isFlatSki(g)) || /^skis?$/i.test(fallback?.productType ?? "");
  if (skiDelivery) {
    for (const g of build.filter((p) => isPackageBinding(p))) {
      build.splice(build.indexOf(g), 1);
      // Accounted for as a line that was not written, with why — not dropped without a word.
      for (const line of lineOf(g)) heldBack.push({ line, reason: "it is the binding the ski packages are made with, ordered to go on the skis, so it is not listed on its own" });
    }
  }
  // Each new flat ski is also built as its binding package, priced from the order form's own
  // binding rows. A package the file already has is left alone, like any other product.
  const { packages, skipped } = packageProducts(build, options.priceList ?? [], [...(options.listings ?? []), ...listingsFromCsv(csv)]);
  for (const pack of packages) if (!taken.has(pack.handle)) build.push(pack);
  for (const k of skipped) warnings.push(`No binding package was built for ${k.title}: ${k.reason}.`);
  if (build.length === 0) return { csv, fresh: [], appended: 0, heldBack, warnings };

  // The pages somebody linked: a description and details list, and the page's own pictures.
  const withPages = options.pages ?? {};
  const pageOf = (g: GroupedProduct): PageDetails | undefined => {
    for (const v of g.variants) { const page = withPages[placeOf(lines[v.sourceIndex])]; if (page) return page; }
    return undefined;
  };
  for (const g of build) {
    const page = pageOf(g);
    if (!page) continue;
    const body = houseBody(page.description, page.features);
    if (body) g.description = body;
    if (page.images.length > 0) g.imageUrls = [...new Set([...g.imageUrls, ...page.images])];
  }
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
      lines: g.variants.map((v) => placeOf(lines[v.sourceIndex])),
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
 * A line's barcode from the barcode list, where the order form did not print one.
 *
 * Völkl's order has the item code and the length in two places — "V2610135.000" under 158 — and
 * its barcode list has them as one: "V2610135.000.158", 821264839478. Without it a new length
 * added to a listing went on with no barcode, and a carry-over could only be matched by name.
 * Only an answer the list gives once: two different barcodes for one code and length is no answer.
 */
function withBarcode(line: InvoiceLine, specs: CanonicalLineItem[]): InvoiceLine {
  const code = line.sku.trim().toUpperCase();
  const size = (line.size ?? "").trim().toUpperCase();
  if (line.barcode.trim() || !code || !size) return line;
  const key = (v: string) => v.trim().toUpperCase().replace(/\s+/g, "");
  const want = key(`${code}.${size}`);
  const found = new Set(
    specs
      .filter((s) => s.barcode.trim() && ([s.sku, s.modelCode].some((k) => key(k) === want)
        || (s.modelCode.trim() && code.startsWith(key(s.modelCode)) && sameSizeText(s.length || s.size, size))))
      .map((s) => s.barcode.trim().replace(/^'/, "")),
  );
  return found.size === 1 ? { ...line, barcode: [...found][0] } : line;
}

/**
 * The order's lines, joined to the spec sheet or description list that came with them.
 *
 * Burton's amended W27 lines say "CUSTOM NEW GRAPHIC", "PROCES NEW GRAHIC", "58W" — no material
 * number, no SKU, no EAN. The shop calls the first one "Custom 2027" in 158W, and the description
 * list calls it "Men's Custom Camber Snowboard" under model 10688. Matching the order's wording
 * straight to the shop found nothing, so all twelve were built as new products, and building them
 * looked the description up by a code the order never had: no descriptions at all, with a sheet
 * of them loaded.
 *
 * So the join runs first, the same one the importer uses (see reference-match): each line takes
 * the catalogue's name as the shop titles it, the board length in full, and the reference row it
 * belongs to — which is how the carry-overs then match the shop by name, and how the new products
 * get their description, Type and options from the sheet.
 */
export function joinToReference(
  lines: InvoiceLine[],
  options: DeliveryOptions,
): { lines: InvoiceLine[]; items: Map<InvoiceLine, CanonicalLineItem>; warnings: string[]; unjoined: number[] } {
  const specs = (options.specs ?? []).filter((s) => s.title.trim());
  if (specs.length === 0 || lines.length === 0) return { lines, items: new Map(), warnings: [], unjoined: [] };
  const vendor = (options.vendor ?? "").trim();
  const season = (options.season ?? "").trim();
  const rules = options.rules ?? DEFAULT_CATEGORY_RULES;
  const base = lines.map((line) => canonical(line, vendor, season));
  const resolution = resolveAgainstReference(base, specs, rules, options.decided ?? new Map(), options.sourceOf);
  const items = new Map<InvoiceLine, CanonicalLineItem>();
  const unjoined: number[] = [];
  const out = lines.map((line, i) => {
    const how = resolution.joined[i];
    const item = resolution.items[i];
    if (!how || !("to" in how)) {
      unjoined.push(i);
      // Still what the lines around it agreed it is — a 2027 snowboard — for when it is built.
      const next = { ...line };
      items.set(next, item);
      return next;
    }
    const size = (item.length || item.size || line.size || "").trim();
    const next: InvoiceLine = { ...line, title: item.title, named: true, ...(size ? { size } : {}), ...(item.colour ? { colour: line.colour || item.colour } : {}) };
    items.set(next, item);
    return next;
  });
  const placed = lines.length - unjoined.length;
  const missing = [...new Set(unjoined.map((i) => lines[i].title || lines[i].sku))];
  const warnings = [`Joined to the spec sheet: ${placed} of ${lines.length} line${lines.length === 1 ? "" : "s"}${missing.length ? `. Not on it: ${missing.slice(0, 6).join(", ")}${missing.length > 6 ? ` and ${missing.length - 6} more` : ""}` : ""}.`];
  return { lines: out, items, warnings, unjoined };
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
  // The order's shorthand, read as an import batch reads it: "M HIGHSHOT SO" is a men's "Highshot
  // Step On", with the audience in the gender and not the name. See expandShorthand.
  const gender = (line.gender ?? "").trim() || audienceOfPrefix(line.title);
  // A fit that is not the default is part of the name — "Photon BOA Wide" — not an option. See withFit.
  return withFit({
    title: expandShorthand(withoutAudiencePrefix(line.title.trim(), gender)),
    brand: (line.brand ?? "").trim() || vendor,
    modelCode: line.sku.trim(),
    sku: "",
    barcode: line.barcode.trim(),
    costPrice: line.costPrice,
    quantity: line.quantity,
    rrp: line.rrp,
    grams: null,
    length: isLength ? size : "",
    size: isLength ? "" : size,
    width: (line.fit ?? "").trim(),
    colour: (line.colour ?? "").trim(),
    gender,
    season,
    category: (line.kind ?? "").trim(),
    productType: (line.kind ?? "").trim(),
    description: "",
    flex: "", abilityLevel: "", dinRange: "", terrain: (line.terrain ?? "").trim(),
    imageUrls: [],
    collections: "",
    tags: "",
  });
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
    // Already the house body when the spec sheet wrote it; wrapping it again gave "<p><p>…".
    bodyHtml: !g.description.trim() ? "" : /^\s*</.test(g.description) ? g.description : houseBody(g.description, []),
    vendor: brand,
    productType: csvType(g.productType, g.collections),
    productCategory: productCategoryFor(csvType(g.productType, g.collections), title),
    tags: g.tags,
    published: false,
    status: "draft",
    seoTitle: seoTitle(brand, title),
    seoDescription: "",
    option1Name: g.option1Name,
    option2Name: g.option2Name,
    option3Name: g.option3Name,
    metafields: metafieldColumns(g.metafields),
    images: g.imageUrls.map((url, i) => ({ url, position: i + 1, altText: title })),
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
