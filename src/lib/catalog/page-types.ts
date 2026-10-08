/**
 * What reading a product's own web page yields. Pure types and helpers, so a page in the browser
 * can hold the result without being sent the Anthropic client or the fetcher behind it.
 */

export interface PageDetails {
  /** The manufacturer's description, in their words, paragraphs separated by a blank line. */
  description: string;
  /** The page's own specification / details lines, "Label: value" where it writes them that way. */
  features: string[];
  /** The product's own photographs, hero first, as absolute https URLs. */
  images: string[];
  /** What the page calls the product, for checking it is the one asked for. */
  pageTitle: string;
  /** False when the page looks like a different product, a different year, or no product at all. */
  confident: boolean;
  sourceUrl: string;
  /** How it was read: "ai" is the model reading the page; "basic" is only what the page declares about itself. */
  via: "ai" | "basic";
  /** The colour the pictures show, as the page names it, where the model could tell. */
  pictureColour?: string;
  /** One line for the person: what was and was not found. */
  note: string;
}

/**
 * What somebody typed or pasted as a product link, made into something fetchable.
 *
 * "www.rossignol.com/au/x" is a link; so is "https://…" with a trailing space or a fragment. Only
 * https to a public host: an internal address in this box would make the server fetch it for them.
 */
export function cleanProductUrl(raw: string): { url: string } | { error: string } {
  let text = raw.trim().replace(/^<|>$/g, "");
  if (!text) return { error: "" };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `https://${text}`;
  let u: URL;
  try { u = new URL(text); } catch { return { error: "That does not look like a web address." }; }
  if (u.protocol === "http:") u.protocol = "https:";
  if (u.protocol !== "https:") return { error: "Only https links can be read." };
  if (u.username || u.password) return { error: "A link with a password in it cannot be read." };
  if (u.port && u.port !== "443") return { error: "Only ordinary https links can be read." };
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".")) return { error: "That address is not a public website." };
  // An address written as numbers is somebody's machine, never a brand's website.
  if (/^[\d.]+$/.test(host) || host.startsWith("[")) return { error: "That address is not a public website." };
  u.hash = "";
  return { url: u.toString() };
}

/**
 * The model's name without its fit, so the fits of one model share a page: "M4 Cylindrical Low
 * Bridge" and "M4 Cylindrical" are one page on Anon's site, as are "Photon BOA Wide" and "Photon BOA".
 */
export function fitlessOf(title: string): string {
  return title.replace(/\b(wide|extra wide|narrow|low bridge( fit)?|asian fit|round fit|oval fit|regular( fit)?)\b/gi, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

/** The flat ski's handle for a package's: "m7-mantra-2027-inc-marker-griffon-binding-package" → "m7-mantra-2027". */
export function flatHandleOf(handle: string): string {
  return handle.replace(/-inc-.*binding-package(-\d+)?$/, "").replace(/-inc-.*$/, "");
}
