/**
 * How a product is named: the Title column, and the SEO title that goes with it.
 *
 * Two rules, both read off the shop's own catalogue. The Title never carries the brand — not one of
 * its 827 products begins with its own vendor — and the SEO title always does: 752 of the 797
 * products that have one are exactly the vendor followed by the title, and not one is the title
 * alone. And a seasonal product carries its year after the name: every snowboard, 96% of skis, 95%
 * of snowboard bindings, 91% of snow clothing. Outdoor kit never does, which is the same line the
 * season tag draws — a product that carries a year tag carries the year in its name.
 */

import { EVERGREEN_SEASON, MANUAL_SEASON } from "./tagging";

const YEAR_IN_NAME = /\b20\d{2}\b/;

/** The years that are not a season: the shop's sentinels for something that does not change. */
function isSeason(value: string | number | undefined | null): boolean {
  const season = String(value ?? "").trim();
  if (!/^20\d{2}$/.test(season)) return false;
  return season !== EVERGREEN_SEASON && season !== MANUAL_SEASON;
}

/**
 * The Title column: the product's own name, with its season after it.
 *
 * A name that already carries a year is left alone — "Mantra Junior 2025" is not made into "Mantra
 * Junior 2025 2026" — and so is anything without a season, which is how a tent stays a tent.
 */
export function productTitle(name: string, season?: string | number | null): string {
  const title = name.trim().replace(/\s+/g, " ");
  if (!title || !isSeason(season) || YEAR_IN_NAME.test(title)) return title;
  return `${title} ${season}`;
}

/**
 * The SEO Title column: the vendor, then the title. The shop writes "Volkl Mantra 88 2026" for a
 * product titled "Mantra 88 2026", and a title that already leads with its brand is not given it
 * twice.
 */
export function seoTitle(vendor: string, title: string): string {
  const brand = vendor.trim().replace(/\s+/g, " ");
  const name = title.trim().replace(/\s+/g, " ");
  if (!brand) return name;
  if (!name) return brand;
  return name.toLowerCase().startsWith(`${brand.toLowerCase()} `) || name.toLowerCase() === brand.toLowerCase()
    ? name
    : `${brand} ${name}`;
}

/** True when a title names its own brand, which the shop's Title column never does. */
export function leadsWithVendor(vendor: string, title: string): boolean {
  const brand = vendor.trim().toLowerCase();
  if (!brand) return false;
  const name = title.trim().toLowerCase();
  return name === brand || name.startsWith(`${brand} `);
}

/** Take the brand back off a title that arrived with it, since the Title column does not carry it. */
export function withoutVendor(vendor: string, title: string): string {
  if (!leadsWithVendor(vendor, title)) return title.trim();
  return title.trim().slice(vendor.trim().length).trim().replace(/^[-–—:,]\s*/, "");
}
