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

export interface Scope {
  /** Vendor names, matched case-insensitively. Any one of them matches. */
  vendors?: string[];
  /** Shopify Type values. Any one matches. */
  types?: string[];
  /** Tags the product must carry. ALL of them must be present — that is what makes a scope narrow. */
  tags?: string[];
  /** Exact handles. */
  handles?: string[];
  /** A substring of the product title, case-insensitive. */
  titleContains?: string;
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
  | { kind: "setVendor"; value: string };

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
}


/**
 * Quote a field for output without touching what is in it.
 *
 * Deliberately NOT the generator's escapeCsvField, which straightens curly quotes and normalises
 * spaces — right when composing new copy, wrong here. This tool edits a live catalogue, and that
 * function rewrote the apostrophe in every description it passed through: a bulk price change
 * would have quietly reworded 140 products. A cell nobody asked about comes back byte for byte.
 */
function quote(value: string): string {
  if (value === "") return "";
  return /[",\r\n]/.test(value) || /^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Round half-up to cents, without the floating-point surprise at .005. */
export function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

const price = (raw: string): number | null => {
  const value = Number(raw.trim());
  return raw.trim() !== "" && Number.isFinite(value) && value >= 0 ? value : null;
};

const fmt = (value: number): string => value.toFixed(2);

const splitTags = (raw: string): string[] => raw.split(",").map((t) => t.trim()).filter(Boolean);

function matches(scope: Scope, row: Record<string, string>): boolean {
  const eq = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  if (scope.vendors?.length && !scope.vendors.some((v) => eq(v, row["Vendor"] ?? ""))) return false;
  if (scope.types?.length && !scope.types.some((t) => eq(t, row["Type"] ?? ""))) return false;
  if (scope.handles?.length && !scope.handles.some((h) => eq(h, row["Handle"] ?? ""))) return false;
  if (scope.titleContains && !(row["Title"] ?? "").toLowerCase().includes(scope.titleContains.trim().toLowerCase())) return false;
  if (scope.tags?.length) {
    const have = new Set(splitTags(row["Tags"] ?? "").map((t) => t.toLowerCase()));
    if (!scope.tags.every((t) => have.has(t.trim().toLowerCase()))) return false;
  }
  return true;
}

/** True when a scope names nothing at all, which would take in the whole file. */
export function isWholeFile(scope: Scope): boolean {
  return !scope.vendors?.length && !scope.types?.length && !scope.tags?.length && !scope.handles?.length && !scope.titleContains?.trim();
}

/**
 * Apply a plan to a Shopify product export.
 *
 * Returns the whole file back, changed only where the plan said, plus a list of every cell that
 * moved so a person can read the diff before importing it.
 */
export function applyPlan(text: string, plan: Plan): AdjustResult {
  const grid = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
  const warnings: string[] = [];
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
  for (const row of rows) {
    const handle = at(row, "Handle").trim();
    if (handle && !firstRowOf.has(handle)) firstRowOf.set(handle, row);
  }

  const asObject = (row: string[]): Record<string, string> => Object.fromEntries(header.map((h, i) => [h, row[i] ?? ""]));
  const inScope = new Set<string>();
  for (const [handle, row] of firstRowOf) if (matches(plan.scope, asObject(row))) inScope.add(handle);

  const missing = [...new Set(plan.operations.flatMap((op) => {
    if (op.kind === "addTags" || op.kind === "removeTags") return index.has("Tags") ? [] : ["Tags"];
    if (op.kind === "setStatus") return index.has("Status") ? [] : ["Status"];
    if (op.kind === "setType") return index.has("Type") ? [] : ["Type"];
    if (op.kind === "setVendor") return index.has("Vendor") ? [] : ["Vendor"];
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
        // The rest are the product's own, and belong only on the row that carries them.
        case "addTags": {
          if (!isFirst) break;
          const before = at(row, "Tags");
          const have = splitTags(before);
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
      }
    }
  }

  const csv = [header, ...rows].map((row) => header.map((_, i) => quote(row[i] ?? "")).join(",")).join("\r\n") + "\r\n";
  return { csv, changes, matched: inScope.size, products: firstRowOf.size, variantRows: rows.length, warnings };
}

/** What the file holds, so a scope can be built from real values rather than guessed at. */
export function describeFile(text: string): { products: number; variantRows: number; vendors: string[]; types: string[]; tags: string[] } {
  const grid = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
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
  return { products: seen.size, variantRows, vendors: sorted(vendors), types: sorted(types), tags: sorted(tags) };
}
