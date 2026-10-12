/**
 * The kinds of product an order holds, as the batch page and the build compare them. Pure, so the
 * page's picker can use it without pulling the instruction reader into the browser.
 */
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
