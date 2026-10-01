/**
 * A Shopify handle: lowercase, hyphenated, max 255 chars.
 *
 * Not ASCII only. Shopify keeps a symbol that is in the name — the shop's own handles are
 * "mens-photon-boa®-wide-snowboard-boots-2026" and "flow-scape™-m-low-bridge-fit-snow-goggles-2026"
 * — and an import matches on the handle exactly, so a handle with the ® taken out would have made a
 * second Photon beside the one the shop has. Accents still go ("Völkl" is volkl), and so does any
 * punctuation, but a symbol stays where Shopify would keep it.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    // An apostrophe closes up rather than splitting the word: "Men's" is mens, never men-s. This
    // is what Shopify does and what the shop's catalogue carries — 113 of the 116 products whose
    // name has an apostrophe, the three exceptions all hand-edited.
    .replace(/['‘’ʼ]/g, "")
    .replace(/[^a-z0-9\p{So}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 255)
    .replace(/-+$/g, "");
}

/**
 * Deterministic handle for a product so re-imports of the same product match instead of
 * duplicating. Uses "<brand> <title>" unless the title already begins with the brand.
 */
export function buildHandle(parts: { brand?: string; title: string }): string {
  const brand = (parts.brand || "").trim();
  const title = (parts.title || "").trim();
  const startsWithBrand = brand && title.toLowerCase().startsWith(brand.toLowerCase());
  return slugify(startsWithBrand || !brand ? title : `${brand} ${title}`);
}

export function isValidHandle(handle: string): boolean {
  return /^[a-z0-9\p{So}]+(-[a-z0-9\p{So}]+)*$/u.test(handle) && handle.length <= 255;
}
