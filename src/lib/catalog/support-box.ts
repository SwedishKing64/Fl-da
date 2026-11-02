/**
 * A shop's backup sent to Flöda support, kept on the vendor's deployment: what was sent, by whom,
 * and where the file sits in the vendor's Blob store, so a person at Flöda can load it into a shop
 * of their own, look, fix, and send a rules file back. Listed on the Clients page under one key in
 * `AppSetting`, the way feedback is.
 */

export const SUPPORT_KEY = "floda.support";

export interface SupportBackupRow {
  at: string;
  shop: string;
  email: string;
  note: string;
  version: string;
  install: string;
  key: string;
  bytes: number;
  /** The file's name as the copy named it: a backup's own name. */
  name: string;
  /** Where it is in the Blob store, and its address there (public stores only; empty on a private one). */
  pathname: string;
  url: string;
  access: "public" | "private";
}

/** The most a backup may be: a shop's whole database, pictures aside. */
export const SUPPORT_MAX_BYTES = 2 * 1024 * 1024 * 1024;

/** A name safe for a Blob path. */
export function safeBackupName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120) || "backup.db";
}
