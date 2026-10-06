/**
 * Reading one product's own web page: its description, its details, its photographs.
 *
 * The web lookup searches for a product and takes what it finds. This is for when somebody already
 * knows the page — a link pasted beside the product's name — so there is nothing to search for and
 * nothing to get wrong about which product it is. The page is fetched here, boiled down to its
 * text, its structured data and a numbered list of its pictures, and the model reads that and says
 * which parts are the description, which are the details and which pictures are the product's own.
 * It never writes a URL: it picks pictures by number from the list, so nothing it says can be a
 * picture the page did not have.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { EXTRACTION_MODEL, aiAvailable } from "./ai";
import { retrying } from "../api-errors";
import { cleanProductUrl, type PageDetails } from "../page-types";

const MAX_BYTES = 3 * 1024 * 1024;
const MAX_TEXT = 28_000;
const MAX_IMAGES = 40;
const BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// ---------------------------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------------------------

/** A page that could not be read, with what to tell the person about it. */
export class PageError extends Error {}

/**
 * The page's HTML, following redirects by hand so that every hop is checked: a brand's site
 * redirecting to an internal address is an attack, not a product page.
 */
export async function fetchHtml(link: string, fetcher: typeof fetch = fetch): Promise<{ html: string; url: string }> {
  let current = link;
  for (let hop = 0; hop < 5; hop++) {
    const checked = cleanProductUrl(current);
    if ("error" in checked) throw new PageError(checked.error || "No link.");
    let res: Response;
    try {
      res = await fetcher(checked.url, {
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
        headers: { "user-agent": BROWSER, accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", "accept-language": "en-AU,en;q=0.9" },
      });
    } catch (err) {
      throw new PageError(err instanceof Error && /timeout|abort/i.test(err.name + err.message) ? "The site took too long to answer." : "The site could not be reached.");
    }
    if (res.status >= 300 && res.status < 400) {
      const to = res.headers.get("location");
      if (!to) throw new PageError("The site redirected to nowhere.");
      current = new URL(to, checked.url).toString();
      continue;
    }
    if (res.status === 403 || res.status === 429 || res.status === 503) throw new PageError(`The site refused an automated visit (${res.status}). Paste the description in by hand, or try another page.`);
    if (res.status === 404 || res.status === 410) throw new PageError("That page does not exist (404) — check the link.");
    if (!res.ok) throw new PageError(`The site answered ${res.status}.`);
    const type = res.headers.get("content-type") ?? "";
    if (type && !/html|xml|text/i.test(type)) throw new PageError("That link is not a web page.");
    const html = await readCapped(res);
    return { html, url: checked.url };
  }
  throw new PageError("The link redirects too many times.");
}

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return (await res.text()).slice(0, MAX_BYTES);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
    if (size > MAX_BYTES) { await reader.cancel().catch(() => undefined); break; }
  }
  return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
}

// ---------------------------------------------------------------------------------------------
// Boiling a page down
// ---------------------------------------------------------------------------------------------

export interface Candidate { url: string; alt: string }

export interface Distilled {
  url: string;
  title: string;
  metaDescription: string;
  /** What the page declares about itself as a Product, if it does. */
  structured: { name: string; description: string; brand: string; images: string[] };
  /** The page's visible text, headings and lists kept as lines. */
  text: string;
  images: Candidate[];
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", reg: "®", trade: "™", deg: "°", times: "×", hellip: "…" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const attr = (tag: string, name: string): string => {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return decodeEntities(m ? (m[2] ?? m[3] ?? m[4] ?? "") : "").trim();
};

const resolve = (raw: string, base: string): string | null => {
  const t = raw.trim();
  if (!t || t.startsWith("data:") || t.startsWith("blob:") || t.startsWith("javascript:")) return null;
  try {
    const u = new URL(t.startsWith("//") ? `https:${t}` : t, base);
    if (u.protocol === "http:") u.protocol = "https:";
    return u.protocol === "https:" ? u.toString() : null;
  } catch { return null; }
};

/** The widest picture a srcset offers. */
function largestOfSrcset(srcset: string): string {
  let best = "", width = -1;
  for (const part of srcset.split(",")) {
    const [url, size] = part.trim().split(/\s+/);
    if (!url) continue;
    const w = size ? parseFloat(size) : 0;
    if (w >= width) { best = url; width = w; }
  }
  return best;
}

const NOT_A_PRODUCT_PICTURE = /logo|icon|sprite|pixel|tracking|badge|flag|avatar|placeholder|loading|blank|payment|social|facebook|instagram|twitter|youtube|arrow|star-|rating|spinner|banner|swatch-|thumb-mini|favicon|\bgif\b|\.svg(\?|$)|\.gif(\?|$)/i;

function structuredProduct(html: string, base: string): Distilled["structured"] {
  const out = { name: "", description: "", brand: "", images: [] as string[] };
  const nodes: unknown[] = [];
  const walk = (n: unknown) => {
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n && typeof n === "object") {
      nodes.push(n);
      const g = (n as Record<string, unknown>)["@graph"];
      if (g) walk(g);
    }
  };
  for (const m of html.matchAll(/<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(m[1].trim())); } catch { /* a page's broken structured data is not this page's fault */ }
  }
  for (const n of nodes as Array<Record<string, unknown>>) {
    const type = ([] as unknown[]).concat(n["@type"] ?? []).map(String).join(" ");
    if (!/product/i.test(type)) continue;
    if (!out.name && typeof n.name === "string") out.name = decodeEntities(n.name).trim();
    if (!out.description && typeof n.description === "string") out.description = decodeEntities(n.description.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    const brand = n.brand;
    if (!out.brand) out.brand = typeof brand === "string" ? brand : brand && typeof brand === "object" ? String((brand as Record<string, unknown>).name ?? "") : "";
    for (const img of ([] as unknown[]).concat(n.image ?? [])) {
      const raw = typeof img === "string" ? img : img && typeof img === "object" ? String((img as Record<string, unknown>).url ?? "") : "";
      const url = resolve(raw, base);
      if (url && !out.images.includes(url)) out.images.push(url);
    }
  }
  return out;
}

/**
 * The page as the model reads it. Pure: HTML in, a bounded summary out.
 *
 * Scripts, styles, navigation, footers and forms are dropped; headings, list items and table rows
 * are kept as lines, because a "Details" or "Technical specifications" section is exactly a list or
 * a table and its labels have to stay beside its values.
 */
export function distillPage(html: string, url: string): Distilled {
  const meta = (name: string): string => {
    for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
      const key = attr(m[0], "property") || attr(m[0], "name");
      if (key.toLowerCase() === name) return attr(m[0], "content");
    }
    return "";
  };
  const title = decodeEntities((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").replace(/\s+/g, " ")).trim();
  const structured = structuredProduct(html, url);

  // Pictures, in the order the page offers them, with the page's own claims first.
  const found: Candidate[] = [];
  const seen = new Set<string>();
  const add = (raw: string, alt = "") => {
    const u = resolve(raw, url);
    if (!u) return;
    const key = u.replace(/\?.*$/, "");
    if (seen.has(key)) return;
    if (NOT_A_PRODUCT_PICTURE.test(u) || NOT_A_PRODUCT_PICTURE.test(alt)) return;
    seen.add(key);
    found.push({ url: u, alt: decodeEntities(alt).replace(/\s+/g, " ").trim().slice(0, 100) });
  };
  for (const u of structured.images) add(u, "declared by the page");
  add(meta("og:image"), "declared by the page");
  add(meta("twitter:image"), "declared by the page");
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const w = parseInt(attr(tag, "width"), 10), h = parseInt(attr(tag, "height"), 10);
    if ((Number.isFinite(w) && w > 0 && w < 120) || (Number.isFinite(h) && h > 0 && h < 120)) continue;
    const src = largestOfSrcset(attr(tag, "srcset") || attr(tag, "data-srcset")) || attr(tag, "data-src") || attr(tag, "data-lazy-src") || attr(tag, "data-original") || attr(tag, "src");
    add(src, attr(tag, "alt"));
  }
  for (const m of html.matchAll(/<source\b[^>]*>/gi)) add(largestOfSrcset(attr(m[0], "srcset")));
  for (const m of html.matchAll(/<a\b[^>]*\shref\s*=\s*["']([^"']+\.(?:jpe?g|png|webp)(?:\?[^"']*)?)["']/gi)) add(m[1]);

  // Text.
  let body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|form|select|button|nav|footer|aside|head)\b[\s\S]*?<\/\1>/gi, " ");
  body = body
    .replace(/<h([1-6])\b[^>]*>/gi, "\n\n## ")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/(tr)>/gi, "\n")
    .replace(/<\/(td|th|dt)>/gi, " | ")
    .replace(/<dd\b[^>]*>/gi, " ")
    .replace(/<\/?(p|div|section|article|ul|ol|table|tbody|thead|dl|br|hr|figure|figcaption|main|details|summary)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const lines: string[] = [];
  for (const raw of decodeEntities(body).split("\n")) {
    const line = raw.replace(/[ \t ]+/g, " ").replace(/(\s\|)+\s*$/, "").trim();
    if (!line || line === "-" || line === "|") continue;
    if (lines[lines.length - 1] === line) continue;
    lines.push(line);
  }
  let text = lines.join("\n");
  if (text.length > MAX_TEXT) text = text.slice(0, MAX_TEXT) + "\n…";

  return {
    url,
    title,
    metaDescription: meta("og:description") || meta("description"),
    structured,
    text,
    images: found.slice(0, MAX_IMAGES),
  };
}

// ---------------------------------------------------------------------------------------------
// Reading it
// ---------------------------------------------------------------------------------------------

const ReadSchema = z.object({
  confident: z.boolean().describe("True only when this page is for the product asked about: the same model, and the same season where the page says. False for a category or search page, a different model, a different year, or a page with no product on it."),
  pageTitle: z.string().describe("The product's name as this page gives it."),
  description: z.string().describe("The manufacturer's own description, in their words, as the page writes it — the opening copy, not the legal text or the delivery information. Up to about 140 words; a blank line between paragraphs. Empty if the page has none."),
  features: z.array(z.string()).describe("Every line of the page's own details / technical specifications / features section, each as the page writes it: \"Label: value\" where the page pairs a label with a value, a bare phrase where it does not. Up to 30. Empty if the page has none. Never compose a line the page does not carry."),
  imageNumbers: z.array(z.number()).describe("The numbers, from the list of pictures, of the pictures of THIS product itself, in the order the shop shows them: first the product on its own (the goggle alone, the boot alone, the jacket alone — front view), then its other angles, then shots that include anything bundled with it such as a face mask, a spare lens or a bag, then other colours. Not related products, logos, banners, lifestyle thumbnails of other items, size charts or icons. At most 10. Empty if none are the product."),
  note: z.string().describe("One short sentence for the person: what the page gave and what it did not."),
});

const SYSTEM = `You read one product's web page for a ski and snowboard retailer in Australia who is building a Shopify listing, and report what the page says about the product.

You are given the product the retailer ordered, then the page: its title, what it declares about itself, its visible text with headings and lists kept as lines, and a numbered list of the pictures on it.

Report only what the page carries. Quote the manufacturer's wording; do not paraphrase it and do not write marketing copy of your own. If the fetched page shows addresses of the product's own pictures (links ending .jpg, .jpeg, .png or .webp that are photographs of this product, not icons, logos or other products), list them at the end under the heading "Pictures:", one per line, exactly as written. The details section is often headed "Details", "Specs", "Technical specifications", "Features" or "Product information" — take its lines exactly as written, keeping each label with its value. Choose pictures by number from the list given and from nothing else.

If the page is not for this product, say so with confident false and report nothing from it that you would not stand behind.`;

let client: Anthropic | null = null;
const getClient = (): Anthropic => (client ??= new Anthropic({ maxRetries: 6 }));

export type AskPage = (system: string, content: string) => Promise<string | undefined>;
const askModel: AskPage = async (system, content) => {
  const response = await retrying(() => getClient().messages.stream({
    model: EXTRACTION_MODEL,
    max_tokens: 5000,
    system,
    output_config: { format: zodOutputFormat(ReadSchema), effort: "low" },
    messages: [{ role: "user", content }],
  }).finalMessage());
  return response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
};

export interface PageHint { title: string; brand?: string; modelCode?: string }

const describeHint = (hint: PageHint): string => [
  `Product ordered: ${hint.title}`,
  hint.brand ? `Brand: ${hint.brand}` : "",
  hint.modelCode ? `Model code: ${hint.modelCode}` : "",
].filter(Boolean).join("\n");

/** What the page declares about itself, with no model reading it: for when there is no API key, or it failed. */
export function basicDetails(d: Distilled, note = ""): PageDetails {
  const description = d.structured.description || d.metaDescription;
  const images = (d.structured.images.length > 0 ? d.structured.images : d.images.slice(0, 1).map((c) => c.url)).slice(0, 10);
  return {
    description,
    features: [],
    images,
    pageTitle: d.structured.name || d.title,
    confident: Boolean(d.structured.name),
    sourceUrl: d.url,
    via: "basic",
    note: note || (description ? "Took the description and picture the page declares; the details list needs the API key." : "The page declares no description."),
  };
}

export async function extractFromPage(d: Distilled, hint: PageHint, ask: AskPage = askModel): Promise<PageDetails> {
  const content = [
    describeHint(hint),
    "",
    `Page: ${d.url}`,
    `Title: ${d.title}`,
    d.metaDescription ? `Meta description: ${d.metaDescription}` : "",
    d.structured.name ? `Declared as a product: ${d.structured.name}${d.structured.brand ? ` by ${d.structured.brand}` : ""}` : "",
    d.structured.description ? `Declared description: ${d.structured.description}` : "",
    "",
    "Visible text:",
    d.text || "(the page has no text in it)",
    "",
    "Pictures:",
    ...d.images.map((c, i) => `${i + 1}. ${c.url}${c.alt ? `  — ${c.alt}` : ""}`),
  ].filter((l) => l !== "").join("\n");

  const text = await ask(SYSTEM, content);
  if (!text) return basicDetails(d, "The page could not be read by the model, so only what it declares about itself was taken.");
  const parsed = ReadSchema.safeParse(JSON.parse(text));
  if (!parsed.success) return basicDetails(d, "The model's reading of the page could not be used, so only what it declares about itself was taken.");
  const r = parsed.data;
  // Only pictures the page had, once each, in the order chosen.
  const images: string[] = [];
  for (const n of r.imageNumbers) {
    const c = d.images[Math.round(n) - 1];
    if (c && !images.includes(c.url)) images.push(c.url);
  }
  return {
    description: r.description.trim(),
    features: r.features.map((f) => f.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 30),
    images: images.slice(0, 10),
    pageTitle: r.pageTitle.trim() || d.structured.name || d.title,
    confident: r.confident,
    sourceUrl: d.url,
    via: "ai",
    note: r.note.trim(),
  };
}

/**
 * The page read through the model's own web fetch, for a page this server cannot get.
 *
 * Plenty of brands' sites turn away a request from a hosting provider (403) or only build their
 * page in a browser. The API's fetch tool visits from Anthropic's side, which some of them let
 * through. It returns the page's words and not its picture list, so what comes back is the
 * description and the details; the pictures have to be added in the grid.
 */
const FETCH_SYSTEM = `You read one product's web page for a ski and snowboard retailer in Australia who is building a Shopify listing. Fetch the page you are given and report what it says about the product.

Quote the manufacturer's wording; do not paraphrase it and do not write marketing copy of your own. The details section is often headed "Details", "Specs", "Technical specifications", "Features" or "Product information": report its lines exactly as written, keeping each label with its value. Say plainly if the page could not be fetched, if it is not for this product, or if it is a different model year.`;

const FetchedSchema = ReadSchema.omit({ imageNumbers: true });

export async function readViaModelFetch(link: string, hint: PageHint): Promise<PageDetails | null> {
  if (!aiAvailable()) return null;
  const research = await retrying(() => getClient().messages.stream({
    model: EXTRACTION_MODEL,
    max_tokens: 8000,
    system: FETCH_SYSTEM,
    thinking: { type: "adaptive" },
    output_config: { effort: "low" },
    tools: [{ type: "web_fetch_20260209", name: "web_fetch", max_uses: 2 }],
    messages: [{ role: "user", content: `${describeHint(hint)}\n\nThe product's page: ${link}` }],
  }).finalMessage());
  const notes = research.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
  if (!notes) return null;
  const shaped = await retrying(() => getClient().messages.stream({
    model: EXTRACTION_MODEL,
    max_tokens: 4000,
    system: "Turn the notes into fields. Copy what the notes establish and leave everything else empty — never fill a gap with something plausible. Keep the manufacturer's wording.",
    output_config: { format: zodOutputFormat(FetchedSchema), effort: "low" },
    messages: [{ role: "user", content: `${describeHint(hint)}\n\nNotes on the page ${link}:\n${notes}` }],
  }).finalMessage());
  const text = shaped.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
  if (!text) return null;
  const parsed = FetchedSchema.safeParse(JSON.parse(text));
  if (!parsed.success || (!parsed.data.description.trim() && parsed.data.features.length === 0)) return null;
  const r = parsed.data;
  // Whatever picture addresses the fetched page showed: usually none, since the fetch returns the
  // page's words, but a page that lists them in its text gives the pictures too.
  const pictures = [...new Set((notes.split(/\bPictures:\s*/i)[1] ?? "").match(/https?:\/\/[^\s)"'<>]+\.(?:jpe?g|png|webp)(?:\?[^\s)"'<>]*)?/gi) ?? [])].slice(0, 10);
  return {
    description: r.description.trim(),
    features: r.features.map((f) => f.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 30),
    images: pictures,
    pageTitle: r.pageTitle.trim(),
    confident: r.confident,
    sourceUrl: link,
    via: "ai",
    note: pictures.length > 0
      ? "The site would not show its page to this server, so it was read through the API instead."
      : "The site would not show its page to this server, so it was read through the API instead; that gives the description and details but not the pictures.",
  };
}

/** Fetch a product's page and read it. Throws PageError, with something fit to show, when it cannot. */
export async function readProductPage(link: string, hint: PageHint, deps: { fetcher?: typeof fetch; ask?: AskPage; viaModel?: typeof readViaModelFetch } = {}): Promise<PageDetails> {
  const viaModel = deps.viaModel ?? readViaModelFetch;
  // A page this server cannot get is tried once more through the API's own fetch, if there is one.
  const fallback = async (why: PageError): Promise<PageDetails> => {
    if (/not a public website|does not exist|not a web page|not a web address/i.test(why.message)) throw why;
    if (!aiAvailable() && !deps.viaModel) throw why;
    const found = await viaModel(link, hint).catch(() => null);
    if (found) return found;
    throw why;
  };
  let fetched: { html: string; url: string };
  try {
    fetched = await fetchHtml(link, deps.fetcher);
  } catch (err) {
    if (err instanceof PageError) return fallback(err);
    throw err;
  }
  const d = distillPage(fetched.html, fetched.url);
  // A page that only builds itself in the browser comes back as an empty shell.
  if (d.text.replace(/\s+/g, " ").length < 200 && !d.structured.name && !d.metaDescription) {
    return fallback(new PageError("The page has almost nothing in it until a browser runs it, so it cannot be read this way. Try the brand's own product page, or paste the description in by hand."));
  }
  if (!aiAvailable() && !deps.ask) return basicDetails(d);
  try {
    return await extractFromPage(d, hint, deps.ask);
  } catch {
    return basicDetails(d, "The model could not read the page just now, so only what the page declares about itself was taken.");
  }
}
