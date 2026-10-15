/**
 * The installed copy's licence, kept in the database and refreshed about once a day. See
 * licence.ts for what the pieces mean.
 */

import { randomUUID } from "node:crypto";
import { prisma, parseJson } from "./db";
import { CHECK_EVERY_MS, LICENCE_KEY_SETTING, askForBilling, askForTrial, askVendor, isServerUrl, licenceFromAnswer, licenceServer, licenceServers, licenceState, reachVendor, type CheckIn, type Licence, type LicenceState } from "./licence";
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

/** Invoices and products built since the first of the month. */
export async function monthUse(now = new Date()): Promise<MonthUse> {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
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
