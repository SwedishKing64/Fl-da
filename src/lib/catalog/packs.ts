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
 * A ski bag, a boot bag or a board bag is not a pack and is left to the accessories rules.
 */

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

/** Which Packs & Bags shelf this is, or null where it is not a pack at all. */
export function packShelf(brand: string, ...parts: Array<string | undefined>): PackShelf | null {
  const text = parts.filter(Boolean).join(" ");
  if (!text.trim()) return null;
  if (SPORT_BAG.test(text)) return null;
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
