/**
 * Which brand a product is, as against who sent it.
 *
 * The shop buys through distributors — Sportrade sends Völkl skis and Marker bindings on one order
 * form — and the batch is filed under the distributor. Its name was being used as the brand of
 * anything whose files did not print one, so a whole Völkl order went out as vendor "Sportrade",
 * tagged "sportrade". A distributor is not a brand, and a vendor filled in wrongly is worse than one
 * left empty for somebody to see.
 *
 * So a brand is only ever a name the trade knows as a brand, or one the shop already lists as a
 * vendor — found in the order's own tab names ("Volkl Ski", "Marker Inline 2025"), in the file's
 * name, or in the product's name.
 */

/** Brands this shop's trade deals in, spelled as the shop spells the vendor. Its own vendors are added at run time. */
const TRADE_BRANDS = [
  "Volkl", "Marker", "Dalbello", "Atomic", "Salomon", "Rossignol", "Dynastar", "Look", "Head", "Tyrolia",
  "K2", "Line", "Full Tilt", "Nordica", "Blizzard", "Tecnica", "Elan", "Fischer", "Black Crows", "Faction",
  "Armada", "Moment", "DPS", "Kastle", "Stockli", "Scott", "Dynafit", "ATK", "Fritschi", "Madshus", "Rottefella",
  "Burton", "Jones", "Nitro", "Union", "Lib Tech", "GNU", "Never Summer", "Ride", "Arbor", "Capita", "Yes",
  "Bataleon", "Rome", "Flux", "Now", "Vans", "ThirtyTwo", "DC", "Smith", "Oakley", "Giro", "POC", "Anon",
  "Sweet Protection", "Leki", "Komperdell", "Kjus", "Spyder", "Picture", "Rip Curl", "Swany", "Hestra",
  "Black Diamond", "Mammut", "Ortovox", "Pieps", "BCA", "Nemo", "Sea to Summit", "Rab", "Patagonia", "ID One",
  "Helly Hansen", "Arcteryx", "Mountain Hardwear", "Norrona", "Haglofs", "Salewa", "Deuter", "Osprey", "Gregory", "Thule",
  "Camelbak", "Hydro Flask", "Nalgene", "Jetboil", "MSR", "Big Agnes", "Therm-a-Rest", "One Planet", "Columbia", "The North Face",
  "Obermeyer", "Roxy", "Quiksilver", "Billabong", "Dakine", "Swix", "Toko", "Gerry",
];

/**
 * Who sends the goods, as against whose goods they are. The shop buys Völkl and Marker through
 * Sportrade; a vendor typed as "Sportrade" is a mistake worth refusing, while any other name a
 * person types is a decision worth keeping — a brand new to the shop is not on any list.
 */
const DISTRIBUTORS = ["Sportrade", "Sportrade Australia", "Amer Sports Australia", "Outdoor Gear Australia"];

export function isDistributor(name: string): boolean {
  const n = fold(name);
  return n !== "" && DISTRIBUTORS.some((d) => fold(d) === n);
}

const fold = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

/**
 * The first brand named in the text, as the shop spells it — the shop's own vendor spelling where it
 * has one ("Volkl", not "Völkl" or "VOLKL"). Longer names win, so "Black Crows" is not "Black".
 */
export function brandIn(text: string, vendors: string[] = []): string {
  const hay = ` ${fold(text)} `;
  if (!hay.trim()) return "";
  const byFold = new Map<string, string>();
  for (const b of TRADE_BRANDS) byFold.set(fold(b), b);
  for (const v of vendors) if (v.trim()) byFold.set(fold(v), v.trim()); // the shop's spelling wins
  const names = [...byFold.keys()].filter((k) => k.length >= 2).sort((a, b) => b.length - a.length);
  // "Line" and "Now" and "Yes" are words as well as brands: only as the WHOLE text, or first.
  const ordinary = new Set(["LINE", "NOW", "YES", "LOOK", "RIDE", "ROME", "FLUX", "UNION", "MOMENT", "HEAD"]);
  for (const name of names) {
    if (ordinary.has(name) ? !(hay.trim() === name || hay.startsWith(` ${name} `)) : !hay.includes(` ${name} `)) continue;
    return byFold.get(name) ?? "";
  }
  return "";
}

/** Whether a name is a brand: one the trade knows, or one the shop already sells under. */
export function isBrand(name: string, vendors: string[] = []): boolean {
  const n = fold(name);
  return n !== "" && [...TRADE_BRANDS, ...vendors].some((b) => fold(b) === n);
}
