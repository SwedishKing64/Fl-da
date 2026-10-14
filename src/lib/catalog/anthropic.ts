/**
 * One place that knows how to reach the reading service.
 *
 * The key comes from the host (`ANTHROPIC_API_KEY`, or `ANTHROPIC_AUTH_TOKEN` for a gateway) or,
 * when the host sets none, from the one the shop pasted into Settings — an installed copy of Flöda
 * has no host to set a variable on. `shop-profile.ts` hands the stored key in once per request;
 * nothing here reads the database, so the pure modules and their tests can import this freely.
 *
 * Clients are kept per key and retry count: a key changed in Settings takes effect on the next
 * call rather than after a restart.
 */

import Anthropic from "@anthropic-ai/sdk";

let storedKey = "";
const clients = new Map<string, Anthropic>();

/** The key the shop keeps in Settings, as last loaded. Empty when none. */
export function setStoredApiKey(key: string): void {
  storedKey = key.trim();
}

function hostKey(): string {
  return (process.env.ANTHROPIC_API_KEY ?? "").trim();
}

/** Where the key in use came from, for the Settings page. Never the key itself. */
export function apiKeySource(): "host" | "settings" | "none" {
  if (hostKey() || (process.env.ANTHROPIC_AUTH_TOKEN ?? "").trim()) return "host";
  if (storedKey) return "settings";
  return "none";
}

export function aiAvailable(): boolean {
  return apiKeySource() !== "none";
}

/** A client for the key in force. `maxRetries` is per caller: a season's sheet needs more patience than a colour check. */
export function anthropicClient(maxRetries: number): Anthropic {
  const key = hostKey() || storedKey;
  const id = `${maxRetries}:${key}`;
  let client = clients.get(id);
  if (!client) {
    client = key ? new Anthropic({ apiKey: key, maxRetries }) : new Anthropic({ maxRetries });
    clients.set(id, client);
  }
  return client;
}

/** The last few characters of a key, for showing which one is set without showing it. */
export function keyTail(key: string): string {
  const k = key.trim();
  return k.length > 8 ? `…${k.slice(-4)}` : "";
}
