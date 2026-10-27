/**
 * The shops kept on this computer, as the app sees them (see desktop/shops.cjs for the other side).
 *
 * Only a desktop copy has more than one: the desktop app tells the server where the list is
 * (`FLODA_SHOPS_FILE`) and which shop it is running on (`FLODA_SHOP_ID`). Adding, renaming and
 * opening a shop are writes to that list; the desktop app watches it and restarts the server on the
 * shop now open. Each shop is its own database and files folder, so nothing crosses between them.
 */

import { promises as fs } from "node:fs";
import { randomBytes } from "node:crypto";

export interface ShopEntry { id: string; name: string }
export interface ShopList { current: string; shops: ShopEntry[] }

const FIRST = "main";

/** Where the desktop app keeps the list, or null on a copy with one shop (hosted, development). */
export function shopsFile(): string | null {
  return process.env.FLODA_SHOPS_FILE || null;
}

/** The shop this server is running on. */
export function runningShopId(): string {
  return process.env.FLODA_SHOP_ID || FIRST;
}

/** The list made whole: the first shop always there, a known shop open. The same rules as the desktop's. */
export function wholeList(stored: unknown): ShopList {
  const s = (stored && typeof stored === "object" ? stored : {}) as { current?: unknown; shops?: unknown };
  const shops = (Array.isArray(s.shops) ? s.shops : [])
    .filter((x): x is { id: string; name?: unknown } => Boolean(x) && typeof (x as { id?: unknown }).id === "string" && /^[a-z0-9-]{1,40}$/.test((x as { id: string }).id))
    .map((x) => ({ id: x.id, name: String(x.name ?? "").trim().slice(0, 80) || "Shop" }));
  if (!shops.some((x) => x.id === FIRST)) shops.unshift({ id: FIRST, name: "My shop" });
  const current = typeof s.current === "string" && shops.some((x) => x.id === s.current) ? s.current : FIRST;
  return { current, shops };
}

export async function readShopList(): Promise<ShopList | null> {
  const file = shopsFile();
  if (!file) return null;
  const text = await fs.readFile(file, "utf8").catch(() => "{}");
  try {
    return wholeList(JSON.parse(text));
  } catch {
    return wholeList({});
  }
}

async function write(list: ShopList): Promise<void> {
  const file = shopsFile();
  if (!file) throw new Error("This copy holds one shop. Several shops are kept by the desktop app.");
  await fs.writeFile(`${file}.tmp`, JSON.stringify(list, null, 2));
  await fs.rename(`${file}.tmp`, file);
}

/** A folder-safe id for a new shop: its name, and a few letters so two of the same name differ. */
export function newShopId(name: string): string {
  const slug = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 28) || "shop";
  return `${slug}-${randomBytes(3).toString("hex")}`;
}

/** Add a shop; it is not opened. */
export async function addShop(name: string): Promise<ShopEntry> {
  const clean = name.trim().slice(0, 80);
  if (!clean) throw new Error("Give the shop a name.");
  const list = (await readShopList()) ?? wholeList({});
  if (list.shops.some((s) => s.name.toLowerCase() === clean.toLowerCase())) throw new Error(`There is already a shop called ${clean}.`);
  const entry = { id: newShopId(clean), name: clean };
  await write({ ...list, shops: [...list.shops, entry] });
  return entry;
}

export async function renameShop(id: string, name: string): Promise<void> {
  const clean = name.trim().slice(0, 80);
  if (!clean) throw new Error("Give the shop a name.");
  const list = (await readShopList()) ?? wholeList({});
  if (!list.shops.some((s) => s.id === id)) throw new Error("No such shop.");
  await write({ ...list, shops: list.shops.map((s) => (s.id === id ? { ...s, name: clean } : s)) });
}

/** Open another shop: the desktop app stops this server and starts one on that shop's folder. */
export async function openShop(id: string): Promise<void> {
  const list = (await readShopList()) ?? wholeList({});
  if (!list.shops.some((s) => s.id === id)) throw new Error("No such shop.");
  await write({ ...list, current: id });
}
