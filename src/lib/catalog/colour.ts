/**
 * A colour as the shop writes it: the name, not the supplier's code in front of it.
 *
 * Helly Hansen's "Color Description" is "627 BRIGHT BLUE" and "990 BLACK" — the code, then the
 * name, in capitals. The shop's options read "Bright Blue" and "Black". Only a leading run of digits
 * before further words is a code, so "2 Tone Grey" loses nothing it should keep; and only shouting
 * is turned down, so "Washed Navy" written by a person stays as written.
 */
export function colourName(value: string): string {
  let v = value.trim();
  const m = /^\d{2,4}\s+(\S.*)$/.exec(v);
  if (m) v = m[1];
  // A colour that is nothing but the trade's shorthand ("BLK", "NVY") is written out.
  if (/^[A-Za-z]{2,6}$/.test(v) && COLOUR_SHORTHAND[v.toUpperCase()]) v = COLOUR_SHORTHAND[v.toUpperCase()];
  if (v === v.toUpperCase() && /[A-Z]/.test(v)) v = v.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
  return v;
}

/**
 * A supplier's two-tone colour, written out with the names the sheet itself uses in full.
 *
 * Burton's sheet says "RUMRSN/CHLGRY" and "NTSHPR/PRPVLT" on the two-tone jackets, and "RUM RAISIN",
 * "CHINCHILLA GRAY" and "NIGHTSHADE PURPLE" in full on the plain ones a few rows down. Each part of
 * a slashed colour is looked for among the sheet's full names: the one it abbreviates begins with
 * the same letter and contains its letters in order (RUMRSN in RUM RAISIN, CHLGRY in CHINCHILLA
 * GRAY). Only a part that fits exactly one name is written out; the rest is left as the supplier
 * wrote it, cased, rather than guessed. The shop writes the result "Rum Raisin / Chinchilla Gray".
 */
/**
 * The trade's own shorthand inside a colour, which no sheet spells out: Anon's lenses are "PRCV SUN
 * ONYX" and "PRCV VRBL BLUE" on every row, and Perceive Sunny Onyx and Perceive Variable Blue on
 * the shop's shelf. Whole words only, and "Sun" is "Sunny" only in a Perceive lens name.
 */
const COLOUR_SHORTHAND: Record<string, string> = {
  TRUBLK: "TRUE BLACK", BLK: "BLACK", WHT: "WHITE", GRY: "GRAY", BLU: "BLUE", GRN: "GREEN", PRPL: "PURPLE", ORG: "ORANGE", YLW: "YELLOW", ARSTBL: "AIRSTREAM BLUE", PRCV: "PERCEIVE", VRBL: "VARIABLE",
  // The clothing and outdoor trade's own: a colour column of three-letter codes is common there.
  NVY: "NAVY", CHR: "CHARCOAL", CHAR: "CHARCOAL", OLV: "OLIVE", BRN: "BROWN", BGE: "BEIGE", KHK: "KHAKI", SLV: "SILVER", PNK: "PINK", PRP: "PURPLE", TRQ: "TURQUOISE", MRN: "MAROON", BRG: "BURGUNDY", CRL: "CORAL", LIM: "LIME", MLT: "MULTI", NAT: "NATURAL", SND: "SAND", STN: "STONE", GRPH: "GRAPHITE",
};

/**
 * A colour that is only a code: "001", "4417", "0-9A", or letters that name nothing ("XKCD").
 * Pictures cannot be matched to it, so it is not offered as a colour to look for.
 */
export function isColourCode(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (/^[\d\s./-]+$/.test(v)) return true;
  if (/^[A-Z0-9]{2,6}$/.test(v) && /\d/.test(v)) return true;
  if (/^[A-Z]{2,4}$/.test(v) && !COLOUR_SHORTHAND[v] && !/[AEIOU]/.test(v)) return true;
  return false;
}
function writeOutWords(part: string): string {
  // Whole words only, whatever the case they arrived in: a reader may have cased the colour
  // already, and a word written out joins it in that case.
  const cased = /[a-z]/.test(part);
  const asCase = (w: string) => (cased ? w.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()) : w);
  const out = part.trim().split(/\s+/).map((w) => (COLOUR_SHORTHAND[w.toUpperCase()] ? asCase(COLOUR_SHORTHAND[w.toUpperCase()]) : w));
  // Anon's lens names: "Perceive Sunny Onyx", "Perceive Variable Blue". "Sun" is Sunny only there.
  return out.map((w, i) => (w.toUpperCase() === "SUN" && (out[i - 1] ?? "").toUpperCase() === "PERCEIVE" ? asCase("SUNNY") : w)).join(" ");
}

/**
 * A goggle's colour is its frame, then its lens, the way the shop writes it: "Black w/ Perceive
 * Sunny Onyx" for the sheet's "BLACK/PRCV SUN ONYX".
 */
export function goggleColour(value: string): string {
  const parts = value.split("/").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return colourName(value);
  const [frame, ...lens] = parts;
  return `${colourName(writeOutWords(frame))} w/ ${colourName(writeOutWords(lens.join(" ")))}`;
}

export function writeOutColour(value: string, fullNames: string[], lens = false): string {
  if (lens) return goggleColour(value);
  const parts = value.split("/").map((p) => writeOutWords(p.trim())).filter(Boolean);
  if (parts.length < 2) return colourName(parts[0] ?? value);
  const names = [...new Set(fullNames.map((n) => n.trim()).filter((n) => n && !n.includes("/")))];
  const letters = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, "");
  const abbreviates = (abbr: string, name: string): boolean => {
    const a = letters(abbr), n = letters(name);
    if (a.length < 4 || a.length >= n.length || a[0] !== n[0]) return false;
    let i = 0;
    for (const ch of n) if (ch === a[i]) i++;
    return i === a.length;
  };
  const written = parts.map((part) => {
    if (names.some((n) => letters(n) === letters(part))) return colourName(names.find((n) => letters(n) === letters(part))!);
    const fits = names.filter((n) => abbreviates(part, n));
    return fits.length === 1 ? colourName(fits[0]) : colourName(part);
  });
  return written.join(" / ");
}
