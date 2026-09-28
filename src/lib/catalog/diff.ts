/**
 * What actually changed between the file that was loaded and the file that will be imported.
 *
 * Every change on this page is already described before it runs — "take 20% off these 96 products"
 * — and that is a description of an intention. This is the other thing, and the one somebody wants
 * before they press import on a live catalogue: the file itself, with the cells that moved marked,
 * the old value beside the new one, and the rows that were added to the end shown as added.
 *
 * It is a diff of the two files rather than a reading of the change list, and that difference is
 * the point. A change list says what the tool MEANT to do; a diff says what the file now SAYS. They
 * agree, and the only way to know they agree is to look at the file. It also catches what a change
 * list structurally cannot: a delivery appends rows for a new product and for a size a product has
 * never been stocked in, and no cell on those rows is a "change" to anything.
 *
 * Rows keep their position. Nothing on this page deletes or reorders a row — that is the promise
 * verifyOnlyIntended enforces — so row N of the old file is row N of the new one, and anything past
 * the end of the old file is new. That makes the diff exact rather than a guess at what lines up.
 */

import { parseCsv } from "./csv";

export interface CellChange {
  column: string;
  before: string;
  after: string;
}

export interface RowDiff {
  /** Whether this row was edited in place, or written on the end of the file. */
  kind: "changed" | "added";
  /** Which row of the file, counting the header as row 0, so it can be found in a spreadsheet. */
  row: number;
  handle: string;
  /** The product's name, taken from its first row — a variant row does not carry one. */
  title: string;
  /** Which variant this row is: the option values, joined. Empty for a product with no options. */
  option: string;
  /** The cells that moved. Empty on an added row, where every cell is new. */
  cells: CellChange[];
  /** An added row's own values, the filled ones only, so a new product can be read. */
  added?: Array<{ column: string; value: string }>;
}

export interface CsvDiff {
  /** Every column that changed anywhere, in the file's own column order. */
  columns: string[];
  rows: RowDiff[];
  changedCells: number;
  changedRows: number;
  addedRows: number;
  /** Rows that came through untouched — the number worth seeing, because it is nearly all of them. */
  untouched: number;
  /** Why the two files could not be compared, if they could not be. */
  problem: string;
}

const EMPTY: CsvDiff = { columns: [], rows: [], changedCells: 0, changedRows: 0, addedRows: 0, untouched: 0, problem: "" };

const clean = (csv: string): string[][] => parseCsv(csv).filter((r) => r.some((c) => c.trim() !== ""));

/**
 * The name of the product a row belongs to.
 *
 * Shopify writes a product's Title on its first row and leaves it blank on the rest, so a row about
 * the 177 of a ski carries no name at all. Read from the new file, because a product that was only
 * just added is not in the old one.
 */
function titles(grid: string[][], handleAt: number, titleAt: number): Map<string, string> {
  const found = new Map<string, string>();
  if (handleAt < 0 || titleAt < 0) return found;
  for (const row of grid.slice(1)) {
    const handle = (row[handleAt] ?? "").trim();
    const title = (row[titleAt] ?? "").trim();
    if (handle && title && !found.has(handle)) found.set(handle, title);
  }
  return found;
}

export function diffCsv(before: string, after: string): CsvDiff {
  const old = clean(before);
  const now = clean(after);
  if (old.length === 0 || now.length === 0) return { ...EMPTY, problem: "One of the two files has no rows in it." };

  const header = now[0];
  if (old[0].join("\u0000") !== header.join("\u0000")) {
    return { ...EMPTY, problem: "The two files do not have the same columns, so they cannot be compared row by row." };
  }
  if (now.length < old.length) {
    // Nothing here removes a row. If one is missing, saying so is better than showing a diff that
    // has quietly slid every row after it up by one and looks like a thousand changes.
    return { ...EMPTY, problem: `The new file has ${old.length - now.length} fewer rows than the one that was loaded, which is not something this page does. Nothing is shown rather than a comparison that cannot be trusted.` };
  }

  const at = (name: string) => header.indexOf(name);
  const handleAt = at("Handle");
  const name = titles(now, handleAt, at("Title"));
  const optionAt = ["Option1 Value", "Option2 Value", "Option3 Value"].map(at).filter((i) => i >= 0);
  const optionOf = (row: string[]) => optionAt.map((i) => (row[i] ?? "").trim()).filter(Boolean).join(" / ");
  const handleOf = (row: string[]) => (handleAt < 0 ? "" : (row[handleAt] ?? "").trim());

  const rows: RowDiff[] = [];
  const moved = new Set<string>();
  let changedCells = 0;

  for (let r = 1; r < old.length; r++) {
    const cells: CellChange[] = [];
    for (let c = 0; c < header.length; c++) {
      const was = old[r][c] ?? "";
      const is = now[r][c] ?? "";
      if (was === is) continue;
      cells.push({ column: header[c], before: was, after: is });
      moved.add(header[c]);
    }
    if (cells.length === 0) continue;
    changedCells += cells.length;
    const handle = handleOf(now[r]);
    rows.push({ kind: "changed", row: r, handle, title: name.get(handle) ?? "", option: optionOf(now[r]), cells });
  }

  const changedRows = rows.length;
  for (let r = old.length; r < now.length; r++) {
    const handle = handleOf(now[r]);
    rows.push({
      kind: "added",
      row: r,
      handle,
      title: name.get(handle) ?? "",
      option: optionOf(now[r]),
      cells: [],
      added: header.map((column, i) => ({ column, value: (now[r][i] ?? "").trim() })).filter((x) => x.value !== ""),
    });
  }

  return {
    // The file's own order, so the preview's columns sit where they sit in the spreadsheet.
    columns: header.filter((h) => moved.has(h)),
    rows,
    changedCells,
    changedRows,
    addedRows: now.length - old.length,
    untouched: old.length - 1 - changedRows,
    problem: "",
  };
}
