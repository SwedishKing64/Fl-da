/**
 * The shop's own website as the list of kinds of product.
 *
 * A product has a place it must appear on the shop's site, and that place is a category the site
 * already has. So the categories are read off the site itself, once, and become the kinds of
 * product Flöda may write: the Shopify `Type` column is filled only from this list, and a Type the
 * reader proposes that is not on it is an error on the review grid rather than a word nobody put
 * there. Nothing is invented.
 *
 * Two ways to read a site. A Shopify store answers `/collections.json` with every collection it
 * has, which is exactly the list of places a product can be filed. Any other site is read from
 * the links in its menu. Either way the person sees the list before it is kept and can leave
 * entries out. Merchandising entries — Sale, Brands, Gift cards, New in — are not kinds of
 * product and are left out up front.
 *
 * The pure half (parsing, filtering) is here with no fetch in it, so it can be tested on saved
 * pages; `readWebsite` does the fetching.
 */

export interface WebsiteCategory {
  /** The category as the site names it: this is what goes in the Type column. */
  title: string;
  /** Where it lives on the site, for the person to recognise it. */
  path: string;
}

export interface WebsiteCategories {
  url: string;
  source: "shopify" | "menu";
  categories: WebsiteCategory[];
  readAt: string;
}

/** `aussieskier.com.au`, `https://aussieskier.com.au/collections/skis` → `https://aussieskier.com.au`. */
export function siteOrigin(input: string): string | undefined {
  const raw = input.trim();
  if (!raw) return undefined;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    if (!url.hostname.includes(".")) return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

/** Entries no shop files a product under: they are promotions, brands, pages about the shop. */
const NOT_A_KIND = /^(all|all products|everything|home|home ?page|frontpage|front page|shop|shop all|new|new in|new arrivals|latest|sale|sales|clearance|outlet|specials?|deals?|promotions?|offers?|brands?|gift ?cards?|gift ?vouchers?|vouchers?|e-?gift ?cards?|best ?sellers?|featured|trending|popular|staff picks|rentals?|hire|services?|workshop|repairs?|contact(?: us)?|about(?: us)?|blog|news|journal|stories|faqs?|help|support|shipping|delivery|returns?|refunds?|privacy(?: policy)?|terms(?: (?:and|&) conditions)?|login|log in|sign in|account|my account|register|cart|checkout|search|wishlist|compare|store locator|stores?|locations?|careers?|jobs?|sitemap|reviews?|size guide|size chart|lookbook|gallery|instagram|facebook|events?)$/i;

/** Clean a category name as a site writes it: whitespace, entities, a trailing count. */
function cleanTitle(raw: string): string {
  return raw
    .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, "\"").replace(/&[a-z]+;/gi, " ")
    .replace(/\s*\(\d+\)\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isKindOfProduct(title: string): boolean {
  const t = title.trim();
  if (t.length < 2 || t.length > 80) return false;
  if (!/[a-z]/i.test(t)) return false;
  return !NOT_A_KIND.test(t);
}

/** The same category twice, however it is spelled or linked, counts once. */
function dedupe(list: WebsiteCategory[]): WebsiteCategory[] {
  const seen = new Set<string>();
  const out: WebsiteCategory[] = [];
  for (const c of list) {
    const key = c.title.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/** The categories in one page of a Shopify store's `/collections.json`. */
export function parseShopifyCollections(json: unknown): WebsiteCategory[] {
  const list = (json as { collections?: unknown })?.collections;
  if (!Array.isArray(list)) return [];
  const out: WebsiteCategory[] = [];
  for (const entry of list) {
    const c = entry as { title?: unknown; handle?: unknown };
    const title = cleanTitle(String(c.title ?? ""));
    const handle = String(c.handle ?? "").trim();
    if (!title || !handle || !isKindOfProduct(title)) continue;
    out.push({ title, path: `/collections/${handle}` });
  }
  return dedupe(out);
}

/**
 * The categories linked from a page's menus. Every link on the page is looked at; one counts when
 * it points at the same site, names a kind of product, and is not a product, a page or a post.
 * On a Shopify site only collection links count, which is a much better signal.
 */
export function parseMenuLinks(html: string, origin: string): WebsiteCategory[] {
  const out: WebsiteCategory[] = [];
  const anchor = /<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  const shopify = /\/collections\//.test(html);
  while ((m = anchor.exec(html))) {
    const href = m[1].trim();
    const text = cleanTitle(m[2].replace(/<[^>]+>/g, " "));
    if (!text) continue;
    let url: URL;
    try {
      url = new URL(href, origin);
    } catch {
      continue;
    }
    if (url.origin !== origin) continue;
    const path = url.pathname.replace(/\/+$/, "");
    if (!path || path === "/") continue;
    if (shopify) {
      if (!/^\/collections\/[^/]+$/.test(path)) continue;
      if (/^\/collections\/(all|frontpage)$/.test(path)) continue;
    } else {
      if (/^\/(products?|cart|account|checkout|search|pages?|blogs?|posts?|news|login|signin|sign-in|register)(\/|$)/i.test(path)) continue;
      if (/\.(jpe?g|png|gif|webp|svg|pdf|xml|json)$/i.test(path)) continue;
      if (url.search && !/^\?(category|cat|c)=/i.test(url.search)) continue;
    }
    if (!isKindOfProduct(text)) continue;
    out.push({ title: text, path: path + (shopify ? "" : url.search) });
  }
  return dedupe(out);
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 Floda/1.0";
const PAGE_LIMIT = 250;
const MAX_PAGES = 12;

async function get(url: string, accept: string): Promise<Response> {
  return fetch(url, { headers: { accept, "user-agent": UA }, redirect: "follow", signal: AbortSignal.timeout(20_000) });
}

/**
 * Read a site's categories. A Shopify store is read from `/collections.json`, page by page; any
 * other site from the links on its home page. Throws with a plain reason when nothing can be read.
 */
export async function readWebsite(input: string): Promise<WebsiteCategories> {
  const origin = siteOrigin(input);
  if (!origin) throw new Error("That is not a website address. Something like aussieskier.com.au.");
  const readAt = new Date().toISOString();

  // Shopify first: the list is complete and nothing has to be guessed from a menu.
  const fromShopify: WebsiteCategory[] = [];
  let shopify = false;
  for (let page = 1; page <= MAX_PAGES; page++) {
    let res: Response;
    try {
      res = await get(`${origin}/collections.json?limit=${PAGE_LIMIT}&page=${page}`, "application/json");
    } catch (err) {
      if (page === 1) throw new Error(`${origin} could not be reached: ${err instanceof Error ? err.message.replace(/^fetch failed:?\s*/i, "") || "no answer" : "no answer"}. Check the address and that the site is up.`);
      break;
    }
    if (!res.ok || !/json/i.test(res.headers.get("content-type") ?? "")) break;
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      break;
    }
    const list = (json as { collections?: unknown[] })?.collections;
    if (!Array.isArray(list)) break;
    shopify = true;
    fromShopify.push(...parseShopifyCollections(json));
    if (list.length < PAGE_LIMIT) break;
  }
  if (shopify) {
    const categories = dedupe(fromShopify);
    if (categories.length === 0) throw new Error(`${origin} is a Shopify store but lists no collections that name a kind of product.`);
    return { url: origin, source: "shopify", categories, readAt };
  }

  let html: string;
  try {
    const res = await get(origin, "text/html,application/xhtml+xml");
    if (!res.ok) throw new Error(`the site answered ${res.status}`);
    html = await res.text();
  } catch (err) {
    throw new Error(`${origin} could not be read: ${err instanceof Error ? err.message.replace(/^fetch failed:?\s*/i, "") || "no answer" : "no answer"}.`);
  }
  const categories = parseMenuLinks(html, origin);
  if (categories.length === 0) throw new Error(`No categories were found in the menus at ${origin}. If the menu is built by a script after the page loads, type the categories in by hand below.`);
  return { url: origin, source: "menu", categories, readAt };
}
