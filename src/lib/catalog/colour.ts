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
export function writeOutColour(value: string, fullNames: string[]): string {
  const parts = value.split("/").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return colourName(value);
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
