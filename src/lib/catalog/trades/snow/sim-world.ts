/**
 * The snow trade as the shop simulator pretends it: made-up brands and ranges in the shapes the
 * real ones come in. See sim/world.ts for how a world is used.
 */

import type { TradeWorld } from "../../sim/world-types";

const MONDO = ["24.5", "25.5", "26.5", "27.5", "28.5"];

export const SNOW_WORLD: TradeWorld = {
  id: "snow",
  pack: "snow-outdoor",
  name: "a ski and snowboard shop",
  shopNames: ["Ridgeback Snow", "Powder Lane", "Alpine Corner"],
  brands: ["Halden", "Kestrel", "Nordvik", "Tarn Peak", "Fellside"],
  kinds: [
    { type: "Skis", prefix: "SK", nouns: ["Ridge", "Mantle", "Vector", "Summit", "Drift"], suffixes: ["88", "94", "98", "104", "Ti"], options: [{ name: "Length", values: ["158", "165", "172", "179", "186"] }], cost: [420, 680], markup: 2.05, tags: ["skis", "all-mountain"] },
    { type: "Snowboards", prefix: "SB", nouns: ["Custom", "Flight", "Process", "Deep", "Feelgood"], suffixes: ["", "Camber", "Flying V"], options: [{ name: "Length", values: ["150", "154", "156", "158W", "162W"] }], cost: [380, 620], markup: 2.0, tags: ["snowboards"] },
    { type: "Ski Boots", prefix: "BT", nouns: ["Hawk", "Panterra", "Lupo", "Cruise"], suffixes: ["90", "100", "110", "120"], options: [{ name: "Size", values: MONDO }], cost: [260, 480], markup: 1.9, tags: ["ski-boots"] },
    { type: "Snow Jackets", prefix: "JK", nouns: ["Covert", "Pillowline", "Frostner", "Cyclic"], suffixes: ["Jacket", "2L Jacket", "Insulated Jacket"], options: [{ name: "Colour", values: ["True Black", "Glacier Blue", "Clay", "Forest"] }, { name: "Size", values: ["XS", "S", "M", "L", "XL"] }], cost: [120, 260], markup: 2.2, gendered: true, tags: ["snow-jackets", "snow-clothing"] },
    { type: "Goggles", prefix: "GG", nouns: ["Flight Deck", "Line Miner", "Canopy", "Prime"], suffixes: ["", "XM", "Prizm"], options: [{ name: "Colour", values: ["Matte Black", "Dark Brush", "White"] }], cost: [95, 180], markup: 2.1, tags: ["goggles", "snow-accessories"] },
  ],
};
