import { openExport, quote } from "./adjust";
import { typeKey } from "./kinds";

/**
 * A Shopify export cut down to the products of some kinds.
 *
 * The shop works a Burton delivery one kind at a time, and the file it wants to import is the
 * boards alone — not the bindings, boots and gloves that came in the same export and were left
 * for another day. A product's Type is on its first row and blank on the rows of its other
 * variants, so the rows are kept by product: every row of a product whose Type is one of the kinds
 * asked for, and none of any other. The column headings stay as they were, so the file imports
 * the way the whole one would.
 */
export function onlyKinds(text: string, kinds: string[]): { csv: string; products: number; rows: number; kinds: string[] } {
  const { grid } = openExport(text);
  const wanted = new Set(kinds.map(typeKey).filter(Boolean));
  if (grid.length < 2 || wanted.size === 0) return { csv: text, products: 0, rows: 0, kinds: [] };
  const header = grid[0];
  const col = (name: string) => header.indexOf(name);
  const handleAt = col("Handle");
  const typeAt = col("Type");
  if (handleAt < 0 || typeAt < 0) return { csv: text, products: 0, rows: 0, kinds: [] };
  // The Type of each product: the first of its rows that says.
  const typeOf = new Map<string, string>();
  for (const row of grid.slice(1)) {
    const handle = (row[handleAt] ?? "").trim();
    const type = (row[typeAt] ?? "").trim();
    if (handle && type && !typeOf.has(handle)) typeOf.set(handle, type);
  }
  const keep = new Set([...typeOf].filter(([, type]) => wanted.has(typeKey(type))).map(([handle]) => handle));
  const rows = grid.slice(1).filter((row) => keep.has((row[handleAt] ?? "").trim()));
  const found = [...new Set([...keep].map((h) => typeOf.get(h)!))].sort();
  const csv = [header, ...rows].map((row) => header.map((_, i) => quote(row[i] ?? "")).join(",")).join("\r\n") + "\r\n";
  return { csv, products: keep.size, rows: rows.length, kinds: found };
}

/** "-snowboards", "-snowboards-and-snowboard-bindings": the kinds as a file name's suffix. */
export function kindsSuffix(kinds: string[]): string {
  const slug = kinds.map((k) => k.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")).filter(Boolean);
  return slug.length ? `-${slug.join("-and-")}` : "";
}
