/**
 * Licences: how a copy of Flöda knows it is someone's, and how the vendor knows who is running it.
 *
 * Flöda is installed per shop, so there are two sides to this and both live in this module:
 *
 *  - The vendor's own deployment (at fl-da.vercel.app, floda.ai once that name exists) runs with FLODA_VENDOR=1. It keeps the
 *    `Client` table, shows the Clients page, and answers `/api/licence`.
 *  - Every other copy — a shop's installed app, or a shop's own hosted copy — is built with
 *    FLODA_LICENCE_SERVER pointing at the vendor. It keeps the key the shop entered in `AppSetting`
 *    and checks in about once a day. A copy that cannot reach the vendor keeps working for a
 *    month on what it last heard, since a shop's paperwork does not stop for a network.
 *
 * A key is a slip of paper, not a secret worth protecting with cryptography: the point is to know
 * which shop is on which plan, and to be able to pause one. Nothing here stops a determined
 * person; it stops nobody by accident.
 */

import { randomBytes } from "node:crypto";

export const LICENCE_KEY_SETTING = "licence";
export { PLAN_IDS as PLANS } from "./plans";
export const STATUSES = ["TRIAL", "ACTIVE", "PAUSED", "ENDED"] as const;
export type ClientStatus = (typeof STATUSES)[number];

/** Letters and digits that are not mistaken for each other when read off a page. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A new key: FL-XXXX-XXXX-XXXX-XXXX. */
export function newLicenceKey(): string {
  const bytes = randomBytes(16);
  const chars = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("");
  return `FL-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}-${chars.slice(12, 16)}`;
}

/** A key as typed, tidied: upper case, dashes where they belong. Undefined when it is not one. */
export function normaliseKey(input: string): string | undefined {
  const flat = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = flat.startsWith("FL") ? flat.slice(2) : flat;
  if (body.length !== 16 || [...body].some((c) => !ALPHABET.includes(c))) return undefined;
  return `FL-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}-${body.slice(12, 16)}`;
}

/** What a client record says about whether its copy may run. */
export interface ClientLike {
  status: string;
  expiresAt: Date | string | null;
}

export type Verdict = { ok: true; status: ClientStatus; expiresAt: string | null; daysLeft: number | null } | { ok: false; status: ClientStatus | "UNKNOWN"; why: string };

export function verdictFor(client: ClientLike | null, now = new Date()): Verdict {
  if (!client) return { ok: false, status: "UNKNOWN", why: "That key is not one we issued." };
  const status = client.status as ClientStatus;
  const expiresAt = client.expiresAt ? new Date(client.expiresAt) : null;
  if (status === "ENDED") return { ok: false, status, why: "This licence has ended." };
  if (status === "PAUSED") return { ok: false, status, why: "This licence is paused." };
  if (expiresAt && expiresAt.getTime() < now.getTime()) return { ok: false, status, why: status === "TRIAL" ? "The trial has ended." : "This licence has expired." };
  const daysLeft = expiresAt ? Math.ceil((expiresAt.getTime() - now.getTime()) / 86_400_000) : null;
  return { ok: true, status, expiresAt: expiresAt?.toISOString() ?? null, daysLeft };
}

// ---------------------------------------------------------------------------------------------
// The installed copy's side
// ---------------------------------------------------------------------------------------------

/** What the copy keeps about its licence: the key, what the vendor last said, and when. */
export interface Licence {
  key: string;
  client: string;
  plan: string;
  status: string;
  expiresAt: string | null;
  /** When the vendor last answered. */
  checkedAt: string;
  /** What the vendor last said, when it said the copy may not run. */
  why?: string;
}

/** How long a copy trusts the last answer before it asks again. */
export const CHECK_EVERY_MS = 24 * 3600 * 1000;
/** How long a copy keeps working on an answer it cannot refresh. */
export const GRACE_MS = 30 * 24 * 3600 * 1000;

export function vendorMode(): boolean {
  return process.env.FLODA_VENDOR === "1";
}

/**
 * Where this copy checks its licence, or empty when it is not licensed: development, the vendor
 * itself, and an open copy (FLODA_OPEN=1, a desktop build with no sign-in and no licence).
 */
export function licenceServer(): string {
  if (process.env.FLODA_OPEN === "1") return "";
  return (process.env.FLODA_LICENCE_SERVER ?? "").trim().replace(/\/+$/, "");
}

/** Where to turn when the built-in address cannot be reached: the deployment's own address, then the name it will have. */
export const LICENCE_FALLBACKS = ["https://fl-da.vercel.app", "https://floda.ai"];

/**
 * Every address this copy may ask, in order: the one a person typed in (Settings → Licence), the
 * one the build baked in, then the fallbacks. A copy built with an address that does not answer
 * still finds its vendor. Empty when the copy checks no licence at all.
 */
export function licenceServers(override?: string | null): string[] {
  const built = licenceServer();
  if (!built) return [];
  const list = [override ?? "", built, ...LICENCE_FALLBACKS].map((u) => u.trim().replace(/\/+$/, "")).filter(Boolean);
  return Array.from(new Set(list));
}

/** Whether a URL is one this copy could ask: https, a hostname, nothing else. */
export function isServerUrl(input: string): boolean {
  try {
    const u = new URL(input.trim());
    return (u.protocol === "https:" || u.hostname === "localhost" || u.hostname === "127.0.0.1") && !u.search && !u.hash && (u.pathname === "/" || u.pathname === "");
  } catch {
    return false;
  }
}

/** Whether an error is the network, not the vendor's answer: the next address is worth trying. */
export function isReachFailure(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === "AbortError" || err.name === "TimeoutError") return true;
  return /fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|certificate|network/i.test(`${err.message} ${describeCause(err)}`);
}

function describeCause(err: Error): string {
  const cause = (err as { cause?: unknown }).cause;
  if (!cause || typeof cause !== "object") return "";
  const c = cause as { code?: string; message?: string };
  return `${c.code ?? ""} ${c.message ?? ""}`.trim();
}

/** Why an address could not be reached, in words a shop can act on, naming the address. */
export function describeReachFailure(server: string, err: unknown): string {
  const host = (() => { try { return new URL(server).host; } catch { return server; } })();
  if (!(err instanceof Error)) return `${host}: ${String(err)}`;
  const detail = describeCause(err);
  if (/ENOTFOUND|EAI_AGAIN/.test(detail)) return `${host}: the address does not exist — no DNS record answers for it`;
  if (/ECONNREFUSED/.test(detail)) return `${host}: nothing is answering there`;
  if (/certificate|CERT_|SELF_SIGNED/i.test(detail + err.message)) return `${host}: its certificate was refused`;
  if (err.name === "AbortError" || err.name === "TimeoutError" || /ETIMEDOUT/.test(detail)) return `${host}: it did not answer within 15 seconds`;
  return `${host}: ${detail || err.message}`;
}

let preferred: string | null = null;

/**
 * Ask the vendor at the first address that can be reached. An address that answered last time
 * is tried first; one that cannot be reached is passed over for the next; when none can be, the
 * error says why for each, so "fetch failed" is never all a person is told.
 */
export async function reachVendor<T>(servers: string[], call: (server: string) => Promise<T>): Promise<T> {
  if (servers.length === 0) throw new Error("This copy is not set up to check a licence.");
  const order = preferred && servers.includes(preferred) ? [preferred, ...servers.filter((s) => s !== preferred)] : servers;
  const reasons: string[] = [];
  for (const server of order) {
    try {
      const out = await call(server);
      preferred = server;
      return out;
    } catch (err) {
      if (!isReachFailure(err)) throw err;
      reasons.push(describeReachFailure(server, err));
    }
  }
  throw new Error(`${reasons.join("; ")}. Check the internet connection, or set Flöda's address under Settings → Licence.`);
}

export type LicenceState =
  | { kind: "unlicensed" } // no server configured: nothing to check
  | { kind: "none" } // a server is configured and no key has been entered
  | { kind: "ok"; licence: Licence; daysLeft: number | null; stale: boolean }
  | { kind: "lapsed"; licence: Licence; why: string };

/** How the copy stands, from what it keeps. Never talks to the network. */
export function licenceState(licence: Licence | null, now = new Date()): LicenceState {
  if (!licenceServer()) return { kind: "unlicensed" };
  if (!licence) return { kind: "none" };
  const checked = new Date(licence.checkedAt).getTime();
  const stale = now.getTime() - checked > CHECK_EVERY_MS;
  if (licence.why && licence.status !== "ACTIVE" && licence.status !== "TRIAL") return { kind: "lapsed", licence, why: licence.why };
  if (licence.why) return { kind: "lapsed", licence, why: licence.why };
  if (now.getTime() - checked > GRACE_MS) return { kind: "lapsed", licence, why: "This copy has not been able to reach Flöda for a month to confirm its licence." };
  const v = verdictFor({ status: licence.status, expiresAt: licence.expiresAt }, now);
  if (!v.ok) return { kind: "lapsed", licence, why: v.why };
  return { kind: "ok", licence, daysLeft: v.daysLeft, stale };
}

/** The request a copy sends when it activates or checks in. */
export interface CheckIn {
  key: string;
  install: string;
  shop: string;
  version: string;
  platform: string;
  /** Invoices and products built this calendar month, so the vendor can see the plan fits. */
  monthBatches?: number;
  monthProducts?: number;
}

/** The vendor's answer. */
export type CheckAnswer = { ok: true; client: string; plan: string; status: string; expiresAt: string | null } | { ok: false; status: string; why: string };

/** Ask the vendor about a key. Throws on a network failure; the caller decides what that means. */
export async function askVendor(server: string, path: "activate" | "check", body: CheckIn): Promise<CheckAnswer> {
  const res = await fetch(`${server}/api/licence/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => null)) as CheckAnswer | null;
  if (!data || typeof data !== "object" || !("ok" in data)) throw new Error(`Flöda answered ${res.status} without a verdict`);
  return data;
}

/** What a copy sends to start a trial from inside the app: who the shop is, and which plan. */
export interface TrialRequest {
  shop: string;
  email: string;
  plan: string;
  install: string;
  version: string;
  platform: string;
}

/** The vendor's answer to a trial request: the key it made, or why not. */
export type TrialAnswer = { ok: true; key: string; client: string; plan: string; status: string; expiresAt: string | null } | { ok: false; status: string; why: string };

/** Ask the vendor for a trial. Throws on a network failure; the caller decides what that means. */
export async function askForTrial(server: string, body: TrialRequest): Promise<TrialAnswer> {
  const res = await fetch(`${server}/api/licence/trial`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => null)) as TrialAnswer | null;
  if (!data || typeof data !== "object" || !("ok" in data)) throw new Error(`Flöda answered ${res.status} without a verdict`);
  return data;
}

/** What the vendor answers when a copy asks to pay, or for its billing page: a link, or why not. */
export type BillingAnswer = { ok: true; url: string } | { ok: false; why: string };

export async function askForBilling(server: string, what: "checkout" | "portal", body: { key: string; plan?: string }): Promise<BillingAnswer> {
  const res = await fetch(`${server}/api/licence/${what}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json().catch(() => null)) as BillingAnswer | null;
  if (!data || typeof data !== "object" || !("ok" in data)) throw new Error(`Flöda answered ${res.status} without a link`);
  return data;
}

/** The licence as kept after an answer. */
export function licenceFromAnswer(key: string, answer: CheckAnswer, previous: Licence | null, now = new Date()): Licence {
  if (answer.ok) return { key, client: answer.client, plan: answer.plan, status: answer.status, expiresAt: answer.expiresAt, checkedAt: now.toISOString() };
  return { key, client: previous?.client ?? "", plan: previous?.plan ?? "", status: answer.status, expiresAt: previous?.expiresAt ?? null, checkedAt: now.toISOString(), why: answer.why };
}
