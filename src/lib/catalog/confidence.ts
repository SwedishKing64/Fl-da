/**
 * One confidence score per field, worked out from where each value came from.
 *
 * A cost or a quantity is right or wrong against a number on the invoice. A title, a tag, a
 * picture or a price is a judgement, and a judgement can be more or less well founded: a title
 * whose every word appears on the paperwork is on firmer ground than one a reader composed; a
 * tag the shop already uses is safer than one nobody has seen; a picture that was looked at
 * against the ordered colour is safer than one taken on trust. The score says how well founded
 * each is, and the lowest of the four is the product's. Above the bar a product needs nobody's
 * eyes; below it, the one field that pulled it down is what a person is shown.
 *
 * Pure: the review loads what it knows about each product and hands it in. Nothing here decides
 * anything on its own; it only says how sure the system is, so the screen and, later, the push
 * can act on that instead of always stopping for a person.
 */

export type ConfidenceField = "title" | "tags" | "image" | "price";

export interface Confidence {
  title: number;
  tags: number;
  image: number;
  price: number;
  /** The product's score: the lowest of the four. */
  product: number;
  /** The field that pulled the product down, when one did. */
  weakest: ConfidenceField | null;
  /** One plain sentence per field that is under the bar, pointed at what to look at. */
  reasons: Partial<Record<ConfidenceField, string>>;
}

/** Above this a field needs nobody's eyes. */
export const BAR = 80;

export interface ConfidenceInput {
  title: string;
  vendor: string;
  /** Whether the Type is one of the shop's own kinds (or the shop has no kinds yet, so any is fine). */
  typeKnown: boolean;
  tags: string[];
  /** Whether a tag is one the shop uses: its listings, its rules, its vocabulary, or one it approved. */
  tagKnown: (tag: string) => boolean;
  /** The text of the order lines the product came from, so a title's words can be checked against it. */
  sourceText: string;
  /** Fields a person set by hand on the grid: those are right by definition. */
  touched: ReadonlySet<string>;
  images: Array<{ source: string; validated: boolean }>;
  /** How the retail price was arrived at. */
  retail: { value: number; from: "person" | "paperwork" | "lookup" | "rule" | "none"; belowCost: boolean; underFloor: boolean };
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** The words of a title worth checking against the paperwork: not the brand, not a year, not a stopword, not a bare size. */
export function titleWords(title: string, vendor: string): string[] {
  const brand = new Set(vendor.toLowerCase().split(/\s+/).filter(Boolean));
  return title
    .toLowerCase()
    .split(/[^a-z0-9'+.-]+/)
    .map((w) => w.replace(/^[.'-]+|[.'-]+$/g, ""))
    .filter((w) => w.length >= 2 && !/^(19|20)\d{2}$/.test(w) && !brand.has(w) && !STOP.has(w) && !/^\d+(\.\d+)?(cm|mm|m|l|ml|g|kg)?$/.test(w));
}

const STOP = new Set(["the", "and", "with", "for", "of", "a", "an", "in", "on", "to", "inc", "mens", "womens", "kids", "men's", "women's", "unisex", "junior", "youth", "pack", "package"]);

/** The share of a title's words that appear in the paperwork, loosely (case, spacing and punctuation set aside). */
export function titleSupport(title: string, vendor: string, sourceText: string): number {
  const words = titleWords(title, vendor);
  if (words.length === 0) return 1;
  const hay = sourceText.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  const flat = hay.replace(/\s+/g, "");
  let found = 0;
  for (const w of words) {
    const bare = w.replace(/[^a-z0-9]+/g, "");
    if (!bare) { found++; continue; }
    if (hay.includes(bare) || flat.includes(bare)) found++;
  }
  return found / words.length;
}

export function scoreProduct(input: ConfidenceInput): Confidence {
  const reasons: Confidence["reasons"] = {};

  // Title: every word on the paperwork, a known brand, a known kind.
  let title = 100;
  if (!input.title.trim()) { title = 0; reasons.title = "No title."; }
  else if (input.touched.has("title")) title = 100;
  else {
    const support = titleSupport(input.title, input.vendor, input.sourceText);
    const words = titleWords(input.title, input.vendor);
    if (input.sourceText.trim() && words.length > 0) {
      if (support < 0.5) { title = 45; reasons.title = "Less than half of the title's words are on the paperwork: check the name against the invoice."; }
      else if (support < 0.85) { title = 70; reasons.title = "Some of the title's words are not on the paperwork: check the name against the invoice."; }
    }
    if (!input.vendor.trim()) { title = Math.min(title, 55); reasons.title = reasons.title ?? "No brand: the title and the SEO title cannot carry one."; }
    if (!input.typeKnown) { title = Math.min(title, 60); reasons.title = reasons.title ?? "The Type is not one of your kinds of product: pick one from the list."; }
  }

  // Tags: all from the shop's own vocabulary.
  let tags = 95;
  if (input.touched.has("tags")) tags = 100;
  else if (input.tags.length === 0) { tags = 30; reasons.tags = "No tags: nothing files it on the website."; }
  else {
    const unknown = input.tags.filter((t) => !input.tagKnown(t));
    if (unknown.length) { tags = 40; reasons.tags = `${unknown.length === 1 ? "A tag" : `${unknown.length} tags`} your shop has never used: ${unknown.slice(0, 3).join(", ")}${unknown.length > 3 ? ", …" : ""}.`; }
    if (!input.typeKnown) { tags = Math.min(tags, 50); reasons.tags = reasons.tags ?? "The Type is not one of your kinds of product, so its shelf tags are a guess."; }
  }

  // Image: looked at against the colour, or at least a real address; none at all is the floor.
  let image = 0;
  if (input.images.length === 0) { image = 0; reasons.image = "No picture: paste the product's page or drop one in."; }
  else {
    const verified = input.images.filter((i) => i.validated || i.source === "MANUAL" || i.source === "LIBRARY").length;
    image = verified === input.images.length ? 95 : verified > 0 ? 75 : 60;
    if (image < BAR) reasons.image = "The pictures were taken from the brand's site without being checked against the colour ordered: glance at them.";
  }

  // Price: where the retail came from, and whether it makes sense against the cost.
  let price = 0;
  const r = input.retail;
  if (r.from === "person") price = 100;
  else if (r.from === "paperwork") price = 90;
  else if (r.from === "rule") price = 85;
  else if (r.from === "lookup") { price = 70; reasons.price = "The retail came from the brand's website, not your paperwork: check it is this season's."; }
  else { price = 0; reasons.price = "No retail price: the column would go out empty."; }
  if (r.value > 0 && r.belowCost) { price = Math.min(price, 10); reasons.price = "The retail is under the landed cost: a cost in the price column?"; }
  else if (r.value > 0 && r.underFloor) { price = Math.min(price, 55); reasons.price = reasons.price ?? "The margin is under your floor."; }

  const scores = { title: clamp(title), tags: clamp(tags), image: clamp(image), price: clamp(price) };
  const order: ConfidenceField[] = ["title", "tags", "image", "price"];
  let weakest: ConfidenceField | null = null;
  let product = 100;
  for (const f of order) {
    if (scores[f] < product) { product = scores[f]; weakest = f; }
  }
  if (product >= BAR) weakest = null;
  // Only what is under the bar is worth a sentence.
  for (const f of order) if (scores[f] >= BAR) delete reasons[f];
  return { ...scores, product, weakest, reasons };
}

/** The one line a person reads about a product under the bar. */
export function describeConfidence(c: Confidence): string {
  if (c.product >= BAR) return "Ready.";
  const f = c.weakest ?? "title";
  return c.reasons[f] ?? "Needs a look.";
}

/** How many of a batch's products need nobody's eyes, and how many need a look. */
export function tallyConfidence(products: Array<{ confidence: Confidence }>): { ready: number; needLook: number } {
  let ready = 0;
  for (const p of products) if (p.confidence.product >= BAR) ready++;
  return { ready, needLook: products.length - ready };
}

/** A product nothing has been worked out for yet: the offline build and tests, where no sources are known. */
export function unscored(): Confidence {
  return { title: 100, tags: 100, image: 100, price: 100, product: 100, weakest: null, reasons: {} };
}
