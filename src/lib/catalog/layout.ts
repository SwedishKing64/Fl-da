/**
 * A document's layout, so a supplier's next invoice in the same layout is recognised.
 *
 * A spreadsheet's layout is its headings. A PDF's is the line its columns are headed by: "Item
 * Code  Description  Colour  Size  Qty  Unit Price  Amount". The words of that line, sorted, are
 * the same on every invoice the supplier's system prints, whatever is ordered, and change when the
 * supplier changes systems — which is when a remembered way of reading them stops being safe.
 */

/** Words that head an invoice's columns, in any trade. */
const HEADING_WORDS = new Set([
  "item", "code", "sku", "style", "article", "art", "ref", "description", "product", "name", "model",
  "colour", "color", "col", "size", "sizes", "qty", "quantity", "units", "ordered", "shipped", "price",
  "cost", "unit", "amount", "total", "net", "rrp", "msrp", "retail", "ean", "upc", "barcode", "gtin",
  "disc", "discount", "each", "value", "line", "uom", "pack", "case", "width", "length", "season",
]);

const words = (line: string) => line.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);

/**
 * The heading line of a document's text, as its sorted heading words, or null where no line reads
 * as one. Only the top of the document is searched: a heading repeated on page two is the same line.
 */
export function layoutOf(text: string): string | null {
  let best: { score: number; key: string } | null = null;
  for (const line of text.split(/\r?\n/).slice(0, 120)) {
    const all = words(line);
    if (all.length < 3 || all.length > 24) continue;
    const heading = all.filter((w) => HEADING_WORDS.has(w));
    // Most of the line must be heading words: a sentence that mentions price and quantity is not one.
    if (heading.length < 3 || heading.length / all.length < 0.6) continue;
    if (!best || heading.length > best.score) best = { score: heading.length, key: Array.from(new Set(all)).sort().join(" ") };
  }
  return best?.key ?? null;
}

/** A spreadsheet's layout: its headings, as words, sorted. */
export function layoutOfHeaders(headers: string[]): string | null {
  const all = Array.from(new Set(headers.flatMap(words)));
  return all.length > 0 ? all.sort().join(" ") : null;
}

/**
 * Whether two layouts are the same one. A supplier's system adds or drops a column now and then
 * — a discount column on one invoice and not the next — so most of the words in common is enough.
 */
export function sameLayout(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const x = new Set(a.split(" "));
  const y = new Set(b.split(" "));
  const shared = [...x].filter((w) => y.has(w)).length;
  return shared / Math.max(x.size, y.size) >= 0.8;
}
