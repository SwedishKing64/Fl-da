/**
 * Backups of a copy that keeps its database in a file.
 *
 * An installed copy holds everything the shop has taught Flöda — the suppliers' layouts, the
 * learned vocabulary, every batch — in one SQLite file on one machine. A disk that dies takes it
 * all. So the file is copied, with SQLite's own VACUUM INTO (a consistent copy while the app is
 * running), into a `backups` folder beside it: once a night while the app is open, whenever
 * somebody presses the button, and before a restore. The newest fourteen are kept.
 *
 * A hosted copy on Postgres is backed up by its host and has none of this.
 */

import fs from "node:fs";
import path from "node:path";
import { prisma } from "./db";
import { findDatabaseUrl, type Env } from "./db-url";

export const KEEP = 14;
export const NIGHTLY_AFTER_MS = 20 * 60 * 60 * 1000;
export type BackupReason = "manual" | "nightly" | "restore";
export const BACKUP_NAME = /^floda-(\d{4}-\d{2}-\d{2})-(\d{2})(\d{2})-(manual|nightly|restore)\.db$/;

export interface Backup {
  name: string;
  bytes: number;
  at: string; // ISO
  reason: BackupReason;
}

/** The SQLite file this copy runs on, or null when the database is a server. */
export function sqliteFile(env: Env = process.env): string | null {
  const found = findDatabaseUrl(env);
  if (!found || !/^file:/i.test(found.url)) return null;
  const raw = found.url.replace(/^file:/i, "").split("?")[0];
  return path.resolve(process.cwd(), raw);
}

export function backupDir(db: string): string {
  return path.join(path.dirname(db), "backups");
}

/** `floda-2026-10-15-0630-nightly.db`: sorts by time as a plain string. */
export function backupName(when: Date, reason: BackupReason): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `floda-${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}-${pad(when.getHours())}${pad(when.getMinutes())}-${reason}.db`;
}

export function parseBackupName(name: string): { at: Date; reason: BackupReason } | null {
  const m = BACKUP_NAME.exec(name);
  if (!m) return null;
  const [, day, hh, mm, reason] = m;
  return { at: new Date(`${day}T${hh}:${mm}:00`), reason: reason as BackupReason };
}

/** Which of these names to delete so that only the newest `keep` remain. */
export function pruneNames(names: string[], keep = KEEP): string[] {
  const valid = names.filter((n) => BACKUP_NAME.test(n)).sort();
  return valid.slice(0, Math.max(0, valid.length - keep));
}

export function listBackups(): Backup[] {
  const db = sqliteFile();
  if (!db) return [];
  const dir = backupDir(db);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => BACKUP_NAME.test(n))
    .sort()
    .reverse()
    .map((name) => {
      const parsed = parseBackupName(name)!;
      return { name, bytes: fs.statSync(path.join(dir, name)).size, at: parsed.at.toISOString(), reason: parsed.reason };
    });
}

export function backupPath(name: string): string | null {
  const db = sqliteFile();
  if (!db || !BACKUP_NAME.test(name)) return null;
  const file = path.join(backupDir(db), name);
  return fs.existsSync(file) ? file : null;
}

/** Copy the database as it stands. Returns what was written. */
export async function backupNow(reason: BackupReason, now = new Date()): Promise<Backup> {
  const db = sqliteFile();
  if (!db) throw new Error("This copy's database is a server, which keeps its own backups.");
  const dir = backupDir(db);
  fs.mkdirSync(dir, { recursive: true });
  let name = backupName(now, reason);
  // Two in the same minute: the second replaces the first, which is the same data a moment later.
  const file = path.join(dir, name);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  await prisma.$executeRawUnsafe(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  for (const old of pruneNames(fs.readdirSync(dir))) fs.unlinkSync(path.join(dir, old));
  name = path.basename(file);
  return { name, bytes: fs.statSync(file).size, at: now.toISOString(), reason };
}

/** A backup when the newest one is more than twenty hours old, or there is none. Never throws. */
export async function nightlyIfDue(now = new Date()): Promise<Backup | null> {
  try {
    if (!sqliteFile()) return null;
    const newest = listBackups()[0];
    if (newest && now.getTime() - new Date(newest.at).getTime() < NIGHTLY_AFTER_MS) return null;
    return await backupNow("nightly", now);
  } catch (err) {
    console.error(`[backup] nightly backup failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Put a backup in place of the database. The database as it stands is backed up first, so a
 * restore is never the end of anything. The connection is closed for the copy and opens again on
 * the next query; a desktop copy is best restarted afterwards all the same.
 */
export async function restoreBackup(name: string): Promise<{ safety: Backup }> {
  const db = sqliteFile();
  const file = backupPath(name);
  if (!db || !file) throw new Error("That backup is not here any more.");
  const safety = await backupNow("restore");
  await prisma.$disconnect();
  fs.copyFileSync(file, db);
  for (const side of [`${db}-wal`, `${db}-shm`, `${db}-journal`]) if (fs.existsSync(side)) fs.unlinkSync(side);
  return { safety };
}
