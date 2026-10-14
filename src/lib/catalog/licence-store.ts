/**
 * The installed copy's licence, kept in the database and refreshed about once a day. See
 * licence.ts for what the pieces mean.
 */

import { randomUUID } from "node:crypto";
import { prisma, parseJson } from "./db";
import { CHECK_EVERY_MS, LICENCE_KEY_SETTING, askVendor, licenceFromAnswer, licenceServer, licenceState, type CheckIn, type Licence, type LicenceState } from "./licence";
import { shopProfile } from "./shop-profile";

const INSTALL_KEY = "install.id";

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

async function checkIn(key: string): Promise<CheckIn> {
  return {
    key,
    install: await installId(),
    shop: shopProfile().name,
    version: process.env.FLODA_VERSION ?? process.env.npm_package_version ?? "",
    platform: `${process.platform}${process.env.FLODA_DESKTOP ? " desktop" : ""}`,
  };
}

/** Enter a key: the vendor is asked now, and the answer kept whatever it is. */
export async function activate(key: string): Promise<Licence> {
  const server = licenceServer();
  if (!server) throw new Error("This copy is not set up to check a licence.");
  const previous = await getLicence();
  const answer = await askVendor(server, "activate", await checkIn(key));
  const licence = licenceFromAnswer(key, answer, previous);
  await saveLicence(licence);
  return licence;
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
      const answer = await askVendor(licenceServer(), "check", await checkIn(licence.key));
      licence = licenceFromAnswer(licence.key, answer, licence);
      await saveLicence(licence);
    } catch (err) {
      console.warn("[licence] could not check in:", err instanceof Error ? err.message : err);
    }
  }
  return licenceState(licence);
}
