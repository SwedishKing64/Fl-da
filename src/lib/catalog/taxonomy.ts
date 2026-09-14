/**
 * The alpsport.com.au navigation, which is what decides where a product lives on the site.
 *
 * The Shopify `Type` column holds the most specific thing the product *is*: "Snowboard Boots",
 * "Synthetic Sleeping Bags". The drop-down menu it sits under — Clothing, Ski, Snowboard,
 * Backcountry, Outdoor — is a tag, not a Type.
 *
 * That leaves one distinction to draw, and the menu draws it for us. A sub-link that splits a
 * range by **who it is for** ("Mens Boots", "Womens Boots", "Kids Boots") is not a different kind
 * of product, so the Type stays the heading above it and the audience becomes a tag. A sub-link
 * that splits by **what the product is** ("Down Sleeping Bags" vs "Synthetic Sleeping Bags") is a
 * different kind of product, so the sub-link itself is the Type.
 *
 * Transcribed from the live menus. Treat this file as the vocabulary: a Type that is not in it is
 * a Type that has nowhere to live on the website.
 */

export interface TaxonomyGroup {
  /** The bold heading. This is the value written to the Shopify `Type` column. */
  heading: string;
  /** The links under it — where a product actually lands once tags are applied. */
  leaves: string[];
}

export interface TaxonomySection {
  /** The top-level menu item: Clothing, Ski, Snowboard, Backcountry, Outdoor. */
  top: string;
  groups: TaxonomyGroup[];
}

export const ALPSPORT_TAXONOMY: TaxonomySection[] = [
  {
    top: "Clothing",
    groups: [
      { heading: "Mens Clothing", leaves: ["Down Jackets", "Rainwear", "Snow Jackets", "Snow Pants", "Synthetic Insulation", "Midlayers", "Baselayers", "Socks"] },
      { heading: "Womens Clothing", leaves: ["Rainwear", "Snow Jackets", "Snow Pants", "Down Jackets", "Synthetic Insulation", "Midlayers", "Baselayers", "Socks"] },
      { heading: "Kids Clothing", leaves: ["Snow Jackets", "Snow Pants", "Rainwear", "Midlayers", "Baselayers"] },
      { heading: "Snow Clothing", leaves: ["Snow Jackets", "Snow Pants", "Midlayers", "Baselayers", "Headwear", "Snow Socks", "Streetwear"] },
      { heading: "Outdoor Clothing", leaves: ["Pants & Shorts", "Shirts", "Rainwear", "Down Jackets", "Midlayers", "Synthetic Insulation", "Hiking Socks"] },
      { heading: "Clothing Accessories", leaves: ["Gloves", "Hats", "Gaiters"] },
    ],
  },
  {
    top: "Ski",
    groups: [
      { heading: "Skis", leaves: ["Mens Skis", "Womens Skis", "Kids Skis", "Ski Packages"] },
      { heading: "Ski Categories", leaves: ["Frontside & All-Mountain Skis", "Carving Skis", "Freeride & Powder Skis", "Park & Twin Tip Skis", "Race Skis", "Mogul Skis", "Touring Skis"] },
      { heading: "Ski Boots", leaves: ["Mens Boots", "Womens Boots", "Kids Boots", "Alpine Boots", "Race Boots", "Touring Boots"] },
      { heading: "Ski Bindings", leaves: ["Alpine Bindings", "Touring Bindings"] },
      { heading: "Ski Accessories", leaves: ["Goggles", "Ski Helmets", "Ski Gloves", "Ski Poles", "Ski & Boot Bags", "Ski Tuning", "Other Ski Accessories"] },
    ],
  },
  {
    top: "Snowboard",
    groups: [
      { heading: "Snowboards", leaves: ["Mens Snowboards", "Womens Snowboards", "Kids Snowboards", "Snowboard Packages"] },
      { heading: "Snowboard Categories", leaves: ["Freestyle & All-Mountain Boards", "Freeride & Powder Boards", "Park Boards"] },
      { heading: "Snowboard Boots", leaves: ["Mens Boots", "Womens Boots", "Kids Boots"] },
      { heading: "Snowboard Bindings", leaves: ["Mens Bindings", "Womens Bindings", "Kids Bindings"] },
      { heading: "Snowboard Accessories", leaves: ["Goggles", "Helmets", "Gloves", "Body Protection", "Snowboard Bags", "Snowboard Tuning", "Other Snowboard Accessories"] },
    ],
  },
  {
    top: "Backcountry",
    groups: [
      { heading: "Alpine Touring", leaves: ["Alpine Touring Skis", "Alpine Touring Bindings", "Alpine Touring Boots", "Skins", "Alpine Touring Accessories"] },
      { heading: "Cross-Country Skiing", leaves: ["Cross-Country Skis", "Cross-Country Bindings", "Cross-Country Boots", "Cross-Country Poles", "Cross-Country Accessories"] },
      { heading: "Backcountry Gear", leaves: ["Avalanche Equipment", "Climbing Skins", "Snow Packs", "Ice Tools", "Other Back-Country Gear"] },
      { heading: "Avalanche Gear", leaves: ["Snow Shovels and Ice Tools", "Beacons and Probes"] },
    ],
  },
  {
    top: "Outdoor",
    groups: [
      { heading: "Tents", leaves: ["1 Person Tents", "2 Person Tents", "3+ Person Tents", "Ultralight Tents", "Winter Tents", "Tarps & Bivies", "Tent Accessories & Spares"] },
      { heading: "Sleeping Bags", leaves: ["Down Sleeping Bags", "Synthetic Sleeping Bags", "Sleeping Bag Accessories", "Sleeping Bag Cleaning & Servicing"] },
      { heading: "Sleeping Mats", leaves: ["Air Mats", "Self-Inflating Mats", "Closed Cell Foam Mats", "Winter Mats", "Sleeping Mat Accessories"] },
      { heading: "Packs & Bags", leaves: ["Daypacks", "Hiking Packs", "Hydration Packs", "Travel Packs", "Duffels"] },
      { heading: "Climbing & Abseiling", leaves: ["Ropes and Cords", "Climbing Helmets", "Climbing Harnesses", "Climbing Shoes", "Carabiners and Quickdraws", "Belay Devices", "Ascenders & Descenders", "Climbing Accessories"] },
      { heading: "Footwear", leaves: ["Hiking Boots", "Trail Shoes", "Travel Shoes", "Apres Boots", "Climbing Shoes"] },
      { heading: "Stoves & Cooking", leaves: ["Stoves", "Cookware", "Freeze-Dried Meals", "Cooking Accessories"] },
      { heading: "Hydration", leaves: ["Water Bottles", "Hydration Packs & Bladders", "Filters & Purifiers", "Hydration Accessories"] },
      { heading: "Outdoor Accessories", leaves: ["Trekking Poles", "Compasses and GPS", "Maps", "Multitools", "Storage & Compression Sacks", "Gaiters", "Torches & Lighting", "Other Outdoor Accessories"] },
    ],
  },
];

/** Top-level menu entries that hold no product types — they are merchandising, not categories. */
export const NON_TYPE_MENUS = ["Brands", "Clearance", "Rentals", "Gift Cards"] as const;

/** A sub-link that names an audience rather than a kind of product. These become tags, not Types. */
const AUDIENCE_LEAF = /^(mens|womens|women's|mens'|kids|kids'|youth|unisex)\b/i;

export function isAudienceLeaf(leaf: string): boolean {
  return AUDIENCE_LEAF.test(leaf.trim());
}

/**
 * Headings the catalogue files products directly under, keeping the heading as the Type and letting
 * the shelf ride along as a tag.
 *
 * Everywhere else the Type is the most specific thing a product is. These are the exceptions: a
 * glove is filed as "Ski Accessories" with ski-gloves as a tag, and an avalanche probe as
 * "Back-Country Gear" with beacons-and-probes as a tag. Both are what the shop's own exports do.
 */
const HEADING_TYPES = new Set(["Backcountry Gear"]);

export function isAccessoryHeading(heading: string): boolean {
  const value = heading.trim();
  return /\bAccessories$/i.test(value) || HEADING_TYPES.has(value);
}

/**
 * Clothing headings that group by who wears it rather than what the garment is for. A jacket sits
 * under Mens Clothing and under Snow Clothing; only the second says anything about the product, and
 * only the second is ever written — all seventy of the shop's snow garments are typed Snow Clothing.
 */
const AUDIENCE_HEADINGS = new Set(["Mens Clothing", "Womens Clothing", "Kids Clothing"]);

/**
 * Every valid value for the Shopify `Type` column.
 *
 * A group whose sub-links only split by audience contributes its heading ("Snowboard Boots"), and
 * so does an accessories heading. Every sub-link that names a kind of product contributes itself
 * ("Synthetic Sleeping Bags").
 */
export const PRODUCT_TYPES: string[] = (() => {
  const out: string[] = [];
  for (const section of ALPSPORT_TAXONOMY) {
    for (const group of section.groups) {
      // Every heading is a Type: all 673 typed products in the shop's exports carry one. The
      // sub-links stay resolvable too, since an invoice names them freely — they are mapped up to
      // the heading they sit under rather than written to the column.
      if (!AUDIENCE_HEADINGS.has(group.heading) && !out.includes(group.heading)) out.push(group.heading);
      for (const leaf of group.leaves.filter((l) => !isAudienceLeaf(l))) if (!out.includes(leaf)) out.push(leaf);
    }
  }
  return out;
})();

/** Type → the top-level menus it can appear under. This is what gets written as a tag. */
export const TYPE_SECTIONS: Record<string, string[]> = (() => {
  const out: Record<string, Set<string>> = {};
  const add = (type: string, top: string) => { (out[type] ??= new Set()).add(top); };
  for (const section of ALPSPORT_TAXONOMY) {
    for (const group of section.groups) {
      if (!AUDIENCE_HEADINGS.has(group.heading)) add(group.heading, section.top);
      for (const leaf of group.leaves.filter((l) => !isAudienceLeaf(l))) add(leaf, section.top);
    }
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v]]));
})();

/** Type → the group headings it sits beneath, for showing a person where a match landed. */
export const TYPE_PARENTS: Record<string, string[]> = (() => {
  const out: Record<string, Set<string>> = {};
  for (const section of ALPSPORT_TAXONOMY) {
    for (const group of section.groups) {
      for (const leaf of group.leaves) {
        if (isAudienceLeaf(leaf)) continue;
        (out[leaf] ??= new Set()).add(group.heading);
      }
    }
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v]]));
})();

/**
 * The two clothing headings that say what a garment is *for* rather than who wears it. A snow
 * jacket sits under Snow Clothing, a hiking sock under Outdoor Clothing, and the catalogue tags
 * the heading alongside the garment — Burton's snow jackets all carry snow-clothing.
 *
 * The menu settles this for all but one garment: Midlayers appears under both.
 */
export const CLOTHING_CONTEXTS = ["Snow Clothing", "Outdoor Clothing"] as const;

/** The context headings a garment sits under. Empty for one the menu does not place. */
export function clothingContextsFor(type: string): string[] {
  const resolved = resolveType(type) ?? type.trim();
  const clothing = ALPSPORT_TAXONOMY.find((s) => s.top === "Clothing");
  if (!clothing) return [];
  return clothing.groups
    .filter((g) => (CLOTHING_CONTEXTS as readonly string[]).includes(g.heading) && g.leaves.includes(resolved))
    .map((g) => g.heading);
}

/** heading → its sub-links, kept whole so the UI can show what sits under a group. */
export const TYPE_LEAVES: Record<string, string[]> = Object.fromEntries(
  ALPSPORT_TAXONOMY.flatMap((s) => s.groups.map((g) => [g.heading, g.leaves] as const)),
);

/**
 * The heading a product is filed under — which is what the Shopify `Type` column holds.
 *
 * Every one of the 673 typed products in the shop's exports carries a heading there and not one
 * carries a sub-link: a Nemo tent is typed Tents with "2 person tents" as a tag, a One Planet bag is
 * typed Sleeping Bags with "down sleeping bags" as a tag. So the sub-link a product is written
 * against is resolved up to the heading it sits beneath, and rides along as a tag.
 *
 * More than one comes back where the menu genuinely files a product in two places — Climbing Shoes
 * sits under Climbing & Abseiling and under Footwear — and then a person decides.
 */
export function headingsFor(type: string): string[] {
  const resolved = resolveType(type) ?? type.trim();
  if (TYPE_LEAVES[resolved]) return [resolved]; // it is already a heading
  return (TYPE_PARENTS[resolved] ?? []).filter((h) => !AUDIENCE_HEADINGS.has(h));
}

/**
 * The menu draws an ampersand and the catalogue spells it out, so the two have to meet: without
 * this, the shop's own Type values — "Packs and Bags", "Climbing and Abseiling" — fail to resolve
 * back to the menu headings they came from, and a product re-read from an export loses its place.
 */
const norm = (value: string) => value.trim().toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Spellings that appear in the existing catalogue but not in the menu. The site hyphenates
 * "Back-Country" in one place and not another, so both have to resolve.
 */
const ALIASES: Record<string, string> = {
  "back country gear": "Backcountry Gear",
  "backcountry gear": "Backcountry Gear",
  "snowboard boot": "Snowboard Boots",
  "ski boot": "Ski Boots",
};

/** Resolve a written type to the exact menu heading, or undefined when it is not in the menu. */
export function resolveType(value: string): string | undefined {
  const want = norm(value);
  if (!want) return undefined;
  const exact = PRODUCT_TYPES.find((t) => norm(t) === want);
  if (exact) return exact;
  return ALIASES[want];
}

/** True when this names a place a product can legitimately be filed. */
export function isValidType(value: string): boolean {
  return resolveType(value) !== undefined;
}
