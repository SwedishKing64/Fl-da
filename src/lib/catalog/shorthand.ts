/**
 * A supplier's shorthand, written out.
 *
 * An SAP export names a product the way the warehouse does: "M STEP ON SO", "HIGHSHOT SO", "W WKND
 * MWT 2PK SK", "M GORE DELUXE GL". The shop names the same products "Step On", "Highshot Step On",
 * "Weekend Midweight Socks (2 Pack)", "GORE-TEX Deluxe Gloves". The trailing SO on Burton's lines
 * is its Step On marker and is never part of a name — "M STEP ON SO" is the Step On binding, not
 * a "Step On So" — and the rest are the trade's usual abbreviations for a garment's kind and
 * weight, which read the same on any supplier's sheet.
 *
 * Only a name the supplier shouts is touched (a name with lower case in it was written by a
 * person), and only whole tokens: "SO" is Step On, "SOFT" is not.
 */

const SHORTHAND: Record<string, string> = {
  SO: "STEP ON",
  FP: "FOOTPRINT",
  JK: "JACKET", JKT: "JACKET",
  PT: "PANTS", PNT: "PANTS",
  GL: "GLOVES", GLV: "GLOVES",
  MT: "MITTENS", MTT: "MITTENS", MITT: "MITTENS", MITTS: "MITTENS",
  SK: "SOCKS", SOX: "SOCKS",
  BNIE: "BEANIE",
  NCKWMR: "NECK WARMER",
  "2PK": "2 PACK", "3PK": "3 PACK",
  LWT: "LIGHTWEIGHT", MWT: "MIDWEIGHT", HWT: "HEAVYWEIGHT",
  INS: "INSULATED",
  STRCH: "STRETCH",
  RLX: "RELAXED",
  PRF: "PERFORMANCE", PRFRMNC: "PERFORMANCE",
  WKND: "WEEKEND",
  RSRV: "RESERVE",
  LTHR: "LEATHER",
  FLC: "FLEECE",
  CLCH: "CLUTCH",
  XPRO: "X PRO",
  CYCLC: "CYCLIC", CYCL: "CYCLIC",
  BB: "BIB",
  // The shop writes the membrane as its maker does, and Burton's top line as Burton does.
  GORE: "GORE-TEX", GORETEX: "GORE-TEX",
  AK: "[AK]",
  HD: "HOODED", HDD: "HOODED",
};

export function expandShorthand(title: string): string {
  const said = title.trim().replace(/\s+/g, " ");
  // FP is a footprint on any supplier's invoice, shouted or not: "NEM Dagger 2P FP" is the Dagger 2P
  // Footprint (asked 2026-10-22).
  const text = /[a-z]/.test(said) ? said.replace(/\bFP\b/g, "Footprint") : said;
  if (!text || /[a-z]/.test(text)) return text;
  // "GORE TEX" is one word to the shop, and "GORE-TEX" already is.
  const words = text.replace(/\bGORE[\s-]TEX\b/g, "GORE-TEX").split(" ").map((w) => SHORTHAND[w] ?? w);
  // "STEP ON SO" says Step On twice.
  const out: string[] = [];
  for (const w of words.join(" ").split(" ")) {
    const n = out.length;
    if (w === "ON" && out[n - 1] === "STEP" && out[n - 2] === "ON" && out[n - 3] === "STEP") { out.pop(); continue; }
    out.push(w);
  }
  return out.join(" ");
}
