/**
 * How the live catalogue spells each shelf, taken from the shop's own exports rather than guessed.
 *
 * A tag is an exact string: a product tagged snow-jackets does not appear on a page that filters on
 * "snow jackets". The shop's habit is close to a rule — a heading is hyphenated (ski-accessories,
 * snow-clothing, packs-and-bags) and a sub-link beneath it is spaced (snow jackets, hiking packs,
 * down sleeping bags) — but only close: avalanche-equipment, trekking-poles, torches-and-lighting,
 * ski-gloves and the bag family are sub-links that are hyphenated anyway. A rule would get those
 * five wrong, so what is written here is what the catalogue actually contains, with the count of
 * products carrying it. Anything absent falls back to the hyphenated slug.
 *
 * Derived from 827 products across 9 exports. Regenerate rather than edit by hand when the shop settles a spelling.
 */
export const LIVE_TAG_SPELLING: Record<string, string> = {
  "1 Person Tents": "1 person tents", // 4 of 4 in the exports
  "2 Person Tents": "2 person tents", // 9 of 9 in the exports
  "3+ Person Tents": "3 person tents", // 2 of 3 in the exports
  "Air Mats": "air mats", // 9 of 9 in the exports
  "Alpine Touring Accessories": "alpine touring accessories", // 3 of 3 in the exports
  "Ascenders & Descenders": "ascenders and descenders", // 11 of 11 in the exports
  "Backcountry Gear": "back-country-gear", // 22 of 22 in the exports
  "Beacons and Probes": "beacons and probes", // 9 of 9 in the exports
  "Belay Devices": "belay devices", // 4 of 4 in the exports
  "Body Protection": "body protection", // 16 of 16 in the exports
  "Carabiners and Quickdraws": "carabiners and quickdraws", // 6 of 6 in the exports
  "Carving Skis": "carving skis", // 24 of 24 in the exports
  "Climbing Accessories": "climbing accessories", // 10 of 10 in the exports
  "Climbing Harnesses": "climbing harnesses", // 6 of 6 in the exports
  "Climbing Helmets": "climbing helmets", // 4 of 4 in the exports
  "Climbing Skins": "climbing skins", // 2 of 2 in the exports
  "Closed Cell Foam Mats": "closed cell foam mats", // 8 of 8 in the exports
  "Cooking Accessories": "cooking accessories", // 10 of 10 in the exports
  "Down Sleeping Bags": "down sleeping bags", // 51 of 51 in the exports
  "Filters & Purifiers": "filters and purifiers", // 1 of 1 in the exports
  "Freeride & Powder Boards": "freeride and powder boards", // 12 of 12 in the exports
  "Freeride & Powder Skis": "freeride and powder skis", // 42 of 42 in the exports
  "Freestyle & All-Mountain Boards": "freestyle and all-mountain boards", // 20 of 20 in the exports
  "Frontside & All-Mountain Skis": "frontside and all-mountain skis", // 56 of 56 in the exports
  "Hiking Boots": "hiking boots", // 26 of 28 in the exports
  "Hiking Packs": "hiking packs", // 23 of 23 in the exports
  "Hydration Accessories": "hydration accessories", // 18 of 18 in the exports
  "Hydration Packs": "hydration packs", // 16 of 16 in the exports
  "Hydration Packs & Bladders": "hydration packs and bladders", // 11 of 11 in the exports
  "Ice Tools": "ice tools", // 1 of 1 in the exports
  "Mogul Skis": "mogul skis", // 2 of 2 in the exports
  "Other Back-Country Gear": "other back-country gear", // 2 of 2 in the exports
  "Other Outdoor Accessories": "other outdoor accessories", // 22 of 22 in the exports
  "Other Snowboard Accessories": "other snowboard accessories", // 16 of 16 in the exports
  "Park & Twin Tip Skis": "park and twin tip skis", // 11 of 11 in the exports
  "Park Boards": "park boards", // 12 of 12 in the exports
  "Race Skis": "race skis", // 10 of 10 in the exports
  "Ropes and Cords": "ropes and cords", // 2 of 2 in the exports
  "Self-Inflating Mats": "self-inflating  mats", // 12 of 12 in the exports
  "Ski Packages": "ski packages", // 40 of 41 in the exports
  "Ski Poles": "ski poles", // 7 of 7 in the exports
  "Ski Tuning": "ski tuning", // 100 of 100 in the exports
  "Sleeping Bag Accessories": "sleeping bag accessories", // 2 of 2 in the exports
  "Sleeping Mat Accessories": "sleeping mat accessories", // 3 of 3 in the exports
  "Snow Jackets": "snow jackets", // 24 of 24 in the exports
  "Snow Packs": "snow packs", // 4 of 4 in the exports
  "Snow Pants": "snow pants", // 22 of 22 in the exports
  "Snowboard Packages": "snowboard packages", // 14 of 14 in the exports
  "Storage & Compression Sacks": "storage and compression sacks", // 2 of 2 in the exports
  "Synthetic Sleeping Bags": "synthetic sleeping bags", // 7 of 7 in the exports
  "Touring Skis": "touring skis", // 2 of 2 in the exports
  "Trail Shoes": "trail shoes", // 24 of 24 in the exports
  "Travel Packs": "travel packs", // 2 of 2 in the exports
  "Travel Shoes": "travel shoes", // 2 of 2 in the exports
  "Ultralight Tents": "ultralight tents", // 12 of 12 in the exports
  "Water Bottles": "water bottles", // 9 of 9 in the exports
  "Winter Mats": "winter mats", // 1 of 1 in the exports
};
