/** URL-safe Shopify handle: lowercase, hyphenated, ASCII only, max 255 chars. */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
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
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(handle) && handle.length <= 255;
}
