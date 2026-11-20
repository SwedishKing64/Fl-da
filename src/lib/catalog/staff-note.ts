/**
 * A line from the shop floor, quoted in the copy.
 *
 * "Runs small, but worth it for the hood." A staff member types one line on the review page,
 * with their first name if they want it there, and the listing carries it as a quoted line
 * after the copy: the kind of thing only a shop that handles the product can say. The product's
 * own copy is left as it is; the note is added at export and at push, so it can be changed or
 * taken off until then without touching the description. Pure.
 */

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const MAX_NOTE = 280;
export const MAX_NAME = 40;

/** The note as it goes into the copy: a blockquote, signed where a name was given. */
export function staffNoteHtml(note: string, name = ""): string {
  const text = note.trim().slice(0, MAX_NOTE);
  if (!text) return "";
  const who = name.trim().slice(0, MAX_NAME);
  return `<blockquote class="staff-note"><p>&ldquo;${escapeHtml(text)}&rdquo;${who ? ` <cite>&mdash; ${escapeHtml(who)}</cite>` : ""}</p></blockquote>`;
}

/** The copy with the note after it. An empty copy stays empty: a note is not a description. */
export function withStaffNote(bodyHtml: string, note: string, name = ""): string {
  const quote = staffNoteHtml(note, name);
  if (!quote || !bodyHtml.trim()) return bodyHtml;
  if (bodyHtml.includes('class="staff-note"')) return bodyHtml;
  return `${bodyHtml.trimEnd()}\n${quote}`;
}

/** A person's first name, for signing a note: "Emma Jones" → "Emma". */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}
