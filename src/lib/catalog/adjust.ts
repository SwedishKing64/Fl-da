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
  const have = new Set(splitTags(row["Tags"] ?? "").map((t) => t.toLowerCase()));
  if (scope.tags?.length && !scope.tags.every((t) => have.has(t.trim().toLowerCase()))) return false;
  if (scope.anyTags?.length && !scope.anyTags.some((t) => have.has(t.trim().toLowerCase()))) return false;
  // Exclusions last, and they win: "not the 2027s" means not the 2027s, whatever else matched.
  if (scope.excludeTags?.some((t) => have.has(t.trim().toLowerCase()))) return false;
  if (scope.excludeVendors?.some((v) => eq(v, row["Vendor"] ?? ""))) return false;
  return true;
}

/** True when a scope names nothing at all, which would take in the whole file. */
export function isWholeFile(scope: Scope): boolean {
  return !scope.vendors?.length && !scope.types?.length && !scope.tags?.length && !scope.anyTags?.length
    && !scope.handles?.length && !scope.titleContains?.trim()
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
export function verifyOnlyIntended(before: string[][], after: string, changes: Change[]): string[] {
  const parsed = parseCsv(after).filter((r) => r.some((c) => c.trim() !== ""));
  const header = before[0];
  const problems: string[] = [];

  if (parsed.length !== before.length) {
    problems.push(`The file came back with ${parsed.length} rows instead of ${before.length}.`);
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
