/**
 * The installed copy's licence, kept in the database and refreshed about once a day. See
 * licence.ts for what the pieces mean.
 */

import { randomUUID } from "node:crypto";
import { periodStart } from "./ai-usage";
import { onRelayCall } from "./anthropic";
import { prisma, parseJson } from "./db";
import { CHECK_EVERY_MS, LICENCE_KEY_SETTING, askForBilling, askForTrial, askToSignIn, askUsage, askVendor, isServerUrl, licenceFromAnswer, licenceServer, licenceServers, licenceState, reachVendor, type CheckIn, type Licence, type LicenceState } from "./licence";
import { refreshConventions, shopProfile } from "./shop-profile";
import type { MonthUse } from "./plans";

const INSTALL_KEY = "install.id";
const SERVER_KEY = "licence.server";

/** The address a person set for Flöda on this copy, when the built-in one could not be reached. */
export async function getServerOverride(): Promise<string> {
  const row = await prisma.appSetting.findUnique({ where: { key: SERVER_KEY } });
  return parseJson<string>(row?.value, "");
}

export async function saveServerOverride(url: string): Promise<void> {
  const clean = url.trim().replace(/\/+$/, "");
  if (clean && !isServerUrl(clean)) throw new Error("That is not an address Flöda can be asked at. It looks like https://fl-da.vercel.app");
  if (!clean) await prisma.appSetting.deleteMany({ where: { key: SERVER_KEY } });
  else await prisma.appSetting.upsert({ where: { key: SERVER_KEY }, create: { key: SERVER_KEY, value: JSON.stringify(clean) }, update: { value: JSON.stringify(clean) } });
}

/** Every address this copy may ask, the person's own first. */
export async function servers(): Promise<string[]> {
  return licenceServers(await getServerOverride());
}

export async function getLicence(): Promise<Licence | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: LICENCE_KEY_SETTING } });
  return parseJson<Licence | null>(row?.value, null);
}

export async function saveLicence(licence: Licence | null): Promise<void> {
  if (!licence) await prisma.appSetting.deleteMany({ where: { key: LICENCE_KEY_SETTING } });
  else await prisma.appSetting.upsert({ where: { key: LICENCE_KEY_SETTING }, create: { key: LICENCE_KEY_SETTING, value: JSON.stringify(licence) }, update: { value: JSON.stringify(licence) } });
}

/** This copy's own id, made once, so the vendor can tell two copies on one key apart. */
export async function installId(): Promise<string> {
  const row = await prisma.appSetting.findUnique({ where: { key: INSTALL_KEY } });
  const had = parseJson<string>(row?.value, "");
  if (had) return had;
  const id = randomUUID();
  await prisma.appSetting.upsert({ where: { key: INSTALL_KEY }, create: { key: INSTALL_KEY, value: JSON.stringify(id) }, update: {} });
  return id;
}

/** Invoices and products built since the fortnight began. */
export async function monthUse(now = new Date()): Promise<MonthUse> {
  const from = periodStart(now);
  const [invoices, products] = await Promise.all([
    prisma.importBatch.count({ where: { createdAt: { gte: from } } }),
    prisma.product.count({ where: { batch: { createdAt: { gte: from } } } }),
  ]);
  return { invoices, products };
}

async function checkIn(key: string): Promise<CheckIn> {
  const use = await monthUse().catch(() => ({ invoices: 0, products: 0 }));
  return {
    key,
    install: await installId(),
    shop: shopProfile().name,
    version: process.env.FLODA_VERSION ?? process.env.npm_package_version ?? "",
    platform: `${process.platform}${process.env.FLODA_DESKTOP ? " desktop" : ""}`,
    monthBatches: use.invoices,
    monthProducts: use.products,
  };
}

/** Enter a key: the vendor is asked now, and the answer kept whatever it is. */
export async function activate(key: string): Promise<Licence> {
  if (!licenceServer()) throw new Error("This copy is not set up to check a licence.");
  const previous = await getLicence();
  const body = await checkIn(key);
  const answer = await reachVendor(await servers(), (server) => askVendor(server, "activate", body));
  const licence = licenceFromAnswer(key, answer, previous);
  await saveLicence(licence);
  await refreshConventions();
  return licence;
}

/** Start this copy's trial: the vendor makes the client and the key, and the key is kept as entered. */
export async function beginTrial(input: { shop: string; email: string; plan: string }): Promise<{ licence: Licence } | { refused: string }> {
  if (!licenceServer()) throw new Error("This copy is not set up to check a licence.");
  const base = await checkIn("");
  const body = { shop: input.shop, email: input.email, plan: input.plan, install: base.install, version: base.version, platform: base.platform };
  const answer = await reachVendor(await servers(), (server) => askForTrial(server, body));
  if (!answer.ok) return { refused: answer.why };
  const licence = licenceFromAnswer(answer.key, { ok: true, client: answer.client, plan: answer.plan, status: answer.status, expiresAt: answer.expiresAt }, null);
  await saveLicence(licence);
  await refreshConventions();
  return { licence };
}

/** Sign in with the shop's website account: the vendor hands over the key and the copy keeps it. */
export async function signInWithAccount(input: { email: string; password: string }): Promise<{ licence: Licence } | { refused: string }> {
  if (!licenceServer()) throw new Error("This copy is not set up to check a licence.");
  const base = await checkIn("");
  const body = { email: input.email, password: input.password, install: base.install, version: base.version, platform: base.platform };
  const answer = await reachVendor(await servers(), (server) => askToSignIn(server, body));
  if (!answer.ok) return { refused: answer.why };
  const licence = licenceFromAnswer(answer.key, { ok: true, client: answer.client, plan: answer.plan, status: answer.status, expiresAt: answer.expiresAt }, null);
  await saveLicence(licence);
  await refreshConventions();
  usageCache = null;
  return { licence };
}

export interface ReadingUsage {
  spentCents: number;
  capCents: number;
  exhausted: boolean;
  resetsAt: string;
  ownKey: boolean;
}

let usageCache: { at: number; use: ReadingUsage | null } | null = null;
const USAGE_TRUST_MS = 2 * 60_000;

/**
 * The fortnight's reading against the allowance, for the bar in the sidebar and on Settings.
 * Asked of the vendor at most every couple of minutes; null when there is no licence, the
 * vendor cannot be reached, or the plan reads on the shop's own key.
 */
export async function readingUsage(): Promise<ReadingUsage | null> {
  if (!licenceServer()) return null;
  if (usageCache && Date.now() - usageCache.at < USAGE_TRUST_MS) return usageCache.use;
  const licence = await getLicence();
  let use: ReadingUsage | null = null;
  if (licence) {
    try {
      const answer = await reachVendor(await servers(), (server) => askUsage(server, licence.key));
      if (answer.ok && !answer.ownKey) use = { spentCents: answer.spentCents, capCents: answer.capCents, exhausted: answer.exhausted, resetsAt: answer.resetsAt, ownKey: answer.ownKey };
    } catch (err) {
      console.warn("[licence] could not ask about reading:", err instanceof Error ? err.message : err);
    }
  }
  usageCache = { at: Date.now(), use };
  return use;
}

/** After a reading: the count has moved, so the next look asks again. */
export function forgetReadingUsage(): void {
  usageCache = null;
}
onRelayCall(forgetReadingUsage);

let lastAsked = 0;

/**
 * How the copy stands, asking the vendor first when the last answer is a day old. A vendor that
 * cannot be reached leaves the last answer in place; the state says when it is getting stale.
 */
export async function currentLicence(): Promise<LicenceState> {
  if (!licenceServer()) return { kind: "unlicensed" };
  let licence = await getLicence();
  const due = licence && Date.now() - new Date(licence.checkedAt).getTime() > CHECK_EVERY_MS && Date.now() - lastAsked > 60_000;
  if (licence && due) {
    lastAsked = Date.now();
    try {
      const body = await checkIn(licence.key);
      const answer = await reachVendor(await servers(), (server) => askVendor(server, "check", body));
      licence = licenceFromAnswer(licence.key, answer, licence);
      await saveLicence(licence);
      await refreshConventions();
    } catch (err) {
      console.warn("[licence] could not check in:", err instanceof Error ? err.message : err);
    }
  }
  return licenceState(licence);
}

/**
 * A payment page for this copy's client on a plan, or its billing page, from the vendor. The
 * link is opened in the browser; the copy's standing changes when the vendor hears from Stripe
 * and this copy next checks its key.
 */
export async function billingLink(what: "checkout" | "portal", plan?: string): Promise<{ url: string } | { refused: string }> {
  const licence = await getLicence();
  if (!licence) return { refused: "This copy has no licence key yet. Start the trial first; paying comes after." };
  const answer = await reachVendor(await servers(), (server) => askForBilling(server, what, { key: licence.key, ...(plan ? { plan } : {}) }));
  return answer.ok ? { url: answer.url } : { refused: answer.why };
}
