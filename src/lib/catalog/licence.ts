/**
 * Licences: how a copy of Flöda knows it is someone's, and how the vendor knows who is running it.
 *
 * Flöda is installed per shop, so there are two sides to this and both live in this module:
 *
 *  - The vendor's own deployment (the one at floda.ai) runs with FLODA_VENDOR=1. It keeps the
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
export const PLANS = ["trial", "founding", "standard"] as const;
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

/** Where this copy checks its licence, or empty when it is not licensed (development, the vendor itself). */
export function licenceServer(): string {
  return (process.env.FLODA_LICENCE_SERVER ?? "").trim().replace(/\/+$/, "");
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

/** The licence as kept after an answer. */
export function licenceFromAnswer(key: string, answer: CheckAnswer, previous: Licence | null, now = new Date()): Licence {
  if (answer.ok) return { key, client: answer.client, plan: answer.plan, status: answer.status, expiresAt: answer.expiresAt, checkedAt: now.toISOString() };
  return { key, client: previous?.client ?? "", plan: previous?.plan ?? "", status: answer.status, expiresAt: previous?.expiresAt ?? null, checkedAt: now.toISOString(), why: answer.why };
}
