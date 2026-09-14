/**
 * The alpsport.com.au navigation, which is what decides where a product lives on the site.
 *
 * Two levels matter. The **heading** (the bold column title in a drop-down, e.g. "Snowboard Boots")
 * is what goes in the Shopify `Type` column. The **leaf** beneath it ("Mens Boots", "Womens Boots")
 * is reached by combining that Type with tags, which is how the live catalogue is built: every
 * Snowboard Boots product carries a `mens`, `womens` or `kids` tag, and many also carry a
 * slug-style tag naming the leaf outright.
 *
 * Transcribed from the live menus. Treat this file as the vocabulary: a Type that is not a heading
 * here is a Type that has nowhere to live on the website.
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

/** Every valid value for the Shopify `Type` column, in menu order. */
export const PRODUCT_TYPES: string[] = ALPSPORT_TAXONOMY.flatMap((s) => s.groups.map((g) => g.heading));

/** heading → the top-level menu it sits under. */
export const TYPE_SECTION: Record<string, string> = Object.fromEntries(
  ALPSPORT_TAXONOMY.flatMap((s) => s.groups.map((g) => [g.heading, s.top] as const)),
);

/** heading → its leaves. */
export const TYPE_LEAVES: Record<string, string[]> = Object.fromEntries(
  ALPSPORT_TAXONOMY.flatMap((s) => s.groups.map((g) => [g.heading, g.leaves] as const)),
);

const norm = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Spellings that appear in the existing catalogue but not in the menu. The site hyphenates
 * "Back-Country" in one place and not another, so both have to resolve.
 */
const ALIASES: Record<string, string> = {
  "back country gear": "Backcountry Gear",
  "backcountry gear": "Backcountry Gear",
  "snowboard boot": "Snowboard Boots",
  "ski boot": "Ski Boots",
  "snowboard": "Snowboards",
  "ski": "Skis",
};

/** Resolve a written type to the exact menu heading, or undefined when it is not in the menu. */
export function resolveType(value: string): string | undefined {
  const want = norm(value);
  if (!want) return undefined;
  const exact = PRODUCT_TYPES.find((t) => norm(t) === want);
  if (exact) return exact;
  return ALIASES[want];
}

/** True when this is a heading a product can legitimately be filed under. */
export function isValidType(value: string): boolean {
  return resolveType(value) !== undefined;
}
