/**
 * A season as the shop writes it: four digits.
 *
 * Suppliers write it their own way — Burton's SAP export says "27WIN", its order form "W27",
 * Völkl's PIM "26/27" — and the season is what puts the year on the title and the year tag on the
 * product, so "27WIN" left as it was meant a board with no season at all. A northern winter that
 * spans two years is named by the year it ends in, which is how the shop already titles them
 * ("Custom 2027" for the 26/27 range).
 */
export function seasonFrom(value: string): string {
  const text = value.trim();
  if (/^20\d{2}$/.test(text)) return text;
  const span = /^(?:20)?(\d{2})\s*[/\-–]\s*(?:20)?(\d{2})$/.exec(text) ?? /^(\d{2})(\d{2})$/.exec(text);
  if (span && Number(span[2]) === Number(span[1]) + 1) return `20${span[2]}`;
  const m = /^(?:W|S|F|FW|SS|AW)?\s*(\d{2})\s*(?:WIN|WINTER|SUM|SUMMER|W|S|FW|SS|AW)?$/i.exec(text);
  return m ? `20${m[1]}` : text;
}
