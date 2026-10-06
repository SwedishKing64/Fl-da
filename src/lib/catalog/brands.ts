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

/**
 * Brands that make snowboard gear and no ski gear. Their boots are snowboard boots and their
 * bindings snowboard bindings, whatever a category rule written for ski boots makes of the word
 * "boot" — Burton's whole W26 order came out as Ski Boots and Ski Bindings.
 */
const SNOWBOARD_BRANDS = ["Burton", "Anon", "Jones", "Nitro", "Union", "Lib Tech", "GNU", "Never Summer", "Ride", "Arbor", "Capita", "Yes", "Bataleon", "Rome", "Flux", "Now", "Vans", "ThirtyTwo", "DC", "Nidecker", "Slash", "Korua", "Endeavor", "Roxy"];

export function isSnowboardBrand(name: string): boolean {
  const n = fold(name);
  return n !== "" && SNOWBOARD_BRANDS.some((b) => fold(b) === n);
}

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

/**
 * Which of an order's brands an instruction keeps, or null when it is not about that.
 *
 * Burton's confirmation carries Burton and Anon on the one sheet, and the shop does them one at a
 * time: "only Burton", "just the Burton for now", "start with Burton", "leave out Anon", "not the
 * Anon". Read against the brands actually on the order, so "only Burton" on an all-Burton order is
 * nothing to do, and a brand the order does not carry is not a filter.
 */
export function brandsAsked(instruction: string, onOrder: string[]): string[] | null {
  const t = ` ${fold(instruction)} `;
  const brands = onOrder.map((b) => b.trim()).filter(Boolean);
  if (brands.length < 2) return null;
  const KEEP = /\b(ONLY|JUST|START WITH|STARTING WITH|BEGIN WITH|FIRST|SOLELY|NOTHING BUT)\b/;
  const DROP = /\b(LEAVE OUT|LEAVE|WITHOUT|SKIP|NOT|EXCLUDE|EXCEPT|DROP|IGNORE|MINUS|THEN)\b/;
  const LATER = /\b(LATER|SEPARATELY|AFTERWARDS|AFTER|NEXT TIME|ANOTHER TIME|SECOND)\b/;
  const kept: string[] = [], dropped: string[] = [];
  // Each brand is judged by the words between it and its neighbours, so "only Burton, Anon
  // separately" does not read "separately" against Burton.
  // The brand's name on its own — "burton" — is the whole instruction: do that one.
  const alone = brands.find((b) => t.trim() === fold(b) || t.trim() === `${fold(b)} ONLY` || t.trim() === `ONLY ${fold(b)}`);
  if (alone) return [alone];
  const found = brands.map((b) => ({ b, at: t.indexOf(` ${fold(b)} `), end: t.indexOf(` ${fold(b)} `) + fold(b).length + 1 })).filter((f) => f.at >= 0).sort((x, y) => x.at - y.at);
  found.forEach((f, i) => {
    const before = t.slice(i > 0 ? found[i - 1].end : 0, f.at + 1).trim().split(" ").slice(-3).join(" ");
    const after = t.slice(f.end, i + 1 < found.length ? found[i + 1].at + 1 : undefined).trim().split(" ").slice(0, 3).join(" ");
    // What is said just before the brand decides: "only Burton", "leave out Anon"; what follows it
    // can too: "Anon separately", "Anon later", "Burton first".
    if (DROP.test(before) || LATER.test(after)) dropped.push(f.b);
    else if (KEEP.test(before) || /\b(FIRST|ONLY)\b/.test(after)) kept.push(f.b);
    // "only Burton and Anon", "leave out Anon and Burton": the second goes the way of the first.
    else if (i > 0 && /^(AND|PLUS|WITH|ALSO|OR|)$/.test(before)) (kept.includes(found[i - 1].b) ? kept : dropped.includes(found[i - 1].b) ? dropped : []).push(f.b);
  });
  if (kept.length === 0 && dropped.length === 0) return null;
  const keep = kept.length > 0 ? kept : brands.filter((b) => !dropped.includes(b));
  const out = keep.filter((b) => !dropped.includes(b));
  return out.length === 0 || out.length === brands.length ? null : out;
}

/**
 * Who a model is for when the sheet says "unisex" and the brand's own naming says otherwise.
 *
 * Anon's goggles with an S on the model — M4S, M5S, WM3 — are the women's models; the sheet calls
 * them unisex. The shop tags them womens and, as with every goggle, names them by the model.
 */
export function audienceByModel(brand: string, title: string): string {
  const name = title.trim().toUpperCase();
  if (/^anon$/i.test(brand.trim()) && /^(W?M\d+S|WM\d+)\b/.test(name)) return "Womens";
  return "";
}
