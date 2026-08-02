// In-memory backend — the default when DATABASE_URL is unset. Zero setup, used by
// tests and local dev. State lives for the process lifetime only.

import type { Backend, FollowUp } from "./types";

const tokens = new Map<string, string>();
const followUps = new Map<string, FollowUp>();

export const memoryBackend: Backend = {
  async saveShopToken(shop, token) {
    tokens.set(shop, token);
  },
  async getShopToken(shop) {
    return tokens.get(shop);
  },
  async deleteShopToken(shop) {
    tokens.delete(shop);
  },

  async insertFollowUp(f) {
    if (followUps.has(f.id)) return false;
    followUps.set(f.id, { ...f });
    return true;
  },
  async dueFollowUps(now) {
    return [...followUps.values()].filter((f) => !f.sent && f.sendAt <= now);
  },
  async markSent(id) {
    const f = followUps.get(id);
    if (f) f.sent = true;
  },

  async purgeShop(shop) {
    let n = 0;
    for (const [id, f] of followUps) {
      if (f.shop === shop) {
        followUps.delete(id);
        n += 1;
      }
    }
    return n;
  },
  async purgeEmail(email) {
    const target = email.trim().toLowerCase();
    let n = 0;
    for (const [id, f] of followUps) {
      if (f.email.trim().toLowerCase() === target) {
        followUps.delete(id);
        n += 1;
      }
    }
    return n;
  },
};
