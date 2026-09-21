/**
 * Tags Shopify writes by itself — price bands, sizes, lengths and colours are all derived from the
 * variants once a product is in the store.
 *
 * These live on their own, away from the rest of the tagging rules, because three very different
 * places need them and one of those runs in the browser. Pulling the whole taxonomy into the bulk
 * page to test a handful of prefixes would ship the shelf tree, the binding classifier and the
 * boot classifier to every person who opens it.
 *
 * They matter three times over. The importer must not write them, or it would fight Shopify over
 * the same tag. The template learner must not read them either: a brand export is full of
 * colour-true-black and size-medium, and without this a template would learn those as house
 * conventions. And they must not crowd out the catalogue's real vocabulary when an instruction is
 * being grounded — across this shop's ten exports they are 177 of the 399 distinct tags, and in
 * alphabetical order the colours alone bury every shelf tag from "goggles" onwards.
 */
const SHOPIFY_GENERATED: RegExp[] = [
  /^\d+-\d+$/, // price band, e.g. 500-600
  /^under-\d+$/, // e.g. under-50
  /^size-/i,
  /^length-/i, // board and ski lengths, e.g. length-156, length-156w
  /^colou?r-/i,
];

export function isShopifyGenerated(tag: string): boolean {
  const value = tag.trim();
  return SHOPIFY_GENERATED.some((pattern) => pattern.test(value));
}

/** Drop anything Shopify maintains for itself. */
export function withoutGenerated(tags: string[]): string[] {
  return tags.filter((tag) => !isShopifyGenerated(tag));
}
