/**
 * One place that knows how to reach the reading service.
 *
 * The key comes from the host (`ANTHROPIC_API_KEY`, or `ANTHROPIC_AUTH_TOKEN` for a gateway) or,
 * when the host sets none, from the one the shop pasted into Settings — an installed copy of Flöda
 * has no host to set a variable on. A copy on a plan with neither reads through Flöda: the SDK is
 * pointed at the vendor's relay (`/api/ai`) with the licence key as its bearer token, and the
 * vendor forwards with a key of its own. `shop-profile.ts` hands the stored key and the licence in
 * once per request; nothing here reads the database, so the pure modules and their tests can
 * import this freely.
 *
 * Clients are kept per key and retry count: a key changed in Settings takes effect on the next
 * call rather than after a restart.
 */

import Anthropic from "@anthropic-ai/sdk";

/** The model every reader uses. Overridable per deployment. */
export const EXTRACTION_MODEL = process.env.CATALOG_AI_MODEL || "claude-opus-5";

let storedKey = "";
let relay: { server: string; key: string } | null = null;
const clients = new Map<string, Anthropic>();

/** The key the shop keeps in Settings, as last loaded. Empty when none. */
export function setStoredApiKey(key: string): void {
  storedKey = key.trim();
}

/** Where the copy reads through Flöda when it has no key of its own: the vendor and the licence key. Null when it may not. */
export function setRelay(next: { server: string; key: string } | null): void {
  relay = next && next.server && next.key ? { server: next.server.replace(/\/+$/, ""), key: next.key } : null;
}

function hostKey(): string {
  return (process.env.ANTHROPIC_API_KEY ?? "").trim();
}

function gatewayToken(): string {
  return (process.env.ANTHROPIC_AUTH_TOKEN ?? "").trim();
}

export type KeySource = "host" | "settings" | "floda" | "none";

/** Where the key in use came from, for the Settings page. Never the key itself. */
export function apiKeySource(): KeySource {
  if (hostKey() || gatewayToken()) return "host";
  if (storedKey) return "settings";
  if (relay) return "floda";
  return "none";
}

export function aiAvailable(): boolean {
  return apiKeySource() !== "none";
}

/** A client for the key in force. `maxRetries` is per caller: a season's sheet needs more patience than a colour check. */
export function anthropicClient(maxRetries: number): Anthropic {
  const key = hostKey() || storedKey;
  const viaFloda = !key && !gatewayToken() ? relay : null;
  const id = viaFloda ? `${maxRetries}:floda:${viaFloda.server}:${viaFloda.key}` : `${maxRetries}:${key}`;
  let client = clients.get(id);
  if (!client) {
    client = viaFloda
      ? new Anthropic({ apiKey: null, authToken: viaFloda.key, baseURL: `${viaFloda.server}/api/ai`, maxRetries })
      : key ? new Anthropic({ apiKey: key, maxRetries }) : new Anthropic({ maxRetries });
    clients.set(id, client);
  }
  return client;
}

/** The last few characters of a key, for showing which one is set without showing it. */
export function keyTail(key: string): string {
  const k = key.trim();
  return k.length > 8 ? `…${k.slice(-4)}` : "";
}
