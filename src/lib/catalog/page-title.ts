import { withoutGender } from "./mapping";
import { productTitle, withoutVendor } from "./titles";
import { withoutColour } from "./title-colour";

/**
 * The product's title as the supplier's page names it, with its season after it.
 *
 * The shop asked (2026-10-16) that a new product be titled as the supplier titles it on the page
 * it was given, for search: the same words a customer searching for it will type. The shop's own
 * rules still hold over it — no brand at the front (the SEO title carries it), no gender, and the
 * season after the name. The site's name after a bar or a dash goes, as a browser title carries it.
 * Never the colour, though the page may write one (asked 2026-10-20). See title-colour.ts.
 * "" when the page gives no name worth using.
 */
export function pageProductTitle(pageTitle: string, vendor: string, season: string | null, colours: Array<string | null | undefined> = []): string {
  let name = pageTitle.replace(/\s+/g, " ").trim();
  name = name.split(/\s+\|\s+/)[0];
  const tail = /\s+[-–—]\s+([^-–—]+)$/.exec(name);
  const brand = vendor.trim().toLowerCase();
  if (tail && ((brand && tail[1].toLowerCase().includes(brand)) || /australia|official|online|shop|store/i.test(tail[1]))) name = name.slice(0, tail.index);
  name = withoutVendor(vendor, name);
  name = withoutGender(name).title;
  // A page writes the gender inside the name too — "Exos 58 Men's Backpack" — where an order never does.
  name = name.replace(/\s*\b(?:men['’]?s|women['’]?s|ladies['’]?|unisex)(?=\s|$)/gi, "").replace(/\s+/g, " ").trim();
  name = withoutColour(name, colours);
  if (name.length < 2 || !/[A-Za-z]/.test(name)) return "";
  return productTitle(name, season);
}
