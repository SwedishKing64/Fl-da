/**
 * The shop this install belongs to: who it is, what it sells, and what Flöda has learned about it.
 *
 * Everything about one shop that used to be written into the code lives here as data in the
 * `AppSetting` table, under three keys:
 *
 *   shop             the profile — name, country, currency, tax, what it sells, rules pack, marker
 *   shop.vocabulary  what was learned from its Shopify export (see learn.ts)
 *   ai.key           the API key pasted into Settings, for an install whose host sets none
 *   shop.house       how it writes a listing — names, SKUs and barcodes, weights (see house.ts)
 *
 * `ensureConventions()` loads the three and puts them in force for the process: the vocabulary in
 * `taxonomy.ts`, the key in `anthropic.ts`, the retailer's description for the prompts here. It is
 * called from `requireUser`, which every page, action and route goes through, and is cheap after
 * the first call. Flöda runs one shop per install, so process-wide state is the right scope.
 */

import { prisma, parseJson } from "./db";
import { setStoredApiKey } from "./anthropic";
import { activateConventions, type LearnedVocabulary } from "./taxonomy";
import { COUNTRIES, DEFAULT_PROFILE, type ShopProfile } from "./shop";
import { cleanHouse, DEFAULT_HOUSE, type HouseConventions } from "./house";

export { COUNTRIES, DEFAULT_PROFILE, type ShopProfile } from "./shop";

const PROFILE_KEY = "shop";
const VOCABULARY_KEY = "shop.vocabulary";
const API_KEY_KEY = "ai.key";
const HOUSE_KEY = "shop.house";

export async function getShopProfile(): Promise<ShopProfile> {
  const row = await prisma.appSetting.findUnique({ where: { key: PROFILE_KEY } });
  const stored = parseJson<Partial<ShopProfile>>(row?.value, {});
  return { ...DEFAULT_PROFILE, ...stored, skipped: { ...(stored.skipped ?? {}) } };
}

export async function saveShopProfile(patch: Partial<ShopProfile>): Promise<ShopProfile> {
  const current = await getShopProfile();
  const next: ShopProfile = { ...current, ...patch, skipped: { ...current.skipped, ...(patch.skipped ?? {}) } };
  await prisma.appSetting.upsert({ where: { key: PROFILE_KEY }, create: { key: PROFILE_KEY, value: JSON.stringify(next) }, update: { value: JSON.stringify(next) } });
  await refreshConventions();
  return next;
}

export async function getLearnedVocabulary(): Promise<LearnedVocabulary | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: VOCABULARY_KEY } });
  return parseJson<LearnedVocabulary | null>(row?.value, null);
}

export async function saveLearnedVocabulary(learned: LearnedVocabulary | null): Promise<void> {
  if (!learned) await prisma.appSetting.deleteMany({ where: { key: VOCABULARY_KEY } });
  else await prisma.appSetting.upsert({ where: { key: VOCABULARY_KEY }, create: { key: VOCABULARY_KEY, value: JSON.stringify(learned) }, update: { value: JSON.stringify(learned) } });
  await refreshConventions();
}

export async function getHouseConventions(): Promise<HouseConventions> {
  const row = await prisma.appSetting.findUnique({ where: { key: HOUSE_KEY } });
  return row ? cleanHouse(parseJson<Partial<HouseConventions>>(row.value, {})) : DEFAULT_HOUSE;
}

export async function saveHouseConventions(house: HouseConventions): Promise<void> {
  const value = JSON.stringify(cleanHouse(house));
  await prisma.appSetting.upsert({ where: { key: HOUSE_KEY }, create: { key: HOUSE_KEY, value }, update: { value } });
  await refreshConventions();
}

export async function getStoredApiKey(): Promise<string> {
  const row = await prisma.appSetting.findUnique({ where: { key: API_KEY_KEY } });
  return parseJson<string>(row?.value, "");
}

export async function saveStoredApiKey(key: string): Promise<void> {
  const value = key.trim();
  if (!value) await prisma.appSetting.deleteMany({ where: { key: API_KEY_KEY } });
  else await prisma.appSetting.upsert({ where: { key: API_KEY_KEY }, create: { key: API_KEY_KEY, value: JSON.stringify(value) }, update: { value: JSON.stringify(value) } });
  await refreshConventions();
}

// ---------------------------------------------------------------------------------------------
// In force
// ---------------------------------------------------------------------------------------------

let activeProfile: ShopProfile = DEFAULT_PROFILE;
let loadedAt = 0;
let loading: Promise<void> | null = null;
/** How long a process trusts what it loaded. A save in this process refreshes at once. */
const TRUST_MS = 30_000;

async function load(): Promise<void> {
  const [profile, learned, key, house] = await Promise.all([getShopProfile(), getLearnedVocabulary(), getStoredApiKey(), getHouseConventions()]);
  activeProfile = profile;
  activateConventions({ pack: profile.pack, learned, marker: profile.marker, house });
  setStoredApiKey(key);
  loadedAt = Date.now();
}

/** Put the shop's conventions in force, loading them if this process has not, or not lately. */
export async function ensureConventions(): Promise<void> {
  if (Date.now() - loadedAt < TRUST_MS) return;
  if (!loading) {
    loading = load().catch((err) => {
      // A database that is not there yet (first run, before the tables exist) is not this
      // function's problem to report; the gate on the layout does that.
      console.error("[shop] could not load the shop's conventions:", err instanceof Error ? err.message : err);
    }).finally(() => { loading = null; });
  }
  await loading;
}

/** After a save: load again now, so the process that saved sees it without waiting. */
export async function refreshConventions(): Promise<void> {
  loadedAt = 0;
  await ensureConventions();
}

/** The profile in force, as last loaded. */
export function shopProfile(): ShopProfile {
  return activeProfile;
}

/** The shop's name for copy, with a plain fallback until setup names it. */
export function shopName(): string {
  return activeProfile.name.trim() || "our shop";
}

/**
 * The retailer, as the prompts describe it: "a ski and snowboard retailer in Australia". Built
 * from the profile so a bike shop in Leeds is read as one.
 */
export function retailer(): string {
  const sells = activeProfile.sells.trim();
  const country = COUNTRIES.find((c) => c.code === activeProfile.country)?.name;
  const what = sells ? `a ${sells.replace(/^(a|an)\s+/i, "")} retailer` : "a specialty retailer";
  return country && activeProfile.country !== "XX" && activeProfile.country !== "EU" ? `${what} in ${country}` : what;
}

/** The variety of English the shop's copy is written in. */
export function englishVariant(): string {
  switch (activeProfile.country) {
    case "AU": return "Australian English";
    case "NZ": return "New Zealand English";
    case "GB": return "British English";
    case "US": return "US English";
    case "CA": return "Canadian English";
    default: return "plain English";
  }
}

/** What the sales tax is called in prompts and labels: "GST", "VAT", or "tax". */
export function taxName(): string {
  return activeProfile.taxName.trim() || "tax";
}
