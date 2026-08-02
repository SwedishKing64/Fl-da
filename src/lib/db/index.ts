// The persistence entry point. Picks the Postgres backend when DATABASE_URL is set,
// otherwise the in-memory one. The Postgres module (and its driver) is imported lazily
// so the no-DB path never loads it — the app builds and tests with zero database.

import { memoryBackend } from "./memory";
import type { Backend, FollowUp } from "./types";

let backendPromise: Promise<Backend> | null = null;

function backend(): Promise<Backend> {
  if (!backendPromise) {
    backendPromise = process.env.DATABASE_URL
      ? import("./postgres").then((m) => m.createPostgresBackend())
      : Promise.resolve(memoryBackend);
  }
  return backendPromise;
}

export function usingDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export const db: Backend = {
  saveShopToken: async (shop, token) => (await backend()).saveShopToken(shop, token),
  getShopToken: async (shop) => (await backend()).getShopToken(shop),
  deleteShopToken: async (shop) => (await backend()).deleteShopToken(shop),
  insertFollowUp: async (f) => (await backend()).insertFollowUp(f),
  dueFollowUps: async (now) => (await backend()).dueFollowUps(now),
  markSent: async (id) => (await backend()).markSent(id),
  purgeShop: async (shop) => (await backend()).purgeShop(shop),
  purgeEmail: async (email) => (await backend()).purgeEmail(email),
};

export type { Backend, FollowUp };
