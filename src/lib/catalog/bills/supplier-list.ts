import { prisma, parseJson } from "../db";
import type { SupplierList } from "./suppliers";

/**
 * The shop's supplier list, kept in the database so every person and every visit uses the same
 * one. Only the names are stored; see suppliers.ts.
 */
const KEY = "quickbooks.suppliers";

export async function getSupplierList(): Promise<SupplierList | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  const list = parseJson<SupplierList | null>(row?.value, null);
  return list && Array.isArray(list.entries) ? list : null;
}

export async function saveSupplierList(list: SupplierList): Promise<void> {
  const value = JSON.stringify(list);
  await prisma.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
}
