/**
 * Tags that mirror a product's variants, learned from the shop's own export.
 *
 * Shopify apps and themes often tag a product with each of its sizes and colours so a filter can
 * find it: "Size_54", "Colour_Black", "size-m", or the bare value "Black". Which shape, and
 * whether at all, is the shop's habit, and the export shows it: for most products, each option
 * value appears among the tags in one consistent form. That form is learned here as a pattern
 * per option, and then two things follow: those tags are never offered as tags a person has to
 * add (they say nothing about where a product is filed), and the build writes them itself from
 * each new product's variants, so nobody types "Size_56" by hand. Pure.
 */

export interface OptionTagPattern {
  /** The option, as the export names it: "Size", "Colour". */
  option: string;
  /** How the tag is written, with the value's place marked: "Size_{value}", "{value}", "size-{value}". */
  template: string;
  /** How the value is written into it: as the variant has it, lower-cased, or as a slug. */
  form: "as-is" | "lower" | "slug";
  /** One such tag as the export had it, for the page to show. */
  example: string;
}

export interface OptionValues {
  name: string;
  values: string[];
}

const slug = (s: string) => s.trim().toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "");
const FORMS: Array<[OptionTagPattern["form"], (v: string) => string]> = [["as-is", (v) => v.trim()], ["lower", (v) => v.trim().toLowerCase()], ["slug", slug]];
const SEPARATORS = ["_", "-", ":", " ", "="];

/** At least this many (product, value) pairs must carry the tag, and this share of the pairs that could. */
const MIN_PAIRS = 5;
const MIN_SHARE = 0.6;

/** The shapes a tag for this option and value could take, each with its template. */
function candidates(option: string, value: string): Array<{ tag: string; template: string; form: OptionTagPattern["form"] }> {
  const out: Array<{ tag: string; template: string; form: OptionTagPattern["form"] }> = [];
  const prefixes = [...new Set([option.trim(), option.trim().toLowerCase(), slug(option)])].filter(Boolean);
  for (const [form, write] of FORMS) {
    const v = write(value);
    if (!v) continue;
    out.push({ tag: v, template: "{value}", form });
    for (const p of prefixes) for (const sep of SEPARATORS) out.push({ tag: `${p}${sep}${v}`, template: `${p}${sep}{value}`, form });
  }
  return out;
}

/** Write a value into a pattern. */
export function renderOptionTag(pattern: Pick<OptionTagPattern, "template" | "form">, value: string): string {
  const write = FORMS.find(([f]) => f === pattern.form)?.[1] ?? FORMS[0][1];
  const v = write(value);
  return v ? pattern.template.replace("{value}", v) : "";
}

/**
 * The patterns a set of listings follows: for each option, the one tag shape most of its values
 * appear in. A listing without options teaches nothing; a value that is "Default Title" is not a
 * value.
 */
export function learnOptionTags(listings: Array<{ tags: string[]; options?: OptionValues[] }>): OptionTagPattern[] {
  const pairs = new Map<string, number>();
  const hits = new Map<string, Map<string, { n: number; example: string; template: string; form: OptionTagPattern["form"] }>>();
  const names = new Map<string, string>();
  for (const l of listings) {
    const tags = new Set(l.tags.map((t) => t.trim()).filter(Boolean));
    if (!tags.size) continue;
    for (const o of l.options ?? []) {
      const key = o.name.trim().toLowerCase();
      if (!key || key === "title") continue;
      names.set(key, names.get(key) ?? o.name.trim());
      for (const value of new Set(o.values.map((v) => v.trim()).filter((v) => v && !/^default title$/i.test(v)))) {
        pairs.set(key, (pairs.get(key) ?? 0) + 1);
        const seen = new Set<string>();
        for (const c of candidates(o.name, value)) {
          const id = `${c.template}|${c.form}`;
          if (seen.has(id) || !tags.has(c.tag)) continue;
          seen.add(id);
          const by = hits.get(key) ?? new Map();
          const have = by.get(id) ?? { n: 0, example: c.tag, template: c.template, form: c.form };
          have.n++;
          by.set(id, have);
          hits.set(key, by);
        }
      }
    }
  }
  const out: OptionTagPattern[] = [];
  for (const [key, by] of hits) {
    const total = pairs.get(key) ?? 0;
    // The plainest shape wins a tie: as-is over lower over slug, so "Black" is learned as "{value}" as-is.
    const best = [...by.values()].sort((a, b) => b.n - a.n || FORMS.findIndex(([f]) => f === a.form) - FORMS.findIndex(([f]) => f === b.form))[0];
    if (!best || best.n < MIN_PAIRS || best.n / Math.max(total, 1) < MIN_SHARE) continue;
    out.push({ option: names.get(key) ?? key, template: best.template, form: best.form, example: best.example });
  }
  return out.sort((a, b) => a.option.localeCompare(b.option));
}

/** The tags a product's variants call for, by the patterns learned: one per option value. */
export function optionTagsFor(options: OptionValues[], patterns: OptionTagPattern[]): string[] {
  const out: string[] = [];
  for (const o of options) {
    const p = patterns.find((x) => x.option.toLowerCase() === o.name.trim().toLowerCase());
    if (!p) continue;
    for (const value of new Set(o.values.map((v) => v.trim()).filter((v) => v && !/^default title$/i.test(v)))) {
      const tag = renderOptionTag(p, value);
      if (tag && !out.includes(tag)) out.push(tag);
    }
  }
  return out;
}

/** Whether a tag is one a product's variants account for, under the patterns learned. */
export function isOptionTag(tag: string, patterns: OptionTagPattern[], options?: OptionValues[]): boolean {
  const t = tag.trim();
  if (!t || !patterns.length) return false;
  // With the product's own options to hand, exactly: the tag is one the variants would write.
  if (options) return optionTagsFor(options, patterns).some((x) => x.toLowerCase() === t.toLowerCase());
  // Without them, by shape: a prefixed pattern is told by its prefix; a bare value cannot be told.
  return patterns.some((p) => {
    const at = p.template.indexOf("{value}");
    const prefix = p.template.slice(0, at);
    return prefix.length > 0 && t.toLowerCase().startsWith(prefix.toLowerCase()) && t.length > prefix.length;
  });
}

/** The patterns in a line: 'each Size as "Size_54" and each Colour as "Colour_Black"'. */
export function describeOptionTags(patterns: OptionTagPattern[]): string {
  const parts = patterns.map((p) => `each ${p.option} as "${p.example}"`);
  return parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
