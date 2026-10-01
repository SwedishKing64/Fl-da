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
  JK: "JACKET", JKT: "JACKET",
  PT: "PANTS", PNT: "PANTS",
  GL: "GLOVES", GLV: "GLOVES",
  MT: "MITTS", MTT: "MITTS",
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
};

export function expandShorthand(title: string): string {
  const text = title.trim().replace(/\s+/g, " ");
  if (!text || /[a-z]/.test(text)) return text;
  const words = text.split(" ").map((w) => SHORTHAND[w] ?? w);
  // "STEP ON SO" says Step On twice.
  const out: string[] = [];
  for (const w of words.join(" ").split(" ")) {
    const n = out.length;
    if (w === "ON" && out[n - 1] === "STEP" && out[n - 2] === "ON" && out[n - 3] === "STEP") { out.pop(); continue; }
    out.push(w);
  }
  return out.join(" ");
}
