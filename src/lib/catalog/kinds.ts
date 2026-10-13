/**
 * The kinds of product an order holds, as the batch page and the build compare them. Pure, so the
 * page's picker can use it without pulling the instruction reader into the browser.
 */
import { brandsAsked } from "./brands";
import type { InvoiceLine } from "./reconcile";

/** A kind of product as one word to compare: "Snowboard Bindings", "snowboard-bindings" and "snowboard binding" are one kind. */
export function typeKey(value: string): string {
  return value.trim().toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().replace(/s\b/g, "");
}

/**
 * Whether a built product is one of the kinds the person said to work with. Its Type first, and
 * failing that the category it was filed under, so "Snowboards" takes a board whichever way the
 * categoriser wrote it. No kinds named means every product.
 */
export function isOfType(product: { productType: string; category?: string }, types: string[]): boolean {
  if (types.length === 0) return true;
  const wanted = new Set(types.map(typeKey).filter(Boolean));
  if (wanted.size === 0) return true;
  return wanted.has(typeKey(product.productType)) || wanted.has(typeKey(product.category ?? ""));
}

/**
 * What kind of thing an order line is, for working an order one kind at a time.
 *
 * Burton's form has a column that says — "SNOWBOARDS", "BINDINGS", "GLOVES" — and that is taken
 * first. A form that does not say still lands most lines on a listing the shop has, by barcode,
 * and the listing's Type says. A line that neither places is "Not said", so it is still a kind
 * that can be ticked. Written as the shop writes a Type: "Snowboard Bindings", not "BINDINGS".
 */
export const KIND_NOT_SAID = "Not said";

export function kindOfLine(line: Pick<InvoiceLine, "kind" | "barcode">, typeByBarcode: Map<string, string>): string {
  const said = (line.kind ?? "").trim();
  if (said) return tidyKind(said);
  const listed = typeByBarcode.get(line.barcode.replace(/^'/, "").trim());
  return listed?.trim() ? listed.trim() : KIND_NOT_SAID;
}

/** "SNOWBOARDS" as "Snowboards", "SNOWBOARD BINDINGS" as "Snowboard Bindings"; a kind already cased is left alone. */
export function tidyKind(kind: string): string {
  const k = kind.trim();
  if (k !== k.toUpperCase()) return k;
  return k.toLowerCase().replace(/(^|[\s/-])([a-z])/g, (m) => m.toUpperCase());
}

/** The listing Type of every barcode in the loaded exports, so an order line can be placed by its EAN. */
export function typesByBarcode(listings: Array<{ productType: string; barcodes?: string[] }>): Map<string, string> {
  const out = new Map<string, string>();
  for (const l of listings) for (const b of l.barcodes ?? []) if (b.trim() && l.productType.trim() && !out.has(b.trim())) out.set(b.trim(), l.productType.trim());
  return out;
}

/**
 * Which of an order's kinds an instruction keeps, or null when it is not about that: "only the
 * snowboards", "just do the boards and bindings", "leave out the gloves". Read the way the brands
 * are, against the kinds actually on the order, so a kind it does not carry is not a filter. A
 * kind is matched whole or by its own word — "boards" is Snowboards, "bindings" is Snowboard
 * Bindings — but never by a word two kinds share.
 */
export function kindsAsked(instruction: string, onOrder: string[]): string[] | null {
  const kinds = onOrder.map((k) => k.trim()).filter(Boolean);
  if (kinds.length < 2) return null;
  const direct = brandsAsked(instruction, kinds);
  if (direct) return direct;
  // By a word of its own: each kind's last word, and a board's "board", where only one kind has it.
  const words = (k: string) => {
    const own = k.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ");
    // A board's "board" belongs to the boards alone, not to the bindings and boots that share the word.
    const boards = own.length === 1 && /^snowboards?$/.test(own[0]) ? ["boards", "board"] : [];
    return [...new Set([...own.flatMap((w) => [w, w.replace(/s$/, "")]), ...boards])];
  };
  const owner = new Map<string, string[]>();
  for (const k of kinds) for (const w of words(k)) owner.set(w, [...(owner.get(w) ?? []), k]);
  const spoken = instruction.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ");
  const named = new Map<string, string>();
  for (const w of spoken) {
    const owners = owner.get(w) ?? [];
    if (owners.length === 1 && !named.has(owners[0])) named.set(owners[0], w);
  }
  if (named.size === 0) return null;
  // Put the kind's own name where its word was, and let the brand reader judge the words around it.
  let text = ` ${instruction} `;
  for (const [k, w] of named) text = text.replace(new RegExp(`(^|[^a-z0-9])${w}(?![a-z0-9])`, "i"), `$1${k}`);
  return brandsAsked(text, kinds);
}
