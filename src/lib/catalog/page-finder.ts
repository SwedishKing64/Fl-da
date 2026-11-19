/**
 * Finding a product's own page without anyone pasting it.
 *
 * A brand's site puts its products at one shape of address: once somebody has pasted a link for one
 * of a brand's lamps, every other product of that brand is a slug away. So the links people have pasted
 * are the memory: from each brand's links the shape of its addresses is worked out, the new
 * product's name is put into that shape, and the address is fetched and checked against the
 * product before it is believed. A brand nobody has linked yet, or a guess that does not hold, goes
 * to a web search, whose answer is checked the same way. Nothing is written to a product that
 * was not fetched and found to be titled like it: a wrong page is worse than none, because its
 * pictures and copy would go out under the wrong name.
 */

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "./db";
import { aiAvailable, anthropicClient, LIGHT_MODEL } from "./anthropic";
import { retrying } from "./api-errors";
import { distillPage, fetchHtml } from "./extract/page";
import { parseDirectives } from "./instructions";
import { setColourLink, setProductLink } from "./page-link";
import { flatHandleOf } from "./page-types";
import { logAudit } from "./audit";
import { productTypes } from "./taxonomy";

export interface LinkExample { vendor: string; handle: string; title: string; url: string }

/** The shape of one brand's addresses: its template with {slug} where the product's slug goes, and which slug style fitted. */
export interface BrandPattern { vendor: string; template: string; style: number; count: number }

export interface FindResult { productId: string; url: string; how: "pattern" | "search" | "none"; said: string; colourLinks?: Record<string, string> }

/** What a search answers: the product's page, and a page per colour where the brand has those. */
export interface SearchAnswer { url: string; colours: Record<string, string> }
/** A search, as the finder calls it; a bare address is the product's page alone. */
export type Searcher = (p: { title: string; vendor: string; modelCode?: string; colours?: string[] }) => Promise<SearchAnswer | string | null>;
export interface FindOutcome { attempted: number; found: number; byPattern: number; bySearch: number; capped: boolean; results: FindResult[] }

const EMPTY: FindOutcome = { attempted: 0, found: 0, byPattern: 0, bySearch: 0, capped: false, results: [] };
export const FIND_BUDGET_MS = 50_000;
const CONCURRENCY = 3;
const STOP = new Set(["the", "and", "with", "for", "of", "a", "an", "in", "on", "to", "inc", "mens", "womens", "kids", "men's", "women's", "unisex", "junior", "youth", "pack", "package"]);

const slugOf = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").replace(/[\s_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
const vendorKey = (v: string) => v.trim().toLowerCase();

/**
 * The slugs a product might be filed under, most likely first: its handle without the brand, the
 * same without the year, the whole handle, the whole without the year. Each style has a number so
 * a brand's pattern can say which it uses.
 */
export function slugCandidates(p: { handle: string; title: string; vendor: string }): Array<{ style: number; slug: string }> {
  const flat = flatHandleOf(p.handle);
  const brand = slugOf(p.vendor);
  const noBrand = brand && flat.startsWith(`${brand}-`) ? flat.slice(brand.length + 1) : flat;
  const noYear = (s: string) => s.replace(/-(19|20)\d{2}$/, "");
  const fromTitle = slugOf(p.title);
  const titleNoBrand = brand && fromTitle.startsWith(`${brand}-`) ? fromTitle.slice(brand.length + 1) : fromTitle;
  const raw = [noBrand, noYear(noBrand), flat, noYear(flat), titleNoBrand, noYear(titleNoBrand)];
  const out: Array<{ style: number; slug: string }> = [];
  const seen = new Set<string>();
  raw.forEach((slug, i) => { if (slug.length >= 3 && !seen.has(slug)) { seen.add(slug); out.push({ style: i, slug }); } });
  return out;
}

/** A URL with its query and hash off, and its path lower-cased: what an address shape is made of. */
function shapeOf(url: string): { origin: string; path: string } | null {
  try { const u = new URL(url); return { origin: `${u.protocol}//${u.hostname.toLowerCase()}`, path: decodeURIComponent(u.pathname).toLowerCase() }; } catch { return null; }
}

/** From the links people pasted, the shape of each brand's addresses: the commonest template per brand. */
export function learnPatterns(examples: LinkExample[]): BrandPattern[] {
  const tally = new Map<string, Map<string, { template: string; style: number; count: number }>>();
  for (const e of examples) {
    const vendor = vendorKey(e.vendor);
    if (!vendor) continue;
    const shape = shapeOf(e.url);
    if (!shape) continue;
    for (const { style, slug } of slugCandidates(e)) {
      // At a word boundary inside a segment: "trail-900-2027-lamp" carries "trail-900-2027", and the
      // slugs are tried longest first, so the year's absence is never mistaken for the year.
      const segments = shape.path.split("/");
      const at = segments.findIndex((s) => s === slug || s.startsWith(`${slug}-`) || s.startsWith(`${slug}.`) || s.endsWith(`-${slug}`) || s.includes(`-${slug}-`) || s.includes(`-${slug}.`));
      if (at < 0) continue;
      segments[at] = segments[at].replace(slug, "{slug}");
      const template = `${shape.origin}${segments.join("/")}`;
      const per = tally.get(vendor) ?? new Map();
      const have = per.get(template) ?? { template, style, count: 0 };
      have.count++;
      per.set(template, have);
      tally.set(vendor, per);
      break;
    }
  }
  const out: BrandPattern[] = [];
  for (const [vendor, per] of tally) {
    const best = [...per.values()].sort((a, b) => b.count - a.count)[0];
    out.push({ vendor, template: best.template, style: best.style, count: best.count });
  }
  return out;
}

/** The addresses a brand's shape gives for a product, the brand's usual slug style first. */
export function guessUrls(pattern: BrandPattern, p: { handle: string; title: string; vendor: string }): string[] {
  const slugs = slugCandidates(p).sort((a, b) => Number(b.style === pattern.style) - Number(a.style === pattern.style));
  return slugs.map((s) => pattern.template.replace("{slug}", s.slug)).slice(0, 4);
}

/** Whether a page's title is this product's: every number in the product's name on the page, and most of its words. */
export function pageMatches(pageTitle: string, p: { title: string; vendor: string }): boolean {
  const brand = new Set(slugOf(p.vendor).split("-").filter(Boolean));
  const words = slugOf(p.title).split("-").filter((w) => w.length >= 2 && !brand.has(w) && !STOP.has(w) && !/^(19|20)\d{2}$/.test(w));
  if (words.length === 0) return false;
  const hay = ` ${slugOf(pageTitle).replace(/-/g, " ")} `;
  const flat = hay.replace(/\s+/g, "");
  const present = (w: string) => hay.includes(` ${w} `) || (w.length >= 4 && flat.includes(w));
  const numbers = words.filter((w) => /^\d+$/.test(w));
  if (!numbers.every(present)) return false;
  const found = words.filter(present).length;
  return found / words.length >= 0.6;
}

/**
 * Words that say what a product is rather than which one it is, and so are on its page whatever
 * the model: the words of the shop's own product types, and a few no product is named by.
 */
const COMMON_WORDS = ["black", "white", "colour", "color", "women", "wide", "camber", "rocker", "flat"];
const genericWords = (): Set<string> => new Set([...COMMON_WORDS, ...productTypes().flatMap((t) => slugOf(t).split("-")).flatMap((w) => [w, w.replace(/s$/, "")])]);

/**
 * Whether a page a search found for this product is it, by a looser test than a guessed address
 * gets: the search was for exactly this product, so the page needs only every number in the name
 * and one of the name's own words: the model's name on the brand's page, where the order wrote the
 * rest in shorthand and the shop's title has words the brand's page does not.
 */
export function looselyMatches(pageTitle: string, p: { title: string; vendor: string }): boolean {
  if (pageMatches(pageTitle, p)) return true;
  const brand = new Set(slugOf(p.vendor).split("-").filter(Boolean));
  const words = slugOf(p.title).split("-").filter((w) => w.length >= 2 && !brand.has(w) && !STOP.has(w) && !/^(19|20)\d{2}$/.test(w));
  const hay = ` ${slugOf(pageTitle).replace(/-/g, " ")} `;
  const flat = hay.replace(/\s+/g, "");
  const present = (w: string) => hay.includes(` ${w} `) || (w.length >= 4 && flat.includes(w));
  if (!words.filter((w) => /^\d+$/.test(w)).every(present)) return false;
  const generic = genericWords();
  return words.some((w) => w.length >= 4 && !/^\d+$/.test(w) && !generic.has(w) && !generic.has(w.replace(/s$/, "")) && present(w));
}

/** Ask the light model whether a page is this product's, for a page the word tests cannot settle. */
export async function judgedSame(pageTitle: string, url: string, p: { title: string; vendor: string; modelCode?: string }): Promise<boolean> {
  if (!aiAvailable() || !pageTitle.trim()) return false;
  const ask = [
    "Is this web page the manufacturer's page for this product? A different year, colour, size, gender wording or the brand's own way of naming it does not matter; a different model does. Reply YES or NO only.",
    `Page title: ${pageTitle}`,
    `Page address: ${url}`,
    `Product: ${p.title}${p.vendor ? `, by ${p.vendor}` : ""}${p.modelCode ? `, code ${p.modelCode}` : ""}`,
  ].join("\n");
  try {
    const reply = await anthropicClient(1).messages.create({ model: LIGHT_MODEL, max_tokens: 5, messages: [{ role: "user", content: ask }] });
    const text = reply.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
    return /^\s*yes/i.test(text);
  } catch {
    return false;
  }
}

/** Fetch an address and say whether the page there is this product's. A page that cannot be fetched is not. */
export async function verifyUrl(url: string, p: { title: string; vendor: string }, fetcher: typeof fetch = fetch): Promise<{ ok: boolean; url: string; pageTitle: string }> {
  try {
    const { html, url: finalUrl } = await fetchHtml(url, fetcher);
    const d = distillPage(html, finalUrl);
    const pageTitle = d.structured.name || d.title;
    return { ok: pageMatches(pageTitle, p), url: finalUrl, pageTitle };
  } catch {
    return { ok: false, url, pageTitle: "" };
  }
}

/** Ask the web for the page: one short search by the light model, answering with an address or nothing. */
export async function searchForPage(p: { title: string; vendor: string; modelCode?: string; colours?: string[] }): Promise<SearchAnswer | null> {
  if (!aiAvailable() || !p.title.trim()) return null;
  const colours = (p.colours ?? []).filter(Boolean);
  const ask = [
    `Find the manufacturer's own product page for this product. A supplier's invoice names products in shorthand ("FT" for Family Tree, "M" for men's), so search for the model by its distinctive name. Reply with the page's https address on a line starting PRODUCT:, nothing else; if you cannot find the manufacturer's own page for this model, reply NONE.`,
    colours.length ? `The shop ordered it in: ${colours.join(", ")}. Where the brand's site has a separate page or address for each colour, also give one line per colour ordered, as COLOUR <the colour as written here>: <address>.` : "",
    `Product: ${p.title}`,
    p.vendor ? `Brand: ${p.vendor}` : "",
    p.modelCode ? `Model code: ${p.modelCode}` : "",
    `Prefer the brand's Australian site where it has one.`,
  ].filter(Boolean).join("\n");
  const reply = await retrying(() => anthropicClient(3).messages.stream({
    model: LIGHT_MODEL,
    max_tokens: 1500,
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }],
    messages: [{ role: "user", content: ask }],
  }).finalMessage());
  const text = reply.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
  return parseSearchAnswer(text, colours);
}

/** The addresses in a search's reply: the product's page, and each ordered colour's where given. */
export function parseSearchAnswer(text: string, colours: string[] = []): SearchAnswer | null {
  const urlIn = (line: string) => /https:\/\/[^\s)"'<>]+/i.exec(line)?.[0].replace(/[.,;]+$/, "") ?? null;
  const lines = text.split(/\r?\n/);
  const product = lines.map((l) => (/^\s*product\s*:/i.test(l) ? urlIn(l) : null)).find(Boolean) ?? lines.map(urlIn).find(Boolean) ?? null;
  if (!product) return null;
  const byColour: Record<string, string> = {};
  for (const line of lines) {
    const m = /^\s*colou?r\s+(.+?)\s*:\s*(https:\/\/\S+)/i.exec(line);
    if (!m) continue;
    const said = m[1].trim().toLowerCase();
    const colour = colours.find((c) => c.trim().toLowerCase() === said) ?? m[1].trim();
    byColour[colour] = m[2].replace(/[.,;]+$/, "");
  }
  return { url: product, colours: byColour };
}

interface Target { id: string; batchId: string; handle: string; title: string; vendor: string; modelCode?: string; colours?: string[] }

/** The links already pasted or found, across every batch: the memory the patterns are learned from. */
export async function knownLinks(): Promise<LinkExample[]> {
  const rows = await prisma.product.findMany({
    where: { lookupSource: { not: "" }, lookupStatus: { in: ["LINKED", "RELINKED", "PAGE", "PAGE_UNSURE", "FOUND"] } },
    select: { vendor: true, handle: true, title: true, lookupSource: true },
    orderBy: { updatedAt: "desc" },
    take: 2000,
  });
  return rows.map((r) => ({ vendor: r.vendor, handle: r.handle, title: r.title, url: r.lookupSource }));
}

/**
 * The products in a batch that are asked for a page: new to the shop (unless the batch says all
 * are new), their own model rather than a package of one, and without a link yet.
 */
export async function productsWantingPages(batchId: string, productIds?: string[]): Promise<Target[]> {
  const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: batchId }, select: { directives: true } });
  const products = await prisma.product.findMany({ where: { batchId }, select: { id: true, handle: true, title: true, vendor: true, lookupSource: true, lookupStatus: true, option1Name: true, option2Name: true, option3Name: true, variants: { select: { sku: true, option1Value: true, option2Value: true, option3Value: true }, orderBy: { sortOrder: "asc" } } }, orderBy: { sortOrder: "asc" } });
  const inShop = parseDirectives(batch.directives).allNew
    ? new Set<string>()
    : new Set((await prisma.shopListing.findMany({ where: { handle: { in: products.map((p) => p.handle) } }, select: { handle: true } })).map((l) => l.handle));
  const handles = new Set(products.map((p) => p.handle));
  const wanted = new Set(productIds ?? []);
  return products
    .filter((p) => (productIds ? wanted.has(p.id) : true))
    .filter((p) => !inShop.has(p.handle))
    .filter((p) => flatHandleOf(p.handle) === p.handle || !handles.has(flatHandleOf(p.handle)))
    .filter((p) => productIds || !p.lookupSource.trim() || ["NONE", "FAILED", "NOT_FOUND", "UNSURE"].includes(p.lookupStatus))
    .map((p) => ({ id: p.id, batchId, handle: p.handle, title: p.title, vendor: p.vendor, modelCode: p.variants.map((v) => v.sku).find(Boolean), colours: coloursOf(p) }));
}

/** The colours a product is ordered in: the values of whichever option is the colour. */
function coloursOf(p: { option1Name: string | null; option2Name: string | null; option3Name: string | null; variants: Array<{ option1Value: string | null; option2Value: string | null; option3Value: string | null }> }): string[] {
  const at = [p.option1Name, p.option2Name, p.option3Name].findIndex((n) => /colou?r/i.test(n ?? ""));
  if (at < 0) return [];
  return [...new Set(p.variants.map((v) => ([v.option1Value, v.option2Value, v.option3Value][at] ?? "").trim()).filter(Boolean))].slice(0, 8);
}

/** Find one product's page: the brand's shape first, then a search; each answer fetched and checked before it is kept. */
export async function findPageFor(t: Target, patterns: BrandPattern[], deps: { fetcher?: typeof fetch; search?: Searcher } = {}): Promise<FindResult> {
  const fetcher = deps.fetcher ?? fetch;
  const search = deps.search ?? searchForPage;
  const pattern = patterns.find((x) => x.vendor === vendorKey(t.vendor));
  if (pattern) {
    for (const url of guessUrls(pattern, t)) {
      const v = await verifyUrl(url, t, fetcher);
      if (v.ok) return { productId: t.id, url: v.url, how: "pattern", said: `Found at ${new URL(v.url).hostname}, where ${t.vendor}'s pages were before.` };
    }
  }
  let answer: SearchAnswer | null = null;
  try {
    const got = await search(t);
    answer = typeof got === "string" ? { url: got, colours: {} } : got;
  } catch { answer = null; }
  const candidate = answer?.url ?? null;
  if (candidate) {
    const v = await verifyUrl(candidate, t, fetcher);
    // The search was for exactly this product: a page with its own words and numbers on it is it,
    // and one the words cannot settle is put to the model before it is turned away.
    const same = v.ok || (v.pageTitle !== "" && (looselyMatches(v.pageTitle, t) || await judgedSame(v.pageTitle, v.url, t)));
    if (same) {
      const colourLinks: Record<string, string> = {};
      for (const [colour, url] of Object.entries(answer?.colours ?? {})) {
        if (url === candidate || url === v.url) continue;
        const c = await verifyUrl(url, t, fetcher);
        if (c.ok || (c.pageTitle !== "" && looselyMatches(c.pageTitle, t))) colourLinks[colour] = c.url;
      }
      const each = Object.keys(colourLinks).length;
      return { productId: t.id, url: v.url, how: "search", said: `Found by search at ${new URL(v.url).hostname}${each ? `, with a page of its own for ${each === 1 ? Object.keys(colourLinks)[0] : `${each} colours`}` : ""}.`, ...(each ? { colourLinks } : {}) };
    }
    return { productId: t.id, url: "", how: "none", said: v.pageTitle ? `A search turned up "${v.pageTitle}", which does not look like this product, so it was not kept. Paste the page if you know it.` : "The page a search turned up could not be read. Paste the page if you know it." };
  }
  return { productId: t.id, url: "", how: "none", said: pattern ? `Not at ${t.vendor}'s usual address, and a search found nothing sure. Paste the page if you know it.` : "No page found. Paste it if you know it." };
}

/** Find the pages for a batch's new products, and save each one found as the product's link. */
export async function findProductPages(batchId: string, opts: { productIds?: string[]; userId?: string | null; budgetMs?: number; fetcher?: typeof fetch; search?: Searcher } = {}): Promise<FindOutcome> {
  const [targets, examples] = await Promise.all([productsWantingPages(batchId, opts.productIds), knownLinks()]);
  const patterns = learnPatterns(examples);
  const out: FindOutcome = { ...EMPTY, results: [] };
  if (targets.length === 0) return out;
  const deadline = Date.now() + (opts.budgetMs ?? FIND_BUDGET_MS);
  let next = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, targets.length) }, async () => {
    for (let i = next++; i < targets.length; i = next++) {
      if (Date.now() >= deadline) { out.capped = true; return; }
      const r = await findPageFor(targets[i], patterns, { fetcher: opts.fetcher, search: opts.search });
      out.attempted++;
      if (r.how !== "none") {
        out.found++;
        if (r.how === "pattern") out.byPattern++; else out.bySearch++;
        await setProductLink(r.productId, r.url);
        // Each colour's own page, kept the way a person's pasted one is (see setColourLink).
        for (const [colour, url] of Object.entries(r.colourLinks ?? {})) await setColourLink(r.productId, colour, url);
      }
      out.results.push(r);
    }
  });
  await Promise.all(workers);
  await logAudit("batch.pages_found", { batchId, userId: opts.userId ?? null, details: { attempted: out.attempted, found: out.found, byPattern: out.byPattern, bySearch: out.bySearch, capped: out.capped } });
  return out;
}
