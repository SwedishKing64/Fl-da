/**
 * Changing products that are already in the shop.
 *
 * The importer builds new listings. This is the other half of the season: the price changes and
 * clearance moves that happen to products already live, which until now meant someone editing a
 * Shopify export by hand. A Shopify export goes in, an instruction says what to change, and the
 * same file comes back out with only those cells different — ready to re-import, because Shopify
 * matches on Handle and updates rather than creates.
 *
 * Two things about the file shape matter and are easy to get wrong:
 *
 *  - A product's own columns (Tags, Status, Vendor, Type) appear only on the FIRST row of a handle;
 *    the rows after it carry the variant columns and little else. So a rule about a vendor has to
 *    be decided from that first row and applied to every row of the handle.
 *  - Price and Compare At are per variant row, and a product can have thirty of them.
 *
 * Everything else is copied through untouched — every column, every row, in the original order — so
 * the difference between the file in and the file out is exactly what was asked for.
 */

import { parseCsv } from "./csv";
import { withoutGenerated } from "./generated-tags";
import { isSystemBinding } from "./mount";

export interface Scope {
  /** Vendor names, matched case-insensitively. Any one of them matches. */
  vendors?: string[];
  /** Shopify Type values. Any one matches. */
  types?: string[];
  /**
   * Tags the product must carry, ALL of them. "Snow jackets AND mens."
   */
  tags?: string[];
  /**
   * Tags where carrying ANY ONE is enough. "The 2024 or 2025 or 2999 stock."
   *
   * This was missing, and its absence was a real fault rather than a gap. An instruction naming
   * five year tags has no way to be expressed as an AND — no product carries five years — so it
   * came back either matching nothing or, worse, with an empty scope that took in the whole file.
   * A rule about the 2024-and-older stock went and edited the 2027 skis.
   */
  anyTags?: string[];
  /** Tags that rule a product OUT however well it matches everything else. "But not the 2027s." */
  excludeTags?: string[];
  /** Vendors ruled out the same way. */
  excludeVendors?: string[];
  /** Exact handles. */
  handles?: string[];
  /** A substring of the product title, case-insensitive. */
  titleContains?: string;
  /**
   * A ski or board sold on its own, or sold with a binding on it.
   *
   * The shop's sale sheet puts these in a column of their own and prices them differently — 2027
   * snow skis flat 15% off, 2027 snow skis package 20% — so without it both rows land on both and
   * whichever ran second decides the price of everything. There is no column in a Shopify export
   * that says which; what says it is the TITLE. See isPackage.
   */
  fitting?: "flat" | "package";
}

/**
 * Whether a title is a ski or board with a binding on it.
 *
 * Read off their own catalogue rather than assumed. Of the 496 ski and board products across their
 * exports, 327 carry a marker in the title and 169 carry none:
 *
 *   inc / incl.        325    "Blaze 94 2027 inc Marker Griffon Binding Package"
 *   the word package   321    "Annum Boot and NNNBC Binding Package"
 *   either one         327
 *
 * Neither marker alone is enough and together they miss nothing. Six titles say "inc" without ever
 * saying package — "Bent 110 inc Marker Griffon EX DEMO" — and two say package without "inc":
 * "Worldcup Rebels i GS RD Team Skis with Freeflex Pro 11 Binding Package" and the Madshus
 * "Annum Boot and NNNBC Binding Package". A flat ski is simply one with neither: "M7 Mantra 2025".
 *
 * "with" and "mounted" are deliberately not markers of their own. Both titles that use them also
 * say package, so they add nothing — and "with" would catch a ski described by what it is made of.
 */
export function isPackage(title: string): boolean {
  return /\binc\b|\bincl\.?\b|\bpackages?\b/i.test(title);
}

export type Operation =
  /**
   * Put a product on sale, or deepen a sale it is already on.
   *
   * The recommended retail lives in Compare At — that is the shop's rule and their catalogue keeps
   * it: of the 2,256 variant rows carrying both, the price is `round(compareAt × (1 − pct), 2)` on
   * 86%, at whole percentages clustering on 10, 15, 20 and 50. So the discount comes off the
   * recommended retail, not off whatever the price happens to be today, and a product discounted
   * twice does not compound. `from: "current"` is there for when someone means the other thing.
   */
  | { kind: "discount"; percent: number; from?: "rrp" | "current" }
  /** Take a product off sale: the price goes back to the recommended retail and Compare At clears. */
  | { kind: "endSale" }
  | { kind: "setPrice"; value: number }
  | { kind: "addTags"; tags: string[] }
  | { kind: "removeTags"; tags: string[] }
  | { kind: "setStatus"; status: "active" | "draft" | "archived" }
  | { kind: "setType"; value: string }
  | { kind: "setVendor"; value: string }
  /**
   * Stock on hand, per variant row.
   *
   * Only a row that already carries a quantity gets one, the same way setPrice only touches a row
   * that already has a price. That is not caution for its own sake: a Shopify export puts a
   * product's extra images on rows of their own, which carry a handle and nothing else. Across
   * their ten exports, 994 of 5,653 rows are those, not one of them carries a quantity, and all
   * 4,659 real variant rows do — so "has a quantity" separates the two exactly.
   */
  | { kind: "setQuantity"; value: number }
  /**
   * Put a season into the product title — the one title edit this shop actually makes in bulk.
   *
   * See titleWithYear for where it goes and why.
   */
  | { kind: "setTitleYear"; year: string; seo?: boolean }
  /** Swap one piece of wording in the title for another, wherever it appears. */
  | { kind: "renameTitle"; find: string; replace: string; seo?: boolean }
  /**
   * The fitting charge on a ski package: what "Please Mount My Bindings" costs over "Please Do
   * Not Mount My Bindings" for the same length and binding. Set on the recommended retail, with
   * the sale kept: Compare At moves by the amount and the price by the same share of it, so a
   * package at 25% off stays at 25% off. `bindings` limits it to the drill-mount packages or the
   * ones whose binding comes with the ski — see mount.ts — and left out means every package. The
   * difference is set to the amount, up or down; `raiseOnly` leaves a package already charging
   * more as it is, for an instruction that says "at least" or "only increase".
   */
  | { kind: "setMountPrice"; amount: number; bindings?: "drill" | "system"; raiseOnly?: boolean };

export interface Plan {
  scope: Scope;
  operations: Operation[];
}

export interface Change {
  handle: string;
  title: string;
  column: string;
  before: string;
  after: string;
}

export interface AdjustResult {
  csv: string;
  /** Every cell that changed, in file order. */
  changes: Change[];
  /** Products the scope matched, and how many the file holds. */
  matched: number;
  products: number;
  variantRows: number;
  /** Anything the caller should see before re-importing. */
  warnings: string[];
  /**
   * True when the self-check found a cell moving that nobody asked about, so the original file was
   * handed back instead. Not a warning to skim past: it means this tool has a fault.
   */
  refused?: boolean;
  /**
   * Rows removed from above the header. The file has to be rewritten for this even when no cell
   * changed, because leaving them in is the whole reason Shopify would not take it.
   */
  preambleRemoved?: number;
}


/**
 * Quote a field for output without touching what is in it.
 *
 * Deliberately NOT the generator's escapeCsvField, which straightens curly quotes and normalises
 * spaces — right when composing new copy, wrong here. This tool edits a live catalogue, and that
 * function rewrote the apostrophe in every description it passed through: a bulk price change
 * would have quietly reworded 140 products. A cell nobody asked about comes back byte for byte.
 */
export function quote(value: string): string {
  if (value === "") return "";
  return /[",\r\n]/.test(value) || /^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Which columns a title edit touches.
 *
 * The SEO title is a separate column and the shop keeps it in step by hand: across their exports
 * 1,327 of the 1,433 products that have one carry the product's title inside it verbatim, usually
 * as "Swany " plus the title. So the same edit belongs on both — but only when it was asked for,
 * because the standing rule on this page is that nothing moves that was not named.
 */
const titleColumns = (seo?: boolean): string[] => (seo ? ["Title", "SEO Title"] : ["Title"]);

/** Round half-up to cents, without the floating-point surprise at .005. */
export function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Where the season goes in a title.
 *
 * Their titles are not "Brand Model" — a ski sold with a binding is "Mindbender 88 2027 inc Marker
 * Griffon Demo Binding Package EX DEMO", and the year sits after the model and before everything
 * that describes the deal. Appending it would have written "…Binding Package EX DEMO 2027" on the
 * 252 products whose year is mid-title today.
 *
 * So: a title that already names a year has that year REPLACED (the 2026s becoming the 2027s is
 * the change they actually make). Otherwise the year goes in front of the first thing that reads
 * as part of the tail — a length, "inc", "EX DEMO", "Superseded" — and only a title with no tail
 * at all gets it on the end.
 *
 * Measured against their own catalogue: strip the year out of each of the 547 titles that carry
 * one and put it back with this rule, and 539 come back character for character. The eight that do
 * not are all one house style — "Redster J2 70-90 2024 inc …", a length range written before the
 * year rather than after it — and they come back readable, with the year one word early.
 */
const TITLE_TAIL = [/\b\d{2,3}\s*-\s*\d{2,3}\s*cm\b/i, /\b\d{2,3}\s*cm\b/i, /\binc\b/i, /\bex\s+demo\b/i, /\bsuperseded\b/i];

export function titleWithYear(title: string, year: string): string {
  const text = title.trim();
  const season = year.trim();
  if (!text || !/^\d{4}$/.test(season)) return title;
  if (/\b20\d\d\b/.test(text)) return text.replace(/\b20\d\d\b/, season);
  let at = text.length;
  for (const re of TITLE_TAIL) {
    const m = text.match(re);
    if (m && m.index !== undefined && m.index < at) at = m.index;
  }
  if (at >= text.length) return `${text} ${season}`;
  return `${text.slice(0, at).trimEnd()} ${season} ${text.slice(at).trimStart()}`;
}

/**
 * Replace every occurrence of a phrase, matched without regard to case, spelled as given.
 *
 * The replacement is wording, not a pattern — a `$&` in it stays a `$&`. Whatever is left is
 * tidied: taking "EX DEMO" out of "Rustler 10 EX DEMO" must not leave the title ending in a space,
 * and the gap a removal leaves in the middle must not stay a double space. That tidying is safe to
 * do unconditionally — across their ten exports exactly one of 1,217 titles has a double space in
 * it, and none has an untrimmed end.
 */
export function renamedTitle(title: string, find: string, replace: string): string {
  if (find === "") return title;
  const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const next = title.replace(new RegExp(escaped, "gi"), () => replace);
  return next === title ? title : next.replace(/[^\S\r\n]{2,}/g, " ").trim();
}

const price = (raw: string): number | null => {
  const value = Number(raw.trim());
  return raw.trim() !== "" && Number.isFinite(value) && value >= 0 ? value : null;
};

const fmt = (value: number): string => value.toFixed(2);

const splitTags = (raw: string): string[] => raw.split(",").map((t) => t.trim()).filter(Boolean);

/**
 * Shelves that sit INSIDE a broader word, and so must not be taken in by it.
 *
 * Their ski poles carry the tag "ski" — 88 of 91 in the poles export do — so a sheet row about
 * snow skis, grounded on that tag, repriced every pole. The shop's own tags already say which shelf
 * a product is really on: a pole also carries "ski poles", and a ski never does. Measured across
 * all their exports, each tag below sits on products that are not skis (or not boards) and on NO
 * ski (or board) at all — "ski poles" on 88 non-skis and 0 skis, "ski accessories" on 290 and 0.
 *
 * The one "ski …" tag real skis DO carry is "ski packages", on 292 of them, and "snowboard packages"
 * is on 7 boards and 5 other things — so neither is here. A product carrying a tag on this list is
 * on that shelf, whatever else it is tagged, unless the instruction asked for that shelf itself.
 */
const NARROWER_SHELVES: Record<"ski" | "snowboard", string[]> = {
  ski: [
    "ski accessories", "ski accessores", "ski tuning", "ski poles", "ski gloves", "ski helmets",
    "ski and boot bags", "ski and snowboard bags", "ski boots", "ski bindings", "ski bags",
  ],
  snowboard: ["snowboard accessories", "snowboard bindings", "snowboard boots", "snowboard bags"],
};

const shelfWord = (value: string): string => value.trim().toLowerCase().replace(/[-_\s]+/g, " ");

/** Which broad shelf a scope asks for by its bare name — "skis", "snow skis", "ski" — if any. */
function broadShelfOf(scope: Scope): "ski" | "snowboard" | null {
  const asked = [...(scope.types ?? []), ...(scope.tags ?? []), ...(scope.anyTags ?? [])].map(shelfWord);
  if (asked.some((a) => /^(snow )?skis?$/.test(a))) return "ski";
  if (asked.some((a) => /^snowboards?$/.test(a))) return "snowboard";
  return null;
}

function matches(scope: Scope, row: Record<string, string>): boolean {
  const eq = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  if (scope.vendors?.length && !scope.vendors.some((v) => eq(v, row["Vendor"] ?? ""))) return false;
  if (scope.types?.length && !scope.types.some((t) => eq(t, row["Type"] ?? ""))) return false;
  if (scope.handles?.length && !scope.handles.some((h) => eq(h, row["Handle"] ?? ""))) return false;
  if (scope.titleContains && !(row["Title"] ?? "").toLowerCase().includes(scope.titleContains.trim().toLowerCase())) return false;
  if (scope.fitting && isPackage(row["Title"] ?? "") !== (scope.fitting === "package")) return false;
  const have = new Set(splitTags(row["Tags"] ?? "").map((t) => t.toLowerCase()));
  if (scope.tags?.length && !scope.tags.every((t) => have.has(t.trim().toLowerCase()))) return false;
  if (scope.anyTags?.length && !scope.anyTags.some((t) => have.has(t.trim().toLowerCase()))) return false;
  // A product on a narrower shelf is not on the broad one. See NARROWER_SHELVES.
  const broad = broadShelfOf(scope);
  if (broad) {
    const asked = new Set([...(scope.types ?? []), ...(scope.tags ?? []), ...(scope.anyTags ?? [])].map(shelfWord));
    const carried = new Set([...have].map(shelfWord));
    if (NARROWER_SHELVES[broad].some((shelf) => carried.has(shelf) && !asked.has(shelf))) return false;
  }
  // Exclusions last, and they win: "not the 2027s" means not the 2027s, whatever else matched.
  if (scope.excludeTags?.some((t) => have.has(t.trim().toLowerCase()))) return false;
  if (scope.excludeVendors?.some((v) => eq(v, row["Vendor"] ?? ""))) return false;
  return true;
}

/** True when a scope names nothing at all, which would take in the whole file. */
export function isWholeFile(scope: Scope): boolean {
  return !scope.vendors?.length && !scope.types?.length && !scope.tags?.length && !scope.anyTags?.length
    && !scope.handles?.length && !scope.titleContains?.trim() && !scope.fitting
    && !scope.excludeTags?.length && !scope.excludeVendors?.length;
}

/**
 * Open a Shopify export, and drop anything sitting above the header row.
 *
 * A real one starts with its header. A file that has been through a spreadsheet program on the
 * way here often does not: opening an export in Numbers and exporting it back writes the table's
 * own name above the header as a one-cell row, so the file begins
 *
 *     products_export_1 (4)-updated
 *     Handle,Title,Body (HTML),…
 *
 * Shopify then reads that first line AS the header, finds no Handle column, and refuses the whole
 * import — for a file whose 500 rows are otherwise perfect. It is worth handling rather than
 * rejecting, because the person who hits it has no way to tell from the error what is wrong.
 *
 * Only the first few rows are searched. A preamble is a line or two; a Shopify export with its
 * header fifty rows down is not an export with a preamble, it is a different file.
 */
function openExport(text: string): { grid: string[][]; preamble: string[][] } {
  const all = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
  const at = all.slice(0, 10).findIndex((row) => row.includes("Handle") && row.includes("Title"));
  return at > 0 ? { grid: all.slice(at), preamble: all.slice(0, at) } : { grid: all, preamble: [] };
}

/**
 * Apply a plan to a Shopify product export.
 *
 * Returns the whole file back, changed only where the plan said, plus a list of every cell that
 * moved so a person can read the diff before importing it.
 */
export function applyPlan(text: string, plan: Plan): AdjustResult {
  const { grid, preamble } = openExport(text);
  const warnings: string[] = [];
  if (preamble.length > 0) {
    // Dropped rather than carried through: carrying it would hand back a file Shopify still will
    // not take. It is named so nobody has to wonder what went missing.
    warnings.push(`${preamble.length === 1 ? "A line" : `${preamble.length} lines`} above the column headings ${preamble.length === 1 ? "was" : "were"} removed — Shopify reads the first line of the file as the column names, and would have refused the import with ${preamble.length === 1 ? "it" : "them"} there. Removed: ${preamble.map((r) => JSON.stringify(r.join(",").slice(0, 60))).join(", ")}.`);
  }
  if (grid.length < 2) return { csv: text, changes: [], matched: 0, products: 0, variantRows: 0, warnings: ["That file has no rows in it."] };

  const header = grid[0];
  const index = new Map(header.map((h, i) => [h, i]));
  if (!index.has("Handle")) {
    return { csv: text, changes: [], matched: 0, products: 0, variantRows: 0, warnings: ["That does not look like a Shopify product export — it has no Handle column."] };
  }
  const at = (row: string[], column: string): string => {
    const i = index.get(column);
    return i === undefined ? "" : row[i] ?? "";
  };
  const set = (row: string[], column: string, value: string): boolean => {
    const i = index.get(column);
    if (i === undefined) return false;
    while (row.length <= i) row.push("");
    row[i] = value;
    return true;
  };

  const rows = grid.slice(1).map((r) => [...r]);
  const changes: Change[] = [];

  // A handle's product columns live on its first row; every later row belongs to the same product.
  const firstRowOf = new Map<string, string[]>();
  const rowsOf = new Map<string, string[][]>();
  for (const row of rows) {
    const handle = at(row, "Handle").trim();
    if (!handle) continue;
    if (!firstRowOf.has(handle)) firstRowOf.set(handle, row);
    rowsOf.set(handle, [...(rowsOf.get(handle) ?? []), row]);
  }

  const asObject = (row: string[]): Record<string, string> => Object.fromEntries(header.map((h, i) => [h, row[i] ?? ""]));
  const inScope = new Set<string>();
  for (const [handle, row] of firstRowOf) if (matches(plan.scope, asObject(row))) inScope.add(handle);

  const missing = [...new Set(plan.operations.flatMap((op) => {
    if (op.kind === "addTags" || op.kind === "removeTags") return index.has("Tags") ? [] : ["Tags"];
    if (op.kind === "setStatus") return index.has("Status") ? [] : ["Status"];
    if (op.kind === "setType") return index.has("Type") ? [] : ["Type"];
    if (op.kind === "setVendor") return index.has("Vendor") ? [] : ["Vendor"];
    if (op.kind === "setTitleYear" || op.kind === "renameTitle") return titleColumns(op.seo).filter((c) => !index.has(c));
    if (op.kind === "setQuantity") return index.has("Variant Inventory Qty") ? [] : ["Variant Inventory Qty"];
    return index.has("Variant Price") ? [] : ["Variant Price"];
  }))];
  for (const column of missing) warnings.push(`The file has no "${column}" column, so that part of the instruction could not be applied.`);

  for (const row of rows) {
    const handle = at(row, "Handle").trim();
    if (!handle || !inScope.has(handle)) continue;
    const isFirst = firstRowOf.get(handle) === row;
    const title = at(firstRowOf.get(handle) ?? row, "Title");
    const record = (column: string, before: string, after: string) => {
      if (before !== after) changes.push({ handle, title, column, before, after });
    };

    for (const op of plan.operations) {
      switch (op.kind) {
        case "discount": {
          const current = price(at(row, "Variant Price"));
          if (current === null) continue; // a row with no price is left alone, never given one
          const compareColumn = "Variant Compare At Price";
          const compare = price(at(row, compareColumn));
          // The recommended retail is what a discount comes off. When the product is not on sale
          // yet, today's price IS the recommended retail, and it moves into Compare At.
          const rrp = op.from === "current" ? current : compare ?? current;
          const next = money(rrp * (1 - op.percent / 100));
          if (index.has(compareColumn) && compare === null) {
            const before = at(row, compareColumn);
            set(row, compareColumn, fmt(current));
            record(compareColumn, before, fmt(current));
          }
          const before = at(row, "Variant Price");
          if (set(row, "Variant Price", fmt(next))) record("Variant Price", before, fmt(next));
          break;
        }
        case "endSale": {
          const compare = price(at(row, "Variant Compare At Price"));
          if (compare === null) continue;
          const before = at(row, "Variant Price");
          if (set(row, "Variant Price", fmt(compare))) record("Variant Price", before, fmt(compare));
          const cBefore = at(row, "Variant Compare At Price");
          set(row, "Variant Compare At Price", "");
          record("Variant Compare At Price", cBefore, "");
          break;
        }
        case "setPrice": {
          if (price(at(row, "Variant Price")) === null) continue;
          const before = at(row, "Variant Price");
          if (set(row, "Variant Price", fmt(money(op.value)))) record("Variant Price", before, fmt(money(op.value)));
          break;
        }
        case "setMountPrice": {
          // Once per product, across all its rows: each length-and-binding's mounted variant is
          // priced off its unmounted twin.
          if (!isFirst) break;
          const first = firstRowOf.get(handle) ?? row;
          const names = ["Option1 Name", "Option2 Name", "Option3 Name"].map((c) => at(first, c));
          const fit = names.findIndex((n) => /fitting|mount/i.test(n));
          if (fit < 0) break;
          const fitColumn = `Option${fit + 1} Value`;
          const bindingAt = names.findIndex((n, i) => i !== fit && /bind/i.test(n)); // "Bindin Option" is in the file
          const others = ["Option1 Value", "Option2 Value", "Option3 Value"].filter((_, i) => i !== fit);
          const pairs = new Map<string, { unmounted?: string[]; mounted?: string[] }>();
          for (const r of rowsOf.get(handle) ?? []) {
            const v = at(r, fitColumn);
            const which = /do\s*not\s*mount|don'?t\s*mount|unmounted|not\s*mounted|without/i.test(v) ? "unmounted" : /mount/i.test(v) ? "mounted" : null;
            if (!which) continue;
            const key = others.map((c) => at(r, c).trim()).join("\u0000");
            const pair = pairs.get(key) ?? {};
            pair[which] = r;
            pairs.set(key, pair);
          }
          for (const pair of pairs.values()) {
            if (!pair.unmounted || !pair.mounted) continue;
            if (op.bindings) {
              const binding = bindingAt >= 0 ? at(pair.unmounted, `Option${bindingAt + 1} Value`) : "";
              const system = isSystemBinding(`${binding} ${title}`);
              if ((op.bindings === "system") !== system) continue;
            }
            const unmountedPrice = price(at(pair.unmounted, "Variant Price"));
            if (unmountedPrice === null) continue;
            const unmountedCompare = price(at(pair.unmounted, "Variant Compare At Price"));
            // What the package charges today, on the recommended retail where it has one.
            const mountedCompare = price(at(pair.mounted, "Variant Compare At Price"));
            const mountedPrice = price(at(pair.mounted, "Variant Price"));
            const charging = unmountedCompare !== null && mountedCompare !== null ? mountedCompare - unmountedCompare : mountedPrice !== null ? mountedPrice - unmountedPrice : null;
            if (op.raiseOnly && charging !== null && charging >= op.amount - 0.005) continue;
            // The sale stays what it was: the amount lands on the recommended retail in full, and
            // on the price by the same share the price is of the recommended retail.
            const share = unmountedCompare && unmountedCompare > 0 ? unmountedPrice / unmountedCompare : 1;
            const nextPrice = fmt(money(unmountedPrice + op.amount * share));
            const beforePrice = at(pair.mounted, "Variant Price");
            if (set(pair.mounted, "Variant Price", nextPrice)) record("Variant Price", beforePrice, nextPrice);
            if (unmountedCompare !== null && index.has("Variant Compare At Price")) {
              const nextCompare = fmt(money(unmountedCompare + op.amount));
              const beforeCompare = at(pair.mounted, "Variant Compare At Price");
              if (set(pair.mounted, "Variant Compare At Price", nextCompare)) record("Variant Compare At Price", beforeCompare, nextCompare);
            }
          }
          break;
        }
        // The rest are the product's own, and belong only on the row that carries them.
        case "addTags": {
          if (!isFirst) break;
          const before = at(row, "Tags");
          // A product is one season: a year tag added takes the place of the year tag it has.
          // "Add the 2027 tag" means 2027, not 2026 and 2027.
          const years = op.tags.map((t) => t.trim()).filter((t) => /^20\d\d$/.test(t));
          const have = splitTags(before).filter((t) => years.length === 0 || !/^20\d\d$/.test(t.trim()) || years.includes(t.trim()));
          const known = new Set(have.map((t) => t.toLowerCase()));
          const next = [...have];
          for (const tag of op.tags.map((t) => t.trim()).filter(Boolean)) {
            if (known.has(tag.toLowerCase())) continue;
            next.push(tag);
            known.add(tag.toLowerCase());
          }
          const after = next.join(", ");
          if (set(row, "Tags", after)) record("Tags", before, after);
          break;
        }
        case "removeTags": {
          if (!isFirst) break;
          const before = at(row, "Tags");
          const drop = new Set(op.tags.map((t) => t.trim().toLowerCase()).filter(Boolean));
          const after = splitTags(before).filter((t) => !drop.has(t.toLowerCase())).join(", ");
          if (set(row, "Tags", after)) record("Tags", before, after);
          break;
        }
        case "setStatus": {
          if (!isFirst) break;
          const before = at(row, "Status");
          if (set(row, "Status", op.status)) record("Status", before, op.status);
          // Shopify's own export carries Published alongside Status, and an archived or draft
          // product that stays published contradicts itself on import.
          if (index.has("Published")) {
            const pBefore = at(row, "Published");
            const published = op.status === "active" ? "true" : "false";
            set(row, "Published", published);
            record("Published", pBefore, published);
          }
          break;
        }
        case "setType": {
          if (!isFirst) break;
          const before = at(row, "Type");
          if (set(row, "Type", op.value)) record("Type", before, op.value);
          break;
        }
        case "setVendor": {
          if (!isFirst) break;
          const before = at(row, "Vendor");
          if (set(row, "Vendor", op.value)) record("Vendor", before, op.value);
          break;
        }
        case "setQuantity": {
          // A row with no quantity is an image row, not a variant. See the operation.
          if (at(row, "Variant Inventory Qty").trim() === "") break;
          const after = String(Math.round(op.value));
          const before = at(row, "Variant Inventory Qty");
          if (set(row, "Variant Inventory Qty", after)) record("Variant Inventory Qty", before, after);
          break;
        }
        case "setTitleYear": {
          if (!isFirst) break;
          // The SEO title is the title with the brand in front, year and all, on every listing the
          // shop has written one for; a year put on the title goes on it too.
          for (const column of titleColumns(true)) {
            const before = at(row, column);
            if (!before.trim()) continue;
            const after = titleWithYear(before, op.year);
            if (set(row, column, after)) record(column, before, after);
          }
          break;
        }
        case "renameTitle": {
          if (!isFirst) break;
          for (const column of titleColumns(op.seo)) {
            const before = at(row, column);
            if (!before.trim()) continue;
            const after = renamedTitle(before, op.find, op.replace);
            if (set(row, column, after)) record(column, before, after);
          }
          break;
        }
      }
    }
  }

  // Worth saying every time, because it is the one thing about a title change that surprises
  // people: Shopify matches an import on Handle. The URL keeps the old wording, and editing the
  // Handle to match would not rename the product — it would import a second copy of it.
  if (changes.some((c) => c.column === "Title")) {
    warnings.push("The product URLs are unchanged. Shopify matches an import on Handle, so a title can be edited here but the handle cannot — changing it would create a second copy of the product rather than renaming the one you have. A URL has to be changed in Shopify itself, which leaves a redirect behind.");
  }

  const csv = [header, ...rows].map((row) => header.map((_, i) => quote(row[i] ?? "")).join(",")).join("\r\n") + "\r\n";

  // Prove it before handing it over. See verifyOnlyIntended.
  const unintended = verifyOnlyIntended(grid, csv, changes);
  if (unintended.length > 0) {
    return {
      csv: text,
      changes: [],
      matched: 0,
      products: firstRowOf.size,
      variantRows: rows.length,
      refused: true,
      warnings: [
        `The file was NOT changed. A check found ${unintended.length} cell${unintended.length === 1 ? "" : "s"} that would have moved without being asked to, which is a fault in this tool rather than anything you did. Please report it.`,
        ...unintended.slice(0, 5),
      ],
    };
  }
  return { csv, changes, matched: inScope.size, products: firstRowOf.size, variantRows: rows.length, warnings, ...(preamble.length ? { preambleRemoved: preamble.length } : {}) };
}

/**
 * Read the file back and prove that nothing moved except what was asked for.
 *
 * This is the whole promise of the page. It edits a live catalogue, and the way that goes wrong is
 * not a visible error — it is a column nobody was looking at quietly coming back different across
 * thousands of rows, discovered weeks later. It has already happened once here: an early version
 * serialised through the CSV generator's escaping, which straightens curly quotes, so adding one
 * tag to fifty products reworded the apostrophe in fifty product descriptions.
 *
 * A test catches that on the day it is written. This catches it on every file, for every change
 * anyone makes to this module afterwards — and when it catches something it hands back the
 * ORIGINAL file, because a file with edits nobody asked for is worse than no file at all.
 *
 * Values are compared as parsed, not as bytes: re-quoting a field that did not need quoting
 * changes the bytes and changes nothing about the data, and that is not what this is looking for.
 */
export function verifyOnlyIntended(
  before: string[][],
  after: string,
  changes: Change[],
  options: { appended?: number } = {},
): string[] {
  const parsed = parseCsv(after).filter((r) => r.some((c) => c.trim() !== ""));
  const header = before[0];
  const problems: string[] = [];

  // A delivery can legitimately make the file LONGER: the products that are not in the shop yet
  // are written on the end of it, so the same file carries the reorder and the new listings. Rows
  // added past the ones that were there are not what this is checking — the promise is about the
  // rows somebody already has, and every one of those is still compared cell by cell below.
  const appended = Math.max(0, Math.round(options.appended ?? 0));
  if (parsed.length !== before.length + appended) {
    problems.push(
      appended > 0
        ? `The file came back with ${parsed.length} rows instead of ${before.length + appended} — the ${before.length - 1} it had, plus ${appended} added.`
        : `The file came back with ${parsed.length} rows instead of ${before.length}.`,
    );
    return problems;
  }
  if (parsed[0].join("\u0000") !== header.join("\u0000")) {
    problems.push("The header row came back different.");
    return problems;
  }

  const handleColumn = header.indexOf("Handle");
  // Which cells were meant to move, as handle + column. A product column is written on one row and
  // a variant column on many, so the pair is the finest grain a change list can name.
  const intended = new Set(changes.map((c) => `${c.handle}\u0000${c.column}`));

  for (let r = 1; r < before.length; r++) {
    const handle = handleColumn === -1 ? "" : (before[r][handleColumn] ?? "").trim();
    for (let c = 0; c < header.length; c++) {
      const was = before[r][c] ?? "";
      const now = parsed[r][c] ?? "";
      if (was === now) continue;
      if (intended.has(`${handle}\u0000${header[c]}`)) continue;
      problems.push(`Row ${r} "${header[c]}" changed without being asked to: ${JSON.stringify(was).slice(0, 60)} became ${JSON.stringify(now).slice(0, 60)}`);
      if (problems.length >= 20) return problems;
    }
  }
  return problems;
}

/**
 * Why a scope matched nothing, said in terms of the scope itself.
 *
 * "0 products match" is true and useless. Every field is dropped in turn and the file re-counted,
 * so the answer is the field that was doing the excluding — nearly always one of two things: a
 * pair of tags put in `tags`, which means BOTH at once and no product carries both, or a scope
 * that is right about the shop but about an export that is not loaded.
 */
export function whyNoMatch(text: string, scope: Scope): string[] {
  const { grid } = openExport(text);
  if (grid.length < 2) return [];
  const header = grid[0];
  const firstRows: Array<Record<string, string>> = [];
  const seen = new Set<string>();
  for (const row of grid.slice(1)) {
    const record = Object.fromEntries(header.map((h, i) => [h, row[i] ?? ""]));
    const handle = (record["Handle"] ?? "").trim();
    if (!handle || seen.has(handle)) continue;
    seen.add(handle);
    firstRows.push(record);
  }
  const count = (s: Scope) => firstRows.filter((r) => matches(s, r)).length;
  if (count(scope) > 0) return [];

  const fields: Array<[keyof Scope, string]> = [
    ["vendors", "the brand"], ["types", "the type"], ["tags", "the tags it wanted ALL of"],
    ["anyTags", "the tags"], ["handles", "the named products"], ["titleContains", "the words in the title"],
    ["fitting", "flat or package"],
    ["excludeTags", "what it was told to leave out"], ["excludeVendors", "the brands it was told to leave out"],
  ];
  const reasons: string[] = [];
  for (const [field, what] of fields) {
    const value = scope[field];
    if (value === undefined || (Array.isArray(value) ? value.length === 0 : !String(value).trim())) continue;
    const without: Scope = { ...scope };
    delete without[field];
    const n = count(without);
    if (n > 0) {
      const shown = Array.isArray(value) ? value.join(", ") : String(value);
      reasons.push(`${n} product${n === 1 ? "" : "s"} fit everything except ${what} (${shown}).`);
    }
  }
  if (reasons.length === 0) return ["No single part of it is to blame — several together rule out every product in the file."];
  if (scope.tags && scope.tags.length > 1 && reasons.some((r) => r.includes("ALL of"))) {
    reasons.push(`"${scope.tags.join('" and "')}" was read as needing all of them on the one product. If any one of them was meant, say "tagged X or Y".`);
  }
  return reasons;
}

/** What the file holds, so a scope can be built from real values rather than guessed at. */
export function describeFile(text: string): { products: number; variantRows: number; vendors: string[]; types: string[]; tags: string[] } {
  const { grid } = openExport(text);
  if (grid.length < 2) return { products: 0, variantRows: 0, vendors: [], types: [], tags: [] };
  const header = grid[0];
  const index = new Map(header.map((h, i) => [h, i]));
  const at = (row: string[], column: string) => {
    const i = index.get(column);
    return i === undefined ? "" : (row[i] ?? "").trim();
  };
  const seen = new Set<string>();
  const vendors = new Set<string>(), types = new Set<string>(), tags = new Set<string>();
  let variantRows = 0;
  for (const row of grid.slice(1)) {
    variantRows++;
    const handle = at(row, "Handle");
    if (!handle || seen.has(handle)) continue;
    seen.add(handle);
    if (at(row, "Vendor")) vendors.add(at(row, "Vendor"));
    if (at(row, "Type")) types.add(at(row, "Type"));
    for (const tag of splitTags(at(row, "Tags"))) tags.add(tag);
  }
  const sorted = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b));
  // Shopify's own colour, size, length and price-band tags are dropped. Nobody scopes a change by
  // them, and left in they are nearly half of this shop's vocabulary — enough, in alphabetical
  // order, to push every shelf tag out of what an instruction is read against.
  return { products: seen.size, variantRows, vendors: sorted(vendors), types: sorted(types), tags: withoutGenerated(sorted(tags)) };
}

export interface FoldStep { id: number; plan: Plan; label: string }

export interface FoldOutcome {
  /** Every file, changed where the steps said. A file nothing touched comes back as it went in. */
  files: Array<{ name: string; csv: string; changes: number }>;
  /** The ids that ran, the ids the guard threw out, and what the ones that ran did. */
  applied: number[];
  refused: number[];
  changes: number;
  matched: number;
  lines: string[];
}

/**
 * Run several plans over several files, in order, as one step.
 *
 * Each plan still runs on its own and is still checked on its own — a plan that fails the guard is
 * dropped and named, and the ones on either side of it are unaffected, because a group of changes
 * the person approved together is not a reason to weaken the one thing this tool promises.
 *
 * Order matters and is the caller's: a later plan sees what an earlier one did, so "everything 2025
 * into clearance" followed by "except the Oakleys back out" ends where a person would expect.
 *
 * This lives here rather than in the page because it is the part that must be right. The page can
 * be wrong about a label; this being wrong means someone downloads a file they think carries their
 * afternoon's work and it carries none of it.
 */
export function foldPlans(files: Array<{ name: string; csv: string }>, steps: FoldStep[]): FoldOutcome {
  const working = files.map((f) => ({ name: f.name, csv: f.csv, changes: 0 }));
  const applied: number[] = [];
  const refused: number[] = [];
  const lines: string[] = [];
  let changes = 0;
  let matched = 0;

  for (const step of steps) {
    const results = working.map((f) => applyPlan(f.csv, step.plan));
    if (results.some((r) => r.refused)) { refused.push(step.id); continue; }
    results.forEach((r, i) => {
      // A file this step did not touch keeps the bytes it arrived with. Taking the rewritten copy
      // would re-quote fields that never needed it and hand back a file that looks edited and is
      // not — and re-importing a file nobody changed should be a true no-op.
      if (r.changes.length > 0 || (r.preambleRemoved ?? 0) > 0) working[i].csv = r.csv;
      working[i].changes += r.changes.length;
    });
    changes += results.reduce((n, r) => n + r.changes.length, 0);
    matched = Math.max(matched, results.reduce((n, r) => n + r.matched, 0));
    lines.push(step.label);
    applied.push(step.id);
  }

  return { files: working, applied, refused, changes, matched, lines };
}
