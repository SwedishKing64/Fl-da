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
