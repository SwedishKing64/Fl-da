/**
 * Each kind of product the snow-and-outdoor and outdoor packs know, placed in Shopify's Standard
 * Product Taxonomy (release 2026-08) by hand. Found by name alone, gloves landed among sports
 * collectibles and hiking packs among bum bags; a pack knows its kinds, so it says where each goes.
 *
 * Shelves with the same name in two places ("Mens Boots" under both Ski Boots and Snowboard Boots)
 * are left out: a product carries its heading as its Type, and the heading is placed.
 */
export const SNOW_OUTDOOR_CATEGORIES: Record<string, string> = {
  // Clothing
  "Mens Clothing": "aa-1", "Womens Clothing": "aa-1", "Kids Clothing": "aa-1", "Snow Clothing": "aa-1", "Outdoor Clothing": "aa-1",
  "Down Jackets": "aa-1-10-2-9", "Synthetic Insulation": "aa-1-10-2-9", "Rainwear": "aa-1-10-2-10", "Snow Jackets": "aa-1-10-2",
  "Snow Pants": "aa-1-10-5-3", "Midlayers": "aa-1-1-2", "Baselayers": "aa-1-1-2-4", "Socks": "aa-1-18", "Snow Socks": "aa-1-18-14",
  "Hiking Socks": "aa-1-18-2", "Headwear": "aa-2-17-16", "Streetwear": "aa-1", "Pants & Shorts": "aa-1-12", "Shirts": "aa-1-13-7",
  "Clothing Accessories": "aa-2", "Gloves": "aa-2-13", "Hats": "aa-2-17", "Gaiters": "aa-7-2",
  // Ski
  "Skis": "sg-4-17-2-13-2", "Mens Skis": "sg-4-17-2-13-2", "Womens Skis": "sg-4-17-2-13-2", "Kids Skis": "sg-4-17-2-13-2", "Ski Packages": "sg-4-17-2-13-2",
  "Ski Categories": "sg-4-17-2-13", "Frontside & All-Mountain Skis": "sg-4-17-2-13-2", "Carving Skis": "sg-4-17-2-13-2", "Freeride & Powder Skis": "sg-4-17-2-13-2",
  "Park & Twin Tip Skis": "sg-4-17-2-13-2", "Race Skis": "sg-4-17-2-13-2", "Mogul Skis": "sg-4-17-2-13-2", "Touring Skis": "sg-4-17-2-13-3",
  "Ski Boots": "sg-4-17-2-11", "Alpine Boots": "sg-4-17-2-11", "Race Boots": "sg-4-17-2-11", "Touring Boots": "sg-4-17-2-11",
  "Ski Bindings": "sg-4-17-2-10", "Alpine Bindings": "sg-4-17-2-10-1", "Touring Bindings": "sg-4-17-2-10-2",
  "Ski Accessories": "sg-4-17-2", "Goggles": "sg-4-17-2-3", "Ski Helmets": "sg-4-17-2-4", "Helmets": "sg-4-17-2-4", "Ski Gloves": "aa-2-13", "Mitts": "aa-2-13",
  "Ski Poles": "sg-4-17-2-12", "Ski & Boot Bags": "sg-4-17-2-1", "Ski Tuning": "sg-4-17-2-7", "Other Ski Accessories": "sg-4-17-2",
  // Snowboard
  "Snowboards": "sg-4-17-2-17", "Mens Snowboards": "sg-4-17-2-17", "Womens Snowboards": "sg-4-17-2-17", "Kids Snowboards": "sg-4-17-2-17", "Snowboard Packages": "sg-4-17-2-17",
  "Snowboard Categories": "sg-4-17-2-17", "Freestyle & All-Mountain Boards": "sg-4-17-2-17", "Freeride & Powder Boards": "sg-4-17-2-17", "Park Boards": "sg-4-17-2-17",
  "Snowboard Boots": "sg-4-17-2-16", "Snowboard Bindings": "sg-4-17-2-15", "Mens Bindings": "sg-4-17-2-15", "Womens Bindings": "sg-4-17-2-15", "Kids Bindings": "sg-4-17-2-15",
  "Snowboard Accessories": "sg-4-17-2", "Body Protection": "sg-4-17-2", "Snowboard Bags": "sg-4-17-2-1-1", "Snowboard Tuning": "sg-4-17-2-7", "Other Snowboard Accessories": "sg-4-17-2",
  // Backcountry
  "Alpine Touring": "sg-4-17-2", "Alpine Touring Skis": "sg-4-17-2-13-3", "Alpine Touring Bindings": "sg-4-17-2-10-2", "Alpine Touring Boots": "sg-4-17-2-11",
  "Skins": "sg-4-17-2-18", "Climbing Skins": "sg-4-17-2-18", "Alpine Touring Accessories": "sg-4-17-2",
  "Cross-Country Skiing": "sg-4-17-2", "Cross-Country Skis": "sg-4-17-2-13-1", "Cross-Country Bindings": "sg-4-17-2-10-3", "Cross-Country Boots": "sg-4-17-2-11",
  "Cross-Country Poles": "sg-4-17-2-12", "Cross-Country Accessories": "sg-4-17-2",
  "Backcountry Gear": "sg-4-17", "Avalanche Equipment": "sg-4-17-1", "Avalanche Gear": "sg-4-17-1", "Snow Packs": "sg-4-17-2-1-4", "Ice Tools": "sg-4-3-13",
  "Other Back-Country Gear": "sg-4-17", "Snow Shovels and Ice Tools": "sg-4-17-1-4", "Beacons and Probes": "sg-4-17-1-6",
  // Outdoor
  "Tents": "sg-4-2-17", "1 Person Tents": "sg-4-2-17", "2 Person Tents": "sg-4-2-17", "3+ Person Tents": "sg-4-2-17", "Ultralight Tents": "sg-4-2-17", "Winter Tents": "sg-4-2-17",
  "Tarps & Bivies": "sg-4-2-16-8", "Tent Accessories & Spares": "sg-4-2-16",
  "Sleeping Bags": "sg-4-2-14", "Down Sleeping Bags": "sg-4-2-14", "Synthetic Sleeping Bags": "sg-4-2-14", "Sleeping Bag Accessories": "sg-4-2-13", "Sleeping Bag Cleaning & Servicing": "sg-4-2",
  "Sleeping Mats": "sg-4-2-15", "Air Mats": "sg-4-2-15", "Self-Inflating Mats": "sg-4-2-15", "Closed Cell Foam Mats": "sg-4-2-15", "Winter Mats": "sg-4-2-15", "Sleeping Mat Accessories": "sg-4-2-1-1",
  "Packs & Bags": "lb-1", "Daypacks": "lb-1", "Hiking Packs": "lb-1-15", "Hydration Packs": "sg-4-10-5", "Travel Packs": "lb-1", "Duffels": "lb-6",
  "Climbing & Abseiling": "sg-4-3", "Ropes and Cords": "sg-4-3-10", "Climbing Helmets": "sg-4-3-3-2", "Climbing Harnesses": "sg-4-3-8", "Climbing Shoes": "sg-4-3-3-4",
  "Carabiners and Quickdraws": "sg-4-3-2", "Belay Devices": "sg-4-3-1", "Ascenders & Descenders": "sg-4-3-4", "Climbing Accessories": "sg-4-3",
  "Footwear": "aa-8", "Hiking Boots": "aa-8-3", "Trail Shoes": "aa-8-1", "Travel Shoes": "aa-8", "Apres Boots": "aa-8-3",
  "Stoves & Cooking": "sg-4-2-2", "Stoves": "sg-4-2-22", "Cookware": "sg-4-2-2", "Freeze-Dried Meals": "fb-2-15", "Cooking Accessories": "sg-4-2-2",
  "Hydration": "sg-4-11", "Water Bottles": "hg-11-3-11", "Hydration Packs & Bladders": "sg-4-10-2", "Filters & Purifiers": "sg-4-2-12", "Hydration Accessories": "sg-4-10",
  "Outdoor Accessories": "sg-4-2", "Trekking Poles": "sg-4-2-8", "Compasses and GPS": "sg-4-2-10", "Maps": "sg-4-2-21", "Multitools": "sg-4-2-4-8",
  "Storage & Compression Sacks": "sg-4-2-6", "Torches & Lighting": "sg-4-2-3", "Other Outdoor Accessories": "sg-4-2",
};
