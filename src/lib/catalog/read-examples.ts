/**
 * How a supplier's lines were read before, as examples for the reader.
 *
 * Every supplier prints its lines its own way, and no general rule covers them all: one writes the
 * colour as 0010, one puts the size on the end of the code, one prints a line total where the unit
 * price should be. The surest guide to reading the next invoice is the last one, as the shop settled
 * it. So the lines of a supplier's finished batches are kept as pairs — the line as the document
 * printed it, and what it was read as once the shop had checked it — and the closest few are given
 * to the reader with the supplier's next document. Only lines from batches the shop exported or
 * pushed are used: a batch still in review may hold a reading nobody has checked.
 */

import { sameLayout } from "./layout";

/** What one line was read as, once the shop had checked it. */
export interface ReadAnswer {
  code: string;
  name: string;
  quantity: number;
  cost: number;
  size?: string;
  colour?: string;
  option?: string;
}

export interface ReadExample {
  /** The line as the document printed it. */
  printed: string;
  read: ReadAnswer;
  /** The layout of the document it came from. See layout.ts. */
  layout: string | null;
}

/**
 * The line of a document's text that printed this answer: the one carrying its code. A code too
 * short to be told from a quantity or a price ("12") finds nothing, rather than the wrong line.
 */
export function printedLine(text: string, answer: Pick<ReadAnswer, "code">, barcode = ""): string | null {
  const codes = [answer.code, barcode].map((c) => c.trim()).filter((c) => c.length >= 4);
  if (codes.length === 0) return null;
  for (const line of text.split(/\r?\n/)) {
    const flat = line.replace(/\s+/g, " ").trim();
    if (flat.length > 240) continue;
    if (codes.some((c) => flat.toLowerCase().includes(c.toLowerCase()))) return flat;
  }
  return null;
}

/** The size, colour and other option of a variant, by what its product calls its options. */
export function answerOptions(names: Array<string | null>, values: Array<string | null>): Pick<ReadAnswer, "size" | "colour" | "option"> {
  const out: Pick<ReadAnswer, "size" | "colour" | "option"> = {};
  names.forEach((raw, i) => {
    const name = (raw ?? "").toLowerCase();
    const value = (values[i] ?? "").trim();
    if (!name || !value || /^title$/.test(name)) return;
    if (/colou?r/.test(name)) out.colour ??= value;
    else if (/size|length/.test(name)) out.size ??= value;
    else out.option ??= value;
  });
  return out;
}

/**
 * The examples to give the reader: the same layout first, then the most recent, one per product so
 * a run of one jacket's sizes does not crowd out every other kind of line the supplier prints.
 */
export function pickExamples(cases: ReadExample[], layout: string | null, max = 6): ReadExample[] {
  const ranked = [...cases.filter((c) => sameLayout(c.layout, layout)), ...cases.filter((c) => !sameLayout(c.layout, layout))];
  const out: ReadExample[] = [];
  const names = new Set<string>();
  for (const c of ranked) {
    const name = c.read.name.toLowerCase();
    if (names.has(name)) continue;
    names.add(name);
    out.push(c);
    if (out.length >= max) break;
  }
  return out;
}

/** The examples, as the reader is told them. Empty where there are none. */
export function examplesPrompt(examples: ReadExample[]): string {
  if (examples.length === 0) return "";
  const lines = examples.map((e) => {
    const r = e.read;
    const parts = [`code ${r.code}`, `title ${r.name}`, r.colour ? `colour ${r.colour}` : "", r.size ? `size ${r.size}` : "", r.option ? `option ${r.option}` : "", `quantity ${r.quantity}`, `cost ${r.cost}`].filter(Boolean);
    return `- "${e.printed}" was read as ${parts.join(", ")}.`;
  });
  return [
    "This supplier has sent documents before. Lines from them, and how the shop settled each one, follow. Read this document's lines the same way where they are printed the same way; where this document differs, read what it says.",
    ...lines,
  ].join("\n");
}
