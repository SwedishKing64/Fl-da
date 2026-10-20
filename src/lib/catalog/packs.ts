/**
 * Packs: where a backpack is filed.
 *
 * The shop's Outdoor menu keeps Packs & Bags with five shelves under it — Daypacks, Hiking Packs,
 * Hydration Packs, Travel Packs, Duffels — and its forty-six Osprey packs sit on them by what they
 * are: an Exos 58 or an Atmos 65 on hiking packs, a Hikelite 26 or a Daylite on daypacks, a
 * Farpoint 40 on travel packs. An order form says none of that; Osprey's says "Exos Pro 55" and
 * the litres in the name are the tell. Forty litres and up is a pack for a trip, under it a pack
 * for a day, as the shop's own shelves have it.
 *
 * A ski bag, a boot bag or a board bag is not a pack and is left to the accessories rules. Nor is a
 * boot backpack, nor anything Dakine makes to carry things: Dakine is a snowsport brand, and the shop
 * files every Dakine bag and pack under Ski Accessories on the Ski & Boot Bags shelf (asked
 * 2026-10-20, after a Dakine Boot Backpack went out as a hiking pack). See isSnowBag.
 */

/** Brands whose bags and packs are snow gear, whatever the bag is called. */
const SNOW_BAG_BRANDS = /\bdakine\b/i;
const CARRY_WORD = /\bbags?\b|\bpacks?\b|\bbackpacks?\b|\bday ?packs?\b|\brucksacks?\b|\bduffels?\b|\bsacks?\b|\bwheelie\b|\btravel ?case\b|\broller\b/i;

const PACK_BRANDS = /\b(osprey|deuter|gregory|lowe alpine|black wolf|macpac|mountain designs)\b/i;
const SPORT_BAG = /\b(ski|skis|snowboard|board|boot|boots|binding|wheelie|double)\b[^.]{0,30}\bbags?\b|\bbags?\b[^.]{0,30}\b(ski|skis|snowboard|board|boot|boots)\b/i;
const PACK_WORD = /\bpacks?\b|\bbackpacks?\b|\bday ?packs?\b|\brucksacks?\b/i;

export type PackShelf = "Daypacks" | "Hiking Packs" | "Hydration Packs" | "Travel Packs" | "Duffels";

/** The litres in a pack's name: "Exos Pro 55", "Hikelite 26", "Atmos AG 65", "Farpoint 40L". */
export function litresOf(title: string): number | null {
  const m = /\b(\d{1,3})\s?(?:l|lt|ltr|litres?|liters?)?\b(?![\d.])/i.exec(title.replace(/\b20\d{2}\b/g, " "));
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 5 && n <= 150 ? n : null;
}

/**
 * A bag or pack that belongs with the snow gear on the Ski & Boot Bags shelf rather than on the
 * Outdoor menu: any Dakine bag or pack, and a boot or ski bag or backpack by anyone. Read from the
 * name (and the supplier's kind word), not the description, which can mention boots in passing.
 */
export function isSnowBag(brand: string, ...parts: Array<string | undefined>): boolean {
  const text = parts.filter(Boolean).join(" ");
  if (!CARRY_WORD.test(text)) return false;
  if (SNOW_BAG_BRANDS.test(brand) || SNOW_BAG_BRANDS.test(text)) return true;
  return SPORT_BAG.test(text) || /\b(ski|skis|boot|boots)\s*(back)?packs?\b/i.test(text);
}

/** Which Packs & Bags shelf this is, or null where it is not a pack at all. */
export function packShelf(brand: string, ...parts: Array<string | undefined>): PackShelf | null {
  const text = parts.filter(Boolean).join(" ");
  if (!text.trim()) return null;
  if (SPORT_BAG.test(text)) return null;
  if (isSnowBag(brand, parts[0], parts[1], parts[2])) return null;
  if (/\bduffels?\b/i.test(text)) return "Duffels";
  if (/\bhydration\b|\breservoir\b|\bbladder\b/i.test(text)) return "Hydration Packs";
  const named = PACK_WORD.test(text) || /\bpacks?\s*(&|and)\s*bags?\b/i.test(text);
  const ofBrand = PACK_BRANDS.test(brand) || PACK_BRANDS.test(text);
  if (!named && !ofBrand) return null;
  if (/\btravel\b|\bfarpoint\b|\bfairview\b|\bporter\b|\bwheeled\b|\bcarry[\s-]?on\b|\brolling\b/i.test(text)) return "Travel Packs";
  if (/\bday ?packs?\b|\bdaylite\b|\bhikelite\b/i.test(text)) return "Daypacks";
  const litres = litresOf(parts[0] ?? text);
  if (litres === null) return named ? (/\bhiking\b|\btrek/i.test(text) ? "Hiking Packs" : "Daypacks") : null;
  return litres >= 40 ? "Hiking Packs" : "Daypacks";
}
