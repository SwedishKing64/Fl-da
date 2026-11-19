/**
 * No colour in a product's title, ever (asked 2026-10-20, "even if a brand's website does it").
 *
 * The colour is the Colour option on each variant. A title that carries one — "Boot Backpack 50L
 * Black", "Heli Pro 20L - Night Sky Oxford", "Mission 25L (Black)" — names one variant, and the
 * other colours end up under a name that is wrong for them. Two ways a colour gets in:
 *
 *  - the order's or the page's own colour for the product, wherever it sits in the name;
 *  - a colour after a dash, a bar, a comma or in brackets on the end, as a shop's page writes it,
 *    told by its words: black, white, navy, heather grey and the like.
 *
 * A bare colour word inside a model's name is left alone ("Black Pearl 88", "Blackops", "Gray
 * Wolf"): only a whole known colour, or a colour after a separator, comes off.
 */

const COLOUR_WORD = new Set([
  "black", "white", "grey", "gray", "blue", "navy", "red", "green", "olive", "yellow", "orange", "pink", "purple",
  "violet", "brown", "tan", "beige", "khaki", "camo", "camouflage", "charcoal", "silver", "gold", "teal", "turquoise",
  "burgundy", "maroon", "cream", "ivory", "multi", "multicolour", "multicolor", "print", "floral", "coral", "mint",
  "lime", "aqua", "cyan", "magenta", "lilac", "lavender", "plum", "rust", "copper", "bronze", "sand", "stone", "slate",
  "ash", "smoke", "sage", "forest", "moss", "pine", "ocean", "sky", "night", "midnight", "ink", "steel", "graphite",
  "carbon", "onyx", "jet", "chocolate", "coffee", "mocha", "taupe", "fawn", "wine", "berry", "cherry", "rose",
  "blush", "peach", "apricot", "mustard", "ochre", "denim", "indigo", "cobalt", "royal", "emerald", "jade",
  "light", "dark", "deep", "pale", "bright", "heather", "matte", "matt", "gloss", "glossy", "metallic", "neon",
  "pastel", "washed", "faded", "tie", "dye", "stripe", "striped", "check", "plaid", "solid", "colour", "color",
  "blk", "wht", "gry", "nvy", "grn", "blu",
]);

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A phrase made of nothing but colour words: "Heather Grey", "Black/White", "Dark Navy". */
export function isColourPhrase(phrase: string): boolean {
  const w = words(phrase);
  return w.length > 0 && w.every((x) => COLOUR_WORD.has(x));
}

/**
 * The title with its colour taken out. `colours` are the product's own colour values, from the
 * order or the page; any of them found whole in the name comes off, as does a colour on the end
 * after a separator. A title that would be left with no name keeps what it had.
 */
export function withoutColour(title: string, colours: Array<string | null | undefined> = []): string {
  const original = title.replace(/\s+/g, " ").trim();
  let name = original;
  // The product's own colours, longest first so "Black/Grey" goes before "Black". Only colours
  // with letters in them, and of more than two: "BK" or "01" could be part of any model's code.
  const own = [...new Set(colours.map((c) => (c ?? "").replace(/\s+/g, " ").trim()).filter((c) => c.length > 2 && /[a-z]/i.test(c)))]
    .sort((a, b) => b.length - a.length);
  for (const c of own) {
    const re = new RegExp(`(^|[\\s(\\[,/|–—-])${escape(c).replace(/\s*\/\s*|\s+/g, "[\\s/]+")}(?=$|[\\s)\\],/|–—-])`, "gi");
    name = name.replace(re, "$1");
  }
  // A colour after a separator on the end: " - Black", " | Night Sky", ", Navy", " (Black)", " / Black".
  for (let i = 0; i < 3; i++) {
    const tail = /(?:\s+[-–—|/]\s*|\s*,\s*|\s*[([]\s*)([^-–—|/,()[\]]+?)\s*[)\]]?\s*$/.exec(name);
    if (!tail || !isColourPhrase(tail[1])) break;
    name = name.slice(0, tail.index);
  }
  // A colour the order spells out after the model, "Heli Pro 20L Black" with Black as the colour,
  // is gone above; left-over brackets and separators are tidied away.
  name = name
    .replace(/\(\s*\)|\[\s*\]/g, " ")
    .replace(/\s*[-–—|/,]\s*$/g, "")
    .replace(/^\s*[-–—|/,]\s*/g, "")
    .replace(/\s*[-–—|/]\s*(?=[-–—|/])/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return /[a-z]/i.test(name) && name.length >= 2 ? name : original;
}
