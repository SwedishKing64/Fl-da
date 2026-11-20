/**
 * The rules as they stood before each of the last changes, so a change on Teach Snaben can
 * be undone. Each entry is a rules file (see rules-file.ts) without the export and the website,
 * which no rule edit changes. Ten are kept. Pure apart from the two that read and write the
 * store.
 */

import { parseJson, prisma } from "./db";
import { cleanRulesFile, type RulesFile } from "./rules-file";

export interface RulesSnapshot {
  id: string;
  label: string;
  at: string;
  file: RulesFile;
}

export const HISTORY_KEY = "rules.history";
export const KEEP = 10;

/** The history with one more entry at the front, the oldest beyond KEEP dropped. */
export function pushSnapshot(history: RulesSnapshot[], entry: { label: string; file: RulesFile }, now = new Date()): RulesSnapshot[] {
  const id = `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return [{ id, label: entry.label.slice(0, 120), at: now.toISOString(), file: entry.file }, ...history].slice(0, KEEP);
}

export async function readHistory(): Promise<RulesSnapshot[]> {
  const row = await prisma.appSetting.findUnique({ where: { key: HISTORY_KEY } }).catch(() => null);
  const list = parseJson<unknown>(row?.value, []);
  if (!Array.isArray(list)) return [];
  const out: RulesSnapshot[] = [];
  for (const e of list) {
    if (!e || typeof e !== "object") continue;
    const x = e as Record<string, unknown>;
    const file = cleanRulesFile(x.file);
    if (!file || typeof x.id !== "string") continue;
    out.push({ id: x.id, label: String(x.label ?? ""), at: String(x.at ?? ""), file });
  }
  return out;
}

export async function writeHistory(history: RulesSnapshot[]): Promise<void> {
  const value = JSON.stringify(history.slice(0, KEEP));
  await prisma.appSetting.upsert({ where: { key: HISTORY_KEY }, create: { key: HISTORY_KEY, value }, update: { value } });
}
