/**
 * The shape of a shop's profile and the countries it can be in. Pure, so the forms in the browser
 * can import it; `shop-profile.ts` is where it is read and kept.
 */

import type { RulesPack } from "./taxonomy";

export interface ShopProfile {
  /** The trading name, as it goes on SEO titles. */
  name: string;
  /** What it sells, in the shop's own words: "skis, snowboards and outdoor gear", "bikes". */
  sells: string;
  /** ISO 3166 country code. */
  country: string;
  /** ISO 4217 currency code. */
  currency: string;
  /** What the sales tax is called: GST, VAT, Sales tax. Empty when prices carry none. */
  taxName: string;
  /** The rate, as a fraction: 0.1 for 10%. */
  taxRate: number;
  /** The rules pack switched on. */
  pack: RulesPack;
  /** The fixed half of a marker tag written on everything built here; empty for none. */
  marker: string;
  /** Setup has been walked through to the end. */
  setupDone: boolean;
  /** Steps a person chose to come back to. */
  skipped: { learn?: boolean; house?: boolean; ai?: boolean; suppliers?: boolean };
}

export const DEFAULT_PROFILE: ShopProfile = {
  name: "",
  sells: "",
  country: "AU",
  currency: "AUD",
  taxName: "GST",
  taxRate: 0.1,
  pack: "general",
  marker: "",
  setupDone: false,
  skipped: {},
};

export const COUNTRIES: Array<{ code: string; name: string; currency: string; taxName: string; taxRate: number }> = [
  { code: "AU", name: "Australia", currency: "AUD", taxName: "GST", taxRate: 0.1 },
  { code: "NZ", name: "New Zealand", currency: "NZD", taxName: "GST", taxRate: 0.15 },
  { code: "GB", name: "United Kingdom", currency: "GBP", taxName: "VAT", taxRate: 0.2 },
  { code: "US", name: "United States", currency: "USD", taxName: "Sales tax", taxRate: 0 },
  { code: "CA", name: "Canada", currency: "CAD", taxName: "GST", taxRate: 0.05 },
  { code: "EU", name: "Europe (euro)", currency: "EUR", taxName: "VAT", taxRate: 0.2 },
  { code: "JP", name: "Japan", currency: "JPY", taxName: "Consumption tax", taxRate: 0.1 },
  { code: "CH", name: "Switzerland", currency: "CHF", taxName: "VAT", taxRate: 0.081 },
  { code: "XX", name: "Somewhere else", currency: "USD", taxName: "", taxRate: 0 },
];
