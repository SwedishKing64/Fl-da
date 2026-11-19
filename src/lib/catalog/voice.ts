/**
 * The shop's voice: how it writes, in its own words and by its own example.
 *
 * A tone string and a title pattern cannot hold a shop's voice. What can: the words it uses and
 * never uses, how it spells things, who it is writing for, a few of its own listings as the shape
 * to match (per product type, where the shop picks per type), the sections that are the shop's
 * rather than the product's ("Fitted in store", "Our warranty"), and what it says about each brand
 * (fit, care, where it is made). All of it is the shop's and lives in its copy; the writer gets it
 * on every call, the build applies the spellings and the sections, and Teach Snaben shows each
 * piece as a sentence.
 *
 * Pure: the voice is handed in. shop-profile.ts keeps it under VOICE_KEY and puts it in force.
 */

export interface Exemplar {
  title: string;
  /** The listing's copy, HTML or plain. */
  body: string;
  productType: string;
  vendor: string;
}

/** A section the shop adds to every listing it applies to, written once. Empty `types` and `brands` mean every product. */
export interface ShopSection {
  heading: string;
  text: string;
  types: string[];
  brands: string[];
}

export interface BrandNote {
  brand: string;
  fit: string;
  care: string;
  origin: string;
}

/** A word the shop writes one way: "color" → "colour". `brand` empty for every brand. */
export interface Spelling {
  from: string;
  to: string;
  brand: string;
}

/** A tag never written on a brand's products, or on any when `brand` is empty. */
export interface NeverTag {
  tag: string;
  brand: string;
}

export interface Voice {
  /** Who the shop writes for, in a sentence: "weekend families from Canberra". */
  audience: string;
  /** Words the shop uses. */
  use: string[];
  /** Words the shop never uses. */
  avoid: string[];
  spellings: Spelling[];
  exemplars: Exemplar[];
  sections: ShopSection[];
  brandNotes: BrandNote[];
  neverTags: NeverTag[];
}

export const VOICE_KEY = "shop.voice";
export const MAX_EXEMPLARS = 10;
const MAX_LIST = 200;

export const DEFAULT_VOICE: Voice = { audience: "", use: [], avoid: [], spellings: [], exemplars: [], sections: [], brandNotes: [], neverTags: [] };

const str = (v: unknown, max: number) => String(v ?? "").slice(0, max).trim();
const words = (v: unknown, max = MAX_LIST): string[] => {
  const list = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,\n]/) : [];
  const out: string[] = [];
  for (const w of list) {
    const s = str(w, 80);
    if (s && !out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s);
    if (out.length >= max) break;
  }
  return out;
};
const rows = <T>(v: unknown, max: number, clean: (x: Record<string, unknown>) => T | null): T[] => {
  if (!Array.isArray(v)) return [];
  const out: T[] = [];
  for (const x of v) {
    if (!x || typeof x !== "object") continue;
    const c = clean(x as Record<string, unknown>);
    if (c) out.push(c);
    if (out.length >= max) break;
  }
  return out;
};

/** A voice as saved, made safe; anything missing is empty. */
export function cleanVoice(input: unknown): Voice {
  const v = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return {
    audience: str(v.audience, 400),
    use: words(v.use),
    avoid: words(v.avoid),
    spellings: rows(v.spellings, MAX_LIST, (s) => {
      const from = str(s.from, 80);
      const to = str(s.to, 80);
      return from && to && from.toLowerCase() !== to.toLowerCase() ? { from, to, brand: str(s.brand, 80) } : null;
    }),
    exemplars: rows(v.exemplars, MAX_EXEMPLARS, (e) => {
      const title = str(e.title, 200);
      const body = String(e.body ?? "").slice(0, 6000).trim();
      return title || body ? { title, body, productType: str(e.productType, 120), vendor: str(e.vendor, 120) } : null;
    }),
    sections: rows(v.sections, 40, (s) => {
      const heading = str(s.heading, 80);
      const text = String(s.text ?? "").slice(0, 2000).trim();
      return heading && text ? { heading, text, types: words(s.types, 50), brands: words(s.brands, 50) } : null;
    }),
    brandNotes: rows(v.brandNotes, MAX_LIST, (b) => {
      const brand = str(b.brand, 80);
      const note = { brand, fit: str(b.fit, 400), care: str(b.care, 400), origin: str(b.origin, 400) };
      return brand && (note.fit || note.care || note.origin) ? note : null;
    }),
    neverTags: rows(v.neverTags, MAX_LIST, (t) => {
      const tag = str(t.tag, 80);
      return tag ? { tag, brand: str(t.brand, 80) } : null;
    }),
  };
}

/** Whether the shop has said anything about its voice at all. */
export function voiceTaught(voice: Voice): boolean {
  return Boolean(voice.audience) || voice.use.length + voice.avoid.length + voice.spellings.length + voice.exemplars.length + voice.sections.length + voice.brandNotes.length + voice.neverTags.length > 0;
}

// ---------------------------------------------------------------------------------------------
// In force
// ---------------------------------------------------------------------------------------------

let active: Voice = DEFAULT_VOICE;

/** Put the shop's voice in force for this process. Called when the shop's conventions load. */
export function setVoice(voice: Voice): void {
  active = voice;
}

export function voiceInForce(): Voice {
  return active;
}

// ---------------------------------------------------------------------------------------------
// What applies to one product
// ---------------------------------------------------------------------------------------------

export interface VoiceTarget { vendor?: string; productType?: string }

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const forBrand = (brand: string, vendor = "") => !brand || same(brand, vendor);
const forTarget = (s: ShopSection, t: VoiceTarget) => (s.types.length === 0 || s.types.some((x) => same(x, t.productType ?? ""))) && (s.brands.length === 0 || s.brands.some((x) => same(x, t.vendor ?? "")));

export function spellingsFor(voice: Voice, vendor = ""): Spelling[] {
  return voice.spellings.filter((s) => forBrand(s.brand, vendor));
}

export function sectionsFor(voice: Voice, target: VoiceTarget): ShopSection[] {
  return voice.sections.filter((s) => forTarget(s, target));
}

export function brandNoteFor(voice: Voice, vendor = ""): BrandNote | null {
  return voice.brandNotes.find((b) => same(b.brand, vendor)) ?? null;
}

/**
 * The shop's own listings closest to this product, as the voice to match: the same type first,
 * then the same brand, then any, up to `max`.
 */
export function exemplarsFor(voice: Voice, target: VoiceTarget, max = 3): Exemplar[] {
  const score = (e: Exemplar) => (e.productType && same(e.productType, target.productType ?? "") ? 2 : 0) + (e.vendor && same(e.vendor, target.vendor ?? "") ? 1 : 0);
  return [...voice.exemplars].map((e, i) => ({ e, i, s: score(e) })).sort((a, b) => b.s - a.s || a.i - b.i).slice(0, max).map((x) => x.e);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A word written the shop's way, whole words only, keeping a capital where the original had one. */
export function applySpellings(text: string, voice: Voice, vendor = ""): string {
  let out = text;
  for (const s of spellingsFor(voice, vendor)) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(s.from)}(?![\\p{L}\\p{N}])`, "giu");
    out = out.replace(re, (hit) => (hit[0] === hit[0].toUpperCase() && hit[0] !== hit[0].toLowerCase() && s.to[0] === s.to[0].toLowerCase() ? s.to[0].toUpperCase() + s.to.slice(1) : s.to));
  }
  return out;
}

export function withoutNeverTags(tags: string[], voice: Voice, vendor = ""): string[] {
  const banned = voice.neverTags.filter((t) => forBrand(t.brand, vendor)).map((t) => t.tag.toLowerCase());
  return banned.length ? tags.filter((t) => !banned.includes(t.trim().toLowerCase())) : tags;
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const paragraphs = (text: string) => text.split(/\n{2,}|\n/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${escapeHtml(p)}</p>`).join("");

/**
 * The copy with the shop's own sections after it: the brand's fit, care and origin notes where
 * there are any, then each shop section that applies, under its heading. A section whose heading
 * the copy already carries is not added twice, and an empty copy stays empty: the shop's sections
 * are a tail, not a description.
 */
export function withShopSections(bodyHtml: string, voice: Voice, target: VoiceTarget): string {
  if (!bodyHtml.trim()) return bodyHtml;
  const parts: string[] = [];
  const note = brandNoteFor(voice, target.vendor);
  const lower = bodyHtml.toLowerCase();
  if (note) {
    const lines = [note.fit && `<p><strong>Fit:</strong> ${escapeHtml(note.fit)}</p>`, note.care && `<p><strong>Care:</strong> ${escapeHtml(note.care)}</p>`, note.origin && `<p><strong>Made:</strong> ${escapeHtml(note.origin)}</p>`].filter((x): x is string => Boolean(x));
    for (const l of lines) if (!lower.includes(l.slice(0, 20).toLowerCase())) parts.push(l);
  }
  for (const s of sectionsFor(voice, target)) {
    if (lower.includes(`>${s.heading.toLowerCase()}<`)) continue;
    parts.push(`<h2>${escapeHtml(s.heading)}</h2>${paragraphs(s.text)}`);
  }
  return parts.length ? `${bodyHtml.trimEnd()}\n${parts.join("\n")}` : bodyHtml;
}

// ---------------------------------------------------------------------------------------------
// For the writer
// ---------------------------------------------------------------------------------------------

const plainText = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/** What the writer is told about the shop's voice for this product. Empty when nothing is taught. */
export function voiceGuidance(voice: Voice, target: VoiceTarget = {}): string {
  const lines: string[] = [];
  if (voice.audience) lines.push(`The shop writes for ${voice.audience}.`);
  if (voice.use.length) lines.push(`Words the shop uses: ${voice.use.join(", ")}.`);
  if (voice.avoid.length) lines.push(`Words the shop never uses: ${voice.avoid.join(", ")}.`);
  const spell = spellingsFor(voice, target.vendor);
  if (spell.length) lines.push(`The shop writes ${spell.map((s) => `"${s.to}" not "${s.from}"`).join(", ")}.`);
  const note = brandNoteFor(voice, target.vendor);
  if (note) lines.push(`About ${note.brand}: ${[note.fit && `fit: ${note.fit}`, note.care && `care: ${note.care}`, note.origin && `made: ${note.origin}`].filter(Boolean).join("; ")}. These are added after the copy by the shop; do not repeat them.`);
  const sections = sectionsFor(voice, target);
  if (sections.length) lines.push(`The shop adds its own sections after the copy (${sections.map((s) => `"${s.heading}"`).join(", ")}); do not write them.`);
  const examples = exemplarsFor(voice, target);
  if (examples.length) {
    lines.push(`${examples.length === 1 ? "A listing" : `${examples.length} listings`} from this shop, as the voice and shape to match (the facts are theirs, not this product's):`);
    examples.forEach((e, i) => lines.push(`${i + 1}. ${e.title ? `Title: ${e.title}\n` : ""}${plainText(e.body).slice(0, 900)}`));
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------------------------
// For Teach Snaben
// ---------------------------------------------------------------------------------------------

const n = (x: number, one: string, many = `${one}s`) => `${x} ${x === 1 ? one : many}`;

/** Each piece of the voice as a sentence; what has not been taught is said as such. */
export function describeVoice(voice: Voice): Array<{ id: string; sentence: string; taught: boolean }> {
  const out: Array<{ id: string; sentence: string; taught: boolean }> = [];
  out.push({ id: "voice.audience", taught: Boolean(voice.audience), sentence: voice.audience ? `The shop writes for ${voice.audience}.` : "Who the shop writes for has not been said; the writer assumes a general shopper." });
  out.push({ id: "voice.words", taught: voice.use.length + voice.avoid.length > 0, sentence: voice.use.length || voice.avoid.length ? [voice.use.length ? `Words the shop uses: ${voice.use.join(", ")}` : "", voice.avoid.length ? `never: ${voice.avoid.join(", ")}` : ""].filter(Boolean).join("; ") + "." : "No house dictionary yet: no words the shop always uses or never uses." });
  if (voice.spellings.length) out.push({ id: "voice.spellings", taught: true, sentence: `Spelled the shop's way: ${voice.spellings.slice(0, 8).map((s) => `${s.to} not ${s.from}${s.brand ? ` (${s.brand})` : ""}`).join(", ")}${voice.spellings.length > 8 ? ", …" : ""}.` });
  out.push({ id: "voice.exemplars", taught: voice.exemplars.length > 0, sentence: voice.exemplars.length ? `${n(voice.exemplars.length, "listing")} of the shop's own are the writer's examples${voice.exemplars.some((e) => e.productType) ? `, by product type (${[...new Set(voice.exemplars.map((e) => e.productType).filter(Boolean))].join(", ")})` : ""}.` : "No example listings chosen yet; the writer goes by the description format alone." });
  if (voice.sections.length) out.push({ id: "voice.sections", taught: true, sentence: `The shop's own sections after every copy: ${voice.sections.map((s) => `"${s.heading}"${s.types.length || s.brands.length ? ` (${[...s.types, ...s.brands].join(", ")})` : ""}`).join(", ")}.` });
  if (voice.brandNotes.length) out.push({ id: "voice.brands", taught: true, sentence: `Fit, care and origin notes for ${n(voice.brandNotes.length, "brand")}: ${voice.brandNotes.slice(0, 6).map((b) => b.brand).join(", ")}${voice.brandNotes.length > 6 ? ", …" : ""}.` });
  if (voice.neverTags.length) out.push({ id: "voice.neverTags", taught: true, sentence: `Never tagged: ${voice.neverTags.slice(0, 8).map((t) => `${t.tag}${t.brand ? ` on ${t.brand}` : ""}`).join(", ")}.` });
  return out;
}
