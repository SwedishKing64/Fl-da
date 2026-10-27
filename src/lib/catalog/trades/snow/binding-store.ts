import { prisma, parseJson } from "../../db";
import { SHOP_BINDINGS, type BindingList } from "./binding-list";

/**
 * Where the binding list and each batch's picks are kept: the database, as the supplier list is,
 * with the shop's own list built in for when none has been loaded. See binding-list.ts.
 */
const LIST = "packages.bindings";
const picksKey = (batchId: string) => `packages.picks.${batchId}`;

/** The binding list: one loaded in Settings, or else the shop's own, built in. Never empty. */
export async function getBindingList(): Promise<BindingList> {
  const row = await prisma.appSetting.findUnique({ where: { key: LIST } }).catch(() => null);
  const list = parseJson<BindingList | null>(row?.value, null);
  if (list && Array.isArray(list.entries) && list.entries.length > 0) return list;
  return { entries: SHOP_BINDINGS, file: "the shop's binding list (built in)", updatedAt: "2026-10-20T00:00:00.000Z" };
}

export async function saveBindingList(list: BindingList): Promise<void> {
  const value = JSON.stringify(list);
  await prisma.appSetting.upsert({ where: { key: LIST }, create: { key: LIST, value }, update: { value } });
}

/** The bindings picked for each ski of a batch, by skiKey. A ski with an empty pick gets no package. */
export async function getBatchPicks(batchId: string): Promise<Record<string, string[]>> {
  const row = await prisma.appSetting.findUnique({ where: { key: picksKey(batchId) } });
  return parseJson<Record<string, string[]>>(row?.value, {});
}

export async function saveBatchPicks(batchId: string, picks: Record<string, string[]>): Promise<void> {
  const value = JSON.stringify(picks);
  await prisma.appSetting.upsert({ where: { key: picksKey(batchId) }, create: { key: picksKey(batchId), value }, update: { value } });
}
