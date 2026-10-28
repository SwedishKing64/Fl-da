/**
 * Simulated shops: a trade, a shop in it with the products it already lists, and the suppliers it
 * buys from, each with a range to order from. Everything is made up and made the same way every
 * time from a seed, so Flöda can be run against many shops it has never seen without a single real
 * invoice — and a change can be scored on the same shops before and after.
 *
 * What a world gives is the truth the documents are then rendered from (sim/documents.ts): every
 * line's code, barcode, size, colour, cost and RRP are known, so what the reader and the build
 * make of them can be checked exactly (sim/score-build.ts).
 */

import { generateCsv, type CsvProduct } from "../csv";
import { slugify } from "../handle";
import { Rng } from "./rng";
import type { KindSpec, TradeWorld } from "./world-types";
import { SNOW_WORLD } from "../trades/snow/sim-world";

export type { KindSpec, OptionSpec, TradeWorld } from "./world-types";

const LETTER_SIZES = ["XS", "S", "M", "L", "XL"];
const COLOURS = ["Black", "Navy", "Forest", "Clay", "Sand", "Slate", "Ochre", "Teal"];

export const BIKE_WORLD: TradeWorld = {
  id: "bike",
  pack: "bike",
  name: "a bike shop",
  shopNames: ["Spoke & Chain", "Crankhouse Cycles", "Velo North"],
  brands: ["Northline", "Ardent", "Cadence", "Ironbark", "Loft"],
  kinds: [
    { type: "Hardtail Mountain Bikes", prefix: "HT", nouns: ["Ridgeline", "Talon", "Grit", "Summit"], suffixes: ["29", "29 Deore", "27.5 SX"], options: [{ name: "Colour", values: ["Gloss Black", "Satin Sage", "Burnt Orange"] }, { name: "Size", values: ["S", "M", "L", "XL"] }], cost: [620, 1450], markup: 1.85, tags: ["mountain-bikes", "bikes"] },
    { type: "Road Bikes", prefix: "RD", nouns: ["Tempo", "Allegro", "Meridian"], suffixes: ["105", "Ultegra", "Tiagra"], options: [{ name: "Colour", values: ["Pearl White", "Deep Red"] }, { name: "Size", values: ["52", "54", "56", "58"] }], cost: [1100, 2400], markup: 1.8, tags: ["road-bikes", "bikes"] },
    { type: "Helmets", prefix: "HL", nouns: ["Aero", "Trail", "Commute"], suffixes: ["MIPS", "Lite", "Pro"], options: [{ name: "Colour", values: ["Matte Black", "White", "Hi-Vis Yellow"] }, { name: "Size", values: ["S", "M", "L"] }], cost: [60, 140], markup: 2.1, tags: ["helmets", "accessories"] },
    { type: "Cycling Jerseys", prefix: "JS", nouns: ["Climb", "Fondo", "Echelon"], suffixes: ["Jersey", "Short Sleeve Jersey"], options: [{ name: "Colour", values: COLOURS.slice(0, 4) }, { name: "Size", values: LETTER_SIZES }], cost: [38, 70], markup: 2.3, gendered: true, tags: ["jerseys", "clothing"] },
    { type: "Tyres", prefix: "TY", nouns: ["Grip", "Rush", "Tread"], suffixes: ["29 x 2.4", "700 x 28c", "27.5 x 2.6"], options: [], cost: [28, 55], markup: 2.0, tags: ["tyres", "parts"] },
  ],
};

export const OUTDOOR_WORLD: TradeWorld = {
  id: "outdoor",
  pack: "outdoor",
  name: "a hiking and camping shop",
  shopNames: ["Trailhead Outfitters", "Summit & Co", "Wild Country Supply"],
  brands: ["Fellside", "Tarn", "Osgood", "Highland Gear", "Wren"],
  kinds: [
    { type: "Down Jackets", prefix: "DJ", nouns: ["Cirrus", "Nimbus", "Ember"], suffixes: ["Down Jacket", "Hooded Down Jacket"], options: [{ name: "Colour", values: COLOURS.slice(0, 5) }, { name: "Size", values: LETTER_SIZES }], cost: [95, 210], markup: 2.2, gendered: true, tags: ["jackets", "clothing"] },
    { type: "Hiking Boots", prefix: "HB", nouns: ["Ridgeline", "Canyon", "Moor"], suffixes: ["Mid GTX", "Low", "Mid Waterproof"], options: [{ name: "Colour", values: ["Walnut", "Black", "Olive"] }, { name: "Size", values: ["US 7", "US 8", "US 8.5", "US 9", "US 9.5", "US 10", "US 11"] }], cost: [90, 160], markup: 2.1, gendered: true, tags: ["footwear", "boots"] },
    { type: "Backpacks", prefix: "PK", nouns: ["Atlas", "Kestrel", "Talon"], suffixes: ["Trek Pack", "Day Pack"], options: [{ name: "Colour", values: ["Black", "Moss", "Rust"] }, { name: "Size", values: ["S/M", "M/L"] }], cost: [110, 240], markup: 2.0, tags: ["packs", "backpacks"] },
    { type: "Tents", prefix: "TN", nouns: ["Copper", "Hubba", "Ridge"], suffixes: ["2P", "3P", "2P Lightweight"], options: [], cost: [220, 480], markup: 1.9, tags: ["tents", "camping"] },
    { type: "Sleeping Bags", prefix: "SL", nouns: ["Aurora", "Trestle", "Hyperion"], suffixes: ["-5", "0", "+5"], options: [{ name: "Size", values: ["Regular", "Long"] }], cost: [120, 320], markup: 2.0, tags: ["sleeping-bags", "camping"] },
  ],
};

export const SURF_WORLD: TradeWorld = {
  id: "surf",
  pack: "general",
  name: "a surf shop",
  shopNames: ["Southside Surf", "Point Break Boardstore", "Saltwater Co"],
  brands: ["Driftwood", "Rincon", "Tidal", "Breakline"],
  kinds: [
    { type: "Wetsuits", prefix: "WS", nouns: ["Furnace", "Flashbomb", "Syncro"], suffixes: ["4/3 Chest Zip Steamer", "3/2 Back Zip Steamer", "2mm Spring Suit"], options: [{ name: "Colour", values: ["Black", "Black/Teal"] }, { name: "Size", values: ["S", "MS", "M", "MT", "L", "XL"] }], cost: [140, 290], markup: 2.1, gendered: true, tags: ["wetsuits"] },
    { type: "Surfboards", prefix: "SF", nouns: ["Seaside", "Lost", "Twin Pin"], suffixes: ["Fish", "Shortboard", "Mid Length"], options: [{ name: "Length", values: ["5'8", "5'10", "6'0", "6'2", "7'0"] }], cost: [480, 760], markup: 1.75, tags: ["surfboards"] },
    { type: "Boardshorts", prefix: "BS", nouns: ["Mirage", "Phantom", "Hyperfreak"], suffixes: ["Boardshort 18\"", "Boardshort 20\""], options: [{ name: "Colour", values: ["Navy", "Charcoal", "Coral"] }, { name: "Size", values: ["28", "30", "32", "34", "36"] }], cost: [32, 58], markup: 2.4, tags: ["boardshorts", "clothing"] },
    { type: "Leashes", prefix: "LS", nouns: ["Comp", "Regular", "Big Wave"], suffixes: ["Leash"], options: [{ name: "Length", values: ["6'", "7'", "8'"] }], cost: [14, 26], markup: 2.3, tags: ["leashes", "accessories"] },
  ],
};

export const GENERAL_WORLD: TradeWorld = {
  id: "general",
  pack: "general",
  name: "a homewares and gift shop",
  shopNames: ["Hearth & Home", "The Corner Store", "Maple Lane Gifts"],
  brands: ["Linden", "Stoneware Co", "Burrow", "Marlow"],
  kinds: [
    { type: "Mugs", prefix: "MG", nouns: ["Stoneware", "Speckle", "Ripple"], suffixes: ["Mug", "Mug Set of 4"], options: [{ name: "Colour", values: ["Oat", "Charcoal", "Sage"] }], cost: [8, 24], markup: 2.5, tags: ["mugs", "kitchen"] },
    { type: "Candles", prefix: "CD", nouns: ["Soy", "Beeswax", "Coconut"], suffixes: ["Candle", "Candle Tin", "3-Wick Candle"], options: [{ name: "Scent", values: ["Fig & Cedar", "Sea Salt", "Lavender"] }], cost: [9, 22], markup: 2.6, tags: ["candles", "home"] },
    { type: "T-Shirts", prefix: "TS", nouns: ["Organic Crew", "Pocket", "Heavyweight"], suffixes: ["Tee"], options: [{ name: "Colour", values: COLOURS.slice(0, 4) }, { name: "Size", values: LETTER_SIZES }], cost: [11, 19], markup: 3.2, tags: ["tees", "clothing"] },
    { type: "Water Bottles", prefix: "WB", nouns: ["Insulated", "Classic"], suffixes: ["Bottle"], options: [{ name: "Colour", values: ["Mint", "Black", "Blush"] }, { name: "Capacity", values: ["500ml", "750ml", "1L"] }], cost: [12, 24], markup: 2.4, tags: ["bottles", "kitchen"] },
  ],
};

export const WORLDS: Record<string, TradeWorld> = {
  bike: BIKE_WORLD,
  outdoor: OUTDOOR_WORLD,
  snow: SNOW_WORLD,
  surf: SURF_WORLD,
  general: GENERAL_WORLD,
};

export const TRADES = Object.keys(WORLDS);

export interface Variant {
  sku: string;
  barcode: string;
  /** Option name → value, in the kind's option order. */
  options: Record<string, string>;
  cost: number;
  rrp: number;
}

export interface Model {
  brand: string;
  /** The model's name alone: "Ridgeline 29 Deore". */
  name: string;
  /** Men's or Women's, where the kind is gendered. */
  gender: "" | "Men's" | "Women's";
  kind: KindSpec;
  season: number;
  /** The supplier's code for the model as a whole. */
  code: string;
  variants: Variant[];
}

export interface Supplier {
  brand: string;
  range: Model[];
}

export interface Shop {
  name: string;
  trade: TradeWorld;
  pack: string;
  seed: number;
  /** What the shop already lists, as its export shows. */
  listed: Model[];
  suppliers: Supplier[];
}

/** An EAN-13 that passes its check digit, from a 930 prefix (Australia). */
export function ean13(rng: Rng): string {
  let digits = "930";
  while (digits.length < 12) digits += String(rng.int(0, 9));
  const sum = digits.split("").reduce((n, d, i) => n + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return digits + String((10 - (sum % 10)) % 10);
}

/** A colour's code, as suppliers abbreviate them: Gloss Black → GBK, Navy → NVY. */
export function colourCode(colour: string): string {
  const words = colour.replace(/[^A-Za-z ]/g, " ").trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1].replace(/[aeiou]/gi, "").slice(0, 2)).toUpperCase();
  return words[0].replace(/[aeiou]/gi, "").slice(0, 3).toUpperCase().padEnd(3, words[0][0].toUpperCase());
}

/** A size's code: letters as they are, "US 8.5" as 085, "158W" as 158W. */
export function sizeCode(size: string): string {
  return size.replace(/^(US|EU|UK)\s*/i, "").replace(/\./g, "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

const price95 = (n: number): number => Math.max(4.95, Math.round(n) - 0.05);

function makeModel(rng: Rng, brand: string, kind: KindSpec, season: number, gender: Model["gender"], name: string, usedCodes: Set<string>): Model {
  let code = "";
  while (!code || usedCodes.has(code)) code = `${kind.prefix}${season % 100}${String(rng.int(10, 99))}${gender === "Women's" ? "W" : ""}`;
  usedCodes.add(code);
  const cost = rng.int(kind.cost[0], kind.cost[1]);
  const rrp = price95(cost * kind.markup);
  // Every combination of the kind's options the model comes in: a subset of colours, every size.
  const colours = kind.options.find((o) => o.name === "Colour");
  const others = kind.options.filter((o) => o.name !== "Colour");
  const colourValues = colours ? rng.some(colours.values, 1, 3) : [""];
  const combos: Array<Record<string, string>> = [];
  const expand = (at: number, so: Record<string, string>) => {
    if (at === others.length) { combos.push(so); return; }
    for (const v of others[at].values) expand(at + 1, { ...so, [others[at].name]: v });
  };
  for (const c of colourValues) expand(0, c ? { Colour: c } : {});
  const variants: Variant[] = combos.map((options) => ({
    sku: [code, options.Colour ? colourCode(options.Colour) : "", ...others.map((o) => sizeCode(options[o.name]))].filter(Boolean).join("-"),
    barcode: ean13(rng),
    options,
    cost,
    rrp,
  }));
  return { brand, name, gender, kind, season, code, variants };
}

/** A shop of a trade, from a seed. The same seed is always the same shop. */
export function makeShop(tradeId: string, seed: number): Shop {
  const trade = WORLDS[tradeId];
  if (!trade) throw new Error(`No simulated trade called ${tradeId}. There are: ${TRADES.join(", ")}.`);
  const rng = new Rng(seed * 7919 + tradeId.length);
  const name = rng.pick(trade.shopNames);
  const brands = rng.some(trade.brands, 3, 4);
  // No two models in the shop share a name or a code, whoever makes them: a distributor's invoice
  // mixes brands, and two brands with one code would be one SKU twice.
  const used = new Set<string>();
  const usedCodes = new Set<string>();
  const suppliers: Supplier[] = brands.map((brand) => {
    const range: Model[] = [];
    for (const kind of rng.some(trade.kinds, Math.min(2, trade.kinds.length), trade.kinds.length)) {
      // The names still free for this kind, a few of them: a model is a noun and a suffix.
      const free = rng.shuffle(kind.nouns.flatMap((n) => kind.suffixes.map((x) => `${n} ${x}`.trim()))).filter((n) => !used.has(n)).slice(0, rng.int(2, 4));
      for (const name of free) {
        used.add(name);
        if (kind.gendered) {
          for (const gender of ["Men's", "Women's"] as const) range.push(makeModel(rng, brand, kind, 2027, gender, name, usedCodes));
        } else range.push(makeModel(rng, brand, kind, 2027, "", name, usedCodes));
      }
    }
    return { brand, range };
  }).filter((s) => s.range.length > 0);
  // The shop lists most of each supplier's range already, as last season's products.
  const listed = suppliers.flatMap((s) => s.range.filter(() => rng.chance(0.6)).map((m) => ({ ...m, season: 2026, code: m.code.replace(/^([A-Z]+)27/, "$126"), variants: m.variants.map((v) => ({ ...v, sku: v.sku.replace(/^([A-Z]+)27/, "$126"), barcode: ean13(rng) })) })));
  return { name, trade, pack: trade.pack, seed, listed, suppliers };
}

/** A listing's title, the way this shop writes it: brand, who it is for, model, year. */
export function listedTitle(m: Model): string {
  return [m.brand, m.gender, m.name, String(m.season)].filter(Boolean).join(" ");
}

export function listedHandle(m: Model): string {
  return slugify(listedTitle(m));
}

/** The shop's Shopify product export, as the app reads one at setup and on Prices and stock. */
export function shopExportCsv(shop: Shop): string {
  const products: CsvProduct[] = shop.listed.map((m) => {
    const optionNames = m.kind.options.map((o) => o.name);
    return {
      handle: listedHandle(m),
      title: listedTitle(m),
      bodyHtml: `<p>The ${m.name} from ${m.brand}.</p>`,
      vendor: m.brand,
      productType: m.kind.type,
      tags: [...m.kind.tags, String(m.season), m.brand.toLowerCase().replace(/\s+/g, "-"), ...(m.gender ? [m.gender === "Men's" ? "mens" : "womens"] : [])],
      published: true,
      status: "active",
      option1Name: optionNames[0] ?? null,
      option2Name: optionNames[1] ?? null,
      option3Name: optionNames[2] ?? null,
      images: [],
      variants: m.variants.map((v) => ({
        sku: v.sku,
        barcode: v.barcode,
        option1Value: optionNames[0] ? v.options[optionNames[0]] : null,
        option2Value: optionNames[1] ? v.options[optionNames[1]] : null,
        option3Value: optionNames[2] ? v.options[optionNames[2]] : null,
        price: v.rrp,
        quantity: 2,
        costPerItem: v.cost,
      })),
    };
  });
  return generateCsv(products);
}

export interface DeliveryLine {
  model: Model;
  variant: Variant;
  quantity: number;
}

export interface Delivery {
  /** The suppliers whose goods these are: one, or several for a distributor's invoice. */
  suppliers: Supplier[];
  invoiceNumber: string;
  date: string;
  lines: DeliveryLine[];
  freight: number;
}

/**
 * What a supplier sends: a few of its models, some sizes of each. Some models the shop already lists
 * (a reorder), some are new to it.
 */
export function makeDelivery(shop: Shop, suppliers: Supplier[], rng: Rng, models = rng.int(3, 6)): Delivery {
  const lines: DeliveryLine[] = [];
  const perSupplier = Math.max(1, Math.round(models / suppliers.length));
  for (const supplier of suppliers) {
    for (const model of rng.some(supplier.range, Math.min(perSupplier, supplier.range.length), Math.min(perSupplier, supplier.range.length))) {
      for (const variant of rng.some(model.variants, 1, Math.min(4, model.variants.length))) lines.push({ model, variant, quantity: rng.int(1, 4) });
    }
  }
  return { suppliers, invoiceNumber: String(rng.int(10000, 99999)), date: `2027-0${rng.int(1, 9)}-${String(rng.int(10, 28))}`, lines, freight: rng.int(0, 4) * 25 };
}
