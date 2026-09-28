/**
 * The shop's product body, and whether one has been written yet.
 *
 * Pure, and its own module for one reason: three different places need these two functions and one
 * of them is the browser. They used to live beside the web lookup, which loads the API client, so
 * asking "has this body been written?" on a page meant shipping the Anthropic SDK to it.
 */

/**
 * The shop's own body layout, as their 827 existing products write it: a paragraph of the
 * manufacturer's copy per line, then a Tech Specs heading, then the spec lines as a list.
 *
 *   <p>...</p>
 *   <h2>Tech Specs</h2>
 *   <ul>
 *   <li>Sidecut radius front: 35 m @ 172</li>
 *   </ul>
 *
 * 414 of the 714 products that carry a body are exactly this with one paragraph, and another 143
 * are the same with two or three. Nothing follows the list.
 */
export function houseBody(description: string, features: string[]): string {
  const paragraphs = description.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
  const specs = features.map((f) => f.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (paragraphs.length === 0 && specs.length === 0) return "";
  const lines = paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`);
  if (specs.length > 0) {
    lines.push("<h2>Tech Specs</h2>", "<ul>", ...specs.map((f) => `<li>${escapeHtml(f)}</li>`), "</ul>");
  }
  return lines.join("\n");
}

/**
 * Whether a body is the invoice's own words rather than the manufacturer's.
 *
 * When products are built, the line off the invoice is written into the description so the column
 * is not blank — "Spyder mens technical jacket." and nothing else. That is a name, not copy, and
 * it was quietly defeating the whole point of the lookup: enrichment only filled a description
 * that was *empty*, so every product built from an invoice was ineligible and kept the one-liner
 * all the way into Shopify.
 *
 * A real description from a lookup is 50-110 words of the manufacturer's prose and normally
 * carries a Tech Specs list. Anything that is one short paragraph with no spec list is the
 * placeholder, and the brand's own copy is allowed to replace it. A description someone has
 * actually written — longer, or with a list, or more than one paragraph — is left alone.
 */
export function isPlaceholderBody(html: string): boolean {
  const body = html.trim();
  if (!body) return true;
  /**
   * A Tech Specs list with no prose in front of it is not a written description.
   *
   * A supplier's spec export gives the numbers and never the words — Volkl's has the waist width,
   * the sidecut radii and the core, and not one sentence anyone would read. Those specs belong on
   * the product immediately; the prose is what the web lookup goes and finds later. Without this
   * line the two could not both happen: a body carrying a list read as "already written", so a
   * product that had its specs could never get its description.
   */
  const prose = body.replace(/<(ul|ol|table)[\s\S]*?<\/\1>/gi, " ").replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi, " ");
  const proseWords = prose.replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean);
  // No prose AT ALL, rather than not much of it: a lookup that comes back with two short
  // sentences is still somebody's writing and must not be fetched again, while a body built from
  // a spec sheet has nothing outside its list and is still waiting for its words.
  if (/<(ul|ol|h[1-6]|table)\b/i.test(body) && proseWords.length === 0) return true;
  if (/<(ul|ol|h[1-6]|table)\b/i.test(body)) return false;
  if ((body.match(/<p\b/gi) ?? []).length > 1) return false;
  const words = body.replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean);
  return words.length < 25;
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
