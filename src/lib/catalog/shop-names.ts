/**
 * A new product named the way the shop names the same model's other listings.
 *
 * Anon's sheet says "M4 TORIC" in Low Bridge; the shop already lists "M4 Goggles (Toric) + Bonus
 * Lens + MFI® Face Mask 2026" and "M4 Low Bridge Fit Goggles (Cylindrical) + Bonus Lens + MFI®
 * Face Mask 2026". The new product is the model the shop knows, in a fit it has not listed, and
 * its name should read like its siblings' — not "M4 Toric Low Bridge 2027".
 *
 * So: among the shop's listings, the one whose name carries every word of the new product's model
 * (fit, year and the "+ …" bundle on the end set aside) is its sibling. Its name is taken, the fit
 * phrase swapped for the new product's — "Low Bridge Fit", "Wide", "Asian Fit" — put where the
 * shop puts it (before the kind word, "Goggles", "Snowboard Boots"), and the year replaced. A model
 * with no sibling, or with siblings that disagree, is named by the rules as before.
 */

const FIT_PHRASES: Array<[RegExp, string]> = [
  [/\blow bridge( fit)?\b/i, "Low Bridge Fit"],
  [/\basian fit\b/i, "Asian Fit"],
  [/\bround fit\b/i, "Round Fit"],
  [/\boval fit\b/i, "Oval Fit"],
  [/\b(extra wide|x-?wide)\b/i, "Extra Wide"],
  [/\bwide\b/i, "Wide"],
  [/\bnarrow\b/i, "Narrow"],
];
const KIND_WORD = /\b(snowboard |ski )?(goggles?|helmets?|boots?|bindings?|gloves?|mittens?|mitts?|socks?|jackets?|pants?|bibs?|skis?|snowboards?|boards?|bags?)\b/i;
const AUDIENCE = /\b(men'?s?|women'?s?|kids'?|youth|junior|boys'?|girls'?)\b/gi;

/** The fit phrase a name carries, as the shop writes it, or "" for the regular fit. */
export function fitPhraseOf(title: string): string {
  for (const [re, phrase] of FIT_PHRASES) if (re.test(title)) return phrase;
  return "";
}

const words = (s: string): string[] => s.toLowerCase().replace(/[^a-z0-9+]+/g, " ").trim().split(" ").filter(Boolean);

/** A listing's name as a model: no fit, no year, nothing after a "+", no kind word, no brackets. */
function modelWords(title: string): string[] {
  let t = title.split("+")[0];
  for (const [re] of FIT_PHRASES) t = t.replace(re, " ");
  t = t.replace(/\b20\d\d\b/g, " ").replace(/\bfit\b/gi, " ").replace(/[()]/g, " ").replace(AUDIENCE, " ").replace(new RegExp(KIND_WORD.source, "gi"), " ");
  return words(t);
}

export interface Sibling { title: string; vendor?: string }

export function nameLikeSibling(title: string, season: string, listings: Sibling[], vendor = ""): string | null {
  const fit = fitPhraseOf(title);
  let own = title;
  for (const [re] of FIT_PHRASES) own = own.replace(re, " ");
  const ours = words(own.replace(/\b20\d\d\b/g, " ").replace(AUDIENCE, " ").replace(new RegExp(KIND_WORD.source, "gi"), " "));
  if (ours.length === 0) return null;
  // The same model, word for word; or the same model in another shape where the shop puts the
  // shape in brackets — "M4S Goggles (Cylindrical)" names the Toric too, with the bracket swapped.
  const bracketed = (title: string) => /\(([^)]+)\)/.exec(title.split("+")[0])?.[1]?.trim() ?? "";
  const candidates = listings.flatMap((l) => {
    if (vendor && l.vendor && l.vendor.trim().toLowerCase() !== vendor.trim().toLowerCase()) return [];
    const theirs = modelWords(l.title);
    if (theirs.length === ours.length && ours.every((w) => theirs.includes(w))) return [{ title: l.title }];
    const shape = bracketed(l.title);
    const extra = ours.filter((w) => !theirs.includes(w)), missing = theirs.filter((w) => !ours.includes(w));
    if (shape && extra.length === 1 && missing.length === 1 && words(shape).join(" ") === missing[0]) {
      const ownShape = own.split(/\s+/).find((w) => words(w)[0] === extra[0]) ?? extra[0];
      return [{ title: l.title.replace(`(${shape})`, `(${ownShape})`) }];
    }
    return [];
  });
  if (candidates.length === 0) return null;
  // The same fit's listing names the product outright, year apart; else the other fit's is reshaped.
  const sameFit = candidates.filter((l) => fitPhraseOf(l.title) === fit);
  const pool = sameFit.length > 0 ? sameFit : candidates;
  const shapes = new Set(pool.map((l) => reshape(l.title, fit, season)));
  if (shapes.size !== 1) return null;
  return [...shapes][0];
}

/** A sibling's name with the fit swapped for ours and the year for this season's. */
function reshape(siblingTitle: string, fit: string, season: string): string {
  let t = siblingTitle.replace(/\s*\b20\d\d\b\s*$/, "").trim();
  for (const [re] of FIT_PHRASES) t = t.replace(re, "").replace(/\s{2,}/g, " ").trim();
  if (fit) {
    const kind = KIND_WORD.exec(t);
    t = kind ? `${t.slice(0, kind.index).trim()} ${fit} ${t.slice(kind.index)}`.replace(/\s{2,}/g, " ").trim() : `${t} ${fit}`;
  }
  t = t.replace(/\(\s*\)/g, "").replace(/\s{2,}/g, " ").trim();
  return /^20\d\d$/.test(season) ? `${t} ${season}` : t;
}
