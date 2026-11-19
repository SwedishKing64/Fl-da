/**
 * What a person changed on the review grid, remembered as a lesson, and offered as a rule once
 * the same change has been made enough times.
 *
 * A shop teaches most by correcting: "Jacket" to "Shell" on an Arc'teryx product, the tag
 * "Alpine" added to a Mammut product, "Sale" taken off. Each such edit is a lesson with a before
 * and an after, kept with how often it recurs. After the third time Snaben says it back as a
 * sentence on Teach Snaben — "You replace 'Jacket' with 'Shell' on Arc'teryx products. Always?" —
 * and a yes makes it a rule: a spelling in the shop's voice, a tag rule, a tag never written.
 * Nothing becomes a rule on its own; a lesson only ever asks.
 *
 * Pure: the list is handed in. shop-profile.ts keeps it under LESSONS_KEY. corrections.ts does
 * the same job for a renamed option and a changed Type, and is applied at once because those two
 * have no wrong answer; the lessons here change words, so a person decides.
 */

export type LessonKind = "title-word" | "tag-added" | "tag-removed";
export type LessonStatus = "watching" | "accepted" | "dismissed";

export interface Lesson {
  kind: LessonKind;
  /** The word or tag before; empty for a tag added. */
  from: string;
  /** The word or tag after; empty for a tag removed. */
  to: string;
  /** The product's brand when the change was made; the rule is offered for that brand. */
  brand: string;
  productType: string;
  count: number;
  firstAt: string;
  lastAt: string;
  /** Titles of the products it was made on, a few. */
  examples: string[];
  status: LessonStatus;
}

export const LESSONS_KEY = "shop.lessons";
/** How many times the same change is made before it is offered as a rule. */
export const RIPE_AT = 3;
const MAX_LESSONS = 300;
const MAX_SPAN = 3;

export interface EditSnapshot { title: string; tags: string; vendor: string; productType: string }
export type Found = Pick<Lesson, "kind" | "from" | "to" | "brand" | "productType">;

const tokens = (s: string) => s.trim().split(/\s+/).filter(Boolean);
const tagList = (s: string) => s.split(",").map((t) => t.trim()).filter(Boolean);
const lower = (s: string) => s.trim().toLowerCase();

/**
 * The one span of words that changed between two titles, when exactly one did and it is short:
 * "Beta Jacket 2026" → "Beta Shell 2026" is {from: "Jacket", to: "Shell"}. A rewrite, a
 * reordering or a change in two places is no lesson.
 */
export function wordReplacement(before: string, after: string): { from: string; to: string } | null {
  const a = tokens(before);
  const b = tokens(after);
  if (a.join(" ") === b.join(" ")) return null;
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const from = a.slice(head, a.length - tail);
  const to = b.slice(head, b.length - tail);
  if (from.length === 0 || to.length === 0 || from.length > MAX_SPAN || to.length > MAX_SPAN) return null;
  const f = from.join(" ");
  const t = to.join(" ");
  // A change of case or punctuation alone is the shop tidying, not a word it prefers.
  if (f.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "") === t.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "")) return null;
  return { from: f, to: t };
}

/** The lessons in one edit: a word replaced in the title, tags added, tags removed. */
export function lessonsFromEdit(before: EditSnapshot, after: Partial<EditSnapshot>): Found[] {
  const out: Found[] = [];
  const brand = (after.vendor ?? before.vendor).trim();
  const productType = (after.productType ?? before.productType).trim();
  if (typeof after.title === "string") {
    const r = wordReplacement(before.title, after.title);
    if (r) out.push({ kind: "title-word", from: r.from, to: r.to, brand, productType });
  }
  if (typeof after.tags === "string") {
    const was = tagList(before.tags);
    const now = tagList(after.tags);
    for (const t of now) if (!was.some((x) => lower(x) === lower(t))) out.push({ kind: "tag-added", from: "", to: t, brand, productType });
    for (const t of was) if (!now.some((x) => lower(x) === lower(t))) out.push({ kind: "tag-removed", from: t, to: "", brand, productType });
  }
  return out;
}

const sameLesson = (a: Found, b: Found) => a.kind === b.kind && lower(a.from) === lower(b.from) && lower(a.to) === lower(b.to) && lower(a.brand) === lower(b.brand);

/** A lesson's name, stable across loads. */
export function lessonKey(l: Found): string {
  return [l.kind, lower(l.from), lower(l.to), lower(l.brand)].join("|");
}

/** The list with these edits counted in: an old lesson counted again, a new one added. */
export function noteLessons(list: Lesson[], found: Found[], example: string, now = new Date()): Lesson[] {
  const at = now.toISOString();
  let out = [...list];
  for (const f of found) {
    const i = out.findIndex((l) => sameLesson(l, f));
    if (i >= 0) {
      const l = out[i];
      out[i] = { ...l, count: l.count + 1, lastAt: at, examples: l.examples.includes(example) || !example ? l.examples : [...l.examples, example].slice(-3) };
    } else {
      out.push({ ...f, count: 1, firstAt: at, lastAt: at, examples: example ? [example] : [], status: "watching" });
    }
  }
  if (out.length > MAX_LESSONS) out = out.sort((a, b) => b.lastAt.localeCompare(a.lastAt)).slice(0, MAX_LESSONS);
  return out;
}

/** The lessons made often enough to ask about, and not yet decided. */
export function ripeLessons(list: Lesson[]): Lesson[] {
  return list.filter((l) => l.status === "watching" && l.count >= RIPE_AT).sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt));
}

export function decideLesson(list: Lesson[], key: string, status: LessonStatus): Lesson[] {
  return list.map((l) => (lessonKey(l) === key ? { ...l, status } : l));
}

const on = (l: Found) => (l.brand ? `on ${l.brand} products` : "on products");

/** The lesson said back, as a question. */
export function lessonSentence(l: Lesson): string {
  const times = `${l.count} times`;
  switch (l.kind) {
    case "title-word": return `You replace "${l.from}" with "${l.to}" in titles ${on(l)}, ${times}. Always?`;
    case "tag-added": return `You add the tag "${l.to}" ${on(l)}, ${times}. Always?`;
    case "tag-removed": return `You take the tag "${l.from}" off ${on(l)}, ${times}. Never write it?`;
  }
}

/** What saying yes does, in a few words. */
export function lessonOutcome(l: Lesson): string {
  switch (l.kind) {
    case "title-word": return `"${l.to}" is spelled that way ${l.brand ? `for ${l.brand}` : "everywhere"} from now on, in titles and copy.`;
    case "tag-added": return l.brand ? `A tag rule: every ${l.brand} product gets "${l.to}".` : `A tag rule: every product gets "${l.to}".`;
    case "tag-removed": return `"${l.from}" is never written ${l.brand ? `on ${l.brand} products` : "on any product"}.`;
  }
}
