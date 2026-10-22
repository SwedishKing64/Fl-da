/**
 * The snow-and-outdoor trade: the menu, tag spellings and rules of the ski shop Flöda was built in,
 * transcribed from its live site and exports. A shop that sells skis, snowboards and outdoor gear
 * can start from it; its own store then overrides whatever it disagrees with.
 */

import type { TaxonomySection } from "../taxonomy";
import { LIVE_TAG_SPELLING, TAG_ALSO } from "../tag-spelling";
import type { TradePack } from "./types";

export const SNOW_OUTDOOR_TAXONOMY: TaxonomySection[] = [
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
      // "Helmets", "Gloves" and "Mitts" are here as well as under Snowboard Accessories because
      // that is where the shop files them: every snow helmet, all 27 goggles and 127 of 129 pairs
      // of gloves in their exports are typed Ski Accessories. See PREFERS_SKI in headingsFor.
      { heading: "Ski Accessories", leaves: ["Goggles", "Ski Helmets", "Helmets", "Ski Gloves", "Gloves", "Mitts", "Ski Poles", "Ski & Boot Bags", "Ski Tuning", "Other Ski Accessories"] },
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

export const SNOW_OUTDOOR_PACK: TradePack = {
  id: "snow-outdoor",
  name: "Snow and outdoor",
  sells: "Skis, snowboards, boots and bindings, snow clothing and outdoor gear",
  tree: SNOW_OUTDOOR_TAXONOMY,
  tagSpelling: LIVE_TAG_SPELLING,
  tagAlso: TAG_ALSO,
  readerExamples: [
    "A ski order line \"SN2701 FREERIDE 104 | 165 | 1 | W/S 560.00 | RRP 1199.00\" reads as title Freeride 104, length 165, quantity 1, cost 560, rrp 1199.",
    "A binding line under a ski line, bracketed with it in pen, is a package: the ski's code in sku and the binding named in notes.",
    "A boot line \"BT2610 PRO 110 | 26.5 x1 | 27.5 x1\" is two lines: size 26.5 and size 27.5, quantity 1 each.",
  ],
  seeds: true,
  snowRules: true,
};
