/**
 * Which column is which, deduced from what is in it.
 *
 * Suppliers lay their order forms and invoices out however they like: the name before the code or
 * after it, the barcode beside the code or at the far end, a heading that names a product family
 * instead of saying "Description", or no heading at all. The shop asked that no reader be written
 * for one brand's layout ("the column beside the item code is the name" was Volkl's, and on
 * Osprey's form that column is the UPC). So a column is known by its contents:
 *
 *  - a barcode is 8, 12, 13 or 14 digits whose check digit adds up;
 *  - a size is XS-XXL, S/M, WXS/S, O/S, a ski length, a boot or Mondo size;
 *  - a colour is colour words ("Dale Grey/Agam Blue");
 *  - a gender is men's, women's, unisex, kids;
 *  - a code is short, has no spaces and has a digit in it;
 *  - a name is words — letters, spaces, a number or two — that change from product to product but
 *    repeat across a product's sizes, and is none of the above.
 *
 * A heading is evidence too, and breaks ties, but the contents decide: a column of barcodes is
 * never the name however it is headed.
 */

export interface ColumnRoles {
  barcode: number;
  code: number;
  name: number;
  colour: number;
  size: number;
  gender: number;
}

const cell = (v: unknown): string => (v ?? "").toString().trim();

/** A GTIN's check digit, for 8, 12, 13 and 14 digit barcodes. */
export function isBarcode(raw: string): boolean {
  const v = raw.replace(/\s/g, "");
  if (!/^\d{8}$|^\d{12,14}$/.test(v)) return false;
  const digits = v.split("").map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((n, d, i) => n + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

const SIZE_WORD = /^(?:w|m|y|k|jr|kids?\s)?(?:xxs|xs|s|m|l|xl|xxl|xxxl|[2-5]xl)(?:\s*[/-]\s*(?:w|m)?(?:xxs|xs|s|m|l|xl|xxl|xxxl|[2-5]xl))?(?:\s*(?:ef|tall|short|reg|long))?$/i;
/** One size, of clothing, packs, boots or skis. Not a list of the lengths a ski comes in. */
export function isSize(raw: string): boolean {
  const v = raw.trim();
  if (!v || v.length > 14 || v.includes(",")) return false;
  // "168/173/178" is the lengths a ski comes in, not one of them.
  if (/^\d+(\/\d+)+$/.test(v)) return false;
  if (SIZE_WORD.test(v)) return true;
  if (/^(o\/s|os|one size|osfa|osfm|n\/s|ns|uni|adult|youth|junior|jr)$/i.test(v)) return true;
  // Ski and board lengths, poles; boot, Mondo and shoe sizes; kids' ages.
  if (/^\d{2,3}(\.\d)?\s*(cm|w)?$/i.test(v)) { const n = parseFloat(v); return (n >= 60 && n <= 215) || (n >= 15 && n <= 34) || (n >= 1 && n <= 16); }
  if (/^\d{1,2}(\.5)?$/.test(v)) return true;
  if (/^(us|uk|eu|mondo)\s*\d/i.test(v)) return true;
  return false;
}

const COLOUR_WORDS = /\b(black|white|grey|gray|blue|navy|red|green|yellow|orange|purple|pink|brown|tan|beige|cream|charcoal|olive|teal|khaki|silver|gold|camo|camouflage|burgundy|maroon|coral|mint|lime|sand|stone|slate|indigo|violet|lavender|aqua|turquoise|ivory|natural|multi|print|heather|ash|graphite|onyx|ink|denim|sage|rust|plum|berry|cobalt|mustard|ochre|tide|sky|blush|petrol)\b/i;
export const isColour = (raw: string): boolean => {
  const v = raw.trim();
  return v.length > 0 && v.length <= 40 && COLOUR_WORDS.test(v) && !/\d{3,}/.test(v.replace(/^\d+\s*/, ""));
};

export const isGender = (raw: string): boolean => /^(m|w|f|u|men'?s?|women'?s?|male|female|mens|womens|ladies|unisex|kids?|youth|boys?|girls?|junior|jr|wmns?)$/i.test(raw.trim());

/** A code: short, no spaces, a digit in it — "10004715", "V2610112.000", "66094_627-S". */
export const isCode = (raw: string): boolean => {
  const v = raw.trim();
  return v.length >= 2 && v.length <= 40 && !/\s/.test(v) && /\d/.test(v) && /^[A-Za-z0-9_.\-/#]+$/.test(v);
};

/** Words, as a product's name is: letters in it, not a code, a number, a barcode, a size or a colour on its own. */
const isNameLike = (raw: string): boolean => {
  const v = raw.trim();
  if (v.length < 3 || !/[A-Za-z]{2,}/.test(v)) return false;
  if (isCode(v) || isBarcode(v) || isSize(v) || isGender(v)) return false;
  if (/^[$€£]?\s*[\d,.]+$/.test(v)) return false;
  return true;
};

/** Of the filled cells, the share that pass. */
function share(values: string[], test: (v: string) => boolean): number {
  return values.length === 0 ? 0 : values.filter(test).length / values.length;
}

/** How many different values a column has, for the filled cells. */
const distinct = (values: string[]): number => new Set(values.map((v) => v.toLowerCase())).size;

const NAME_HEADING = /descri|product name|\bname\b|title|\bmodel\b|\bstyle\b|\barticle\b|\bitem\b/;
const NOT_NAME_HEADING = /code|\bno\b|number|\bsku\b|\bean\b|\bupc\b|barcode|colou?r|size|price|cost|rrp|qty|quantity|total|customer|account|address|category|gender|season|date/;

/**
 * Every role a column can be told by its contents, for one table: its headings and its rows.
 * `taken` are columns already known to be something else — quantities, prices, size-grid lengths.
 */
export function deduceColumns(headings: string[], rows: string[][], taken: Iterable<number> = []): ColumnRoles {
  const width = Math.max(headings.length, ...rows.map((r) => r.length));
  const used = new Set<number>(taken);
  const columns = Array.from({ length: width }, (_, i) => ({
    index: i,
    heading: cell(headings[i]).toLowerCase().replace(/[\s._/-]+/g, " "),
    values: rows.map((r) => cell(r[i])).filter(Boolean),
  }));
  const best = (score: (c: (typeof columns)[number]) => number, floor: number): number => {
    let at = -1;
    let top = floor;
    for (const c of columns) {
      if (used.has(c.index) || c.values.length === 0) continue;
      const s = score(c);
      if (s > top) { top = s; at = c.index; }
    }
    if (at >= 0) used.add(at);
    return at;
  };
  const headed = (c: (typeof columns)[number], re: RegExp) => (re.test(c.heading) ? 0.15 : 0);

  const barcode = best((c) => share(c.values, isBarcode) + headed(c, /\bean\b|\bupc\b|barcode|gtin/), 0.8);
  // A column of bare small numbers — 1, 2, 6 — is a count, not kids' sizes, unless it says it is sizes.
  const counts = (c: (typeof columns)[number]) => !/^size|length|mondo/.test(c.heading) && c.values.every((v) => /^\d{1,2}$/.test(v));
  const size = best((c) => (counts(c) || /\bdue\b|qty|quantity|units|total|price|cost|rrp/.test(c.heading) ? 0 : share(c.values, isSize) + headed(c, /^size|length|mondo/) - (/order|sort|rank|seq/.test(c.heading) ? 1 : 0)), 0.8);
  const colour = best((c) => share(c.values, isColour) + headed(c, /colou?r/) - (/code/.test(c.heading) ? 0.3 : 0), 0.6);
  const gender = best((c) => share(c.values, isGender) + headed(c, /gender|^sex$/), 0.8);
  // The product's code: codes, nearly one per row.
  const code = best((c) => {
    const spread = distinct(c.values) / c.values.length;
    return share(c.values, isCode) * (0.5 + 0.5 * spread) + headed(c, /\bsku\b|code|item no|article|style no|product no|part/);
  }, 0.75);
  // The name: words that tell products apart. A column saying the same thing on every row — the
  // shop's own name, "Outdoor", Flat and System — is not it, however wordy.
  const name = best((c) => {
    if (NOT_NAME_HEADING.test(c.heading) && !/descri/.test(c.heading)) return 0;
    const words = share(c.values, isNameLike);
    const kinds = distinct(c.values);
    if (kinds < 2 && c.values.length > 2) return 0;
    const variety = Math.min(1, kinds / Math.max(3, c.values.length * 0.15));
    return words * variety + headed(c, NAME_HEADING) + (c.values.some((v) => /\s/.test(v)) ? 0.05 : 0);
  }, 0.5);
  return { barcode, code, name, colour, size, gender };
}

/** Whether a column's contents rule out its being the product's name: mostly barcodes, codes or bare numbers. */
export function notNames(values: string[]): boolean {
  const filled = values.map(cell).filter(Boolean);
  return filled.length > 0 && share(filled, (v) => isBarcode(v) || isCode(v) || /^[\d.,\s]+$/.test(v)) >= 0.8;
}
