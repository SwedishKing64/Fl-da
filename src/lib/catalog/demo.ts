/**
 * A demo of Flöda nobody has to sign in to.
 *
 * An admin makes a link once, on Settings; anyone who opens it is signed in as a staff member
 * called "Demo visitor" and lands on a Northwind Supply order already read and built, with
 * everything the review grid does to try. The order is made up, so nothing on it is anyone's
 * wholesale price. The link is a long random token kept in the database, and revoking it on
 * Settings ends every demo session at once. An admin can also set the token by hand, as
 * DEMO_TOKEN in the environment, for a copy whose Settings nobody has opened yet.
 */

import { randomBytes } from "node:crypto";
import { prisma, parseJson } from "./db";
import { createSession, hashPassword } from "./auth";
import { autoApplyMappings, extractStoredFile, storeFile } from "./pipeline";
import { initialsFrom } from "./tagging";
import { logAudit } from "./audit";

export const DEMO_TOKEN_SETTING = "demo.token";
export const DEMO_EMAIL = "demo@floda.local";
export const DEMO_SUPPLIER = "Northwind Supply";
export const DEMO_BATCH = "Demo: Northwind Supply order";
export const DEMO_FILENAME = "Northwind_order_1182.csv";

export const DEMO_ORDER_CSV = `Item Code,Brand,Product,Product Type,Colour,Size,Ordered,Unit Cost,RRP,Barcode
NW-4471,Northwind,Merino Crew Sweater,Knitwear,Charcoal,S,4,58.00,139.00,9312345000012
NW-4471,Northwind,Merino Crew Sweater,Knitwear,Charcoal,M,6,58.00,139.00,9312345000029
NW-4471,Northwind,Merino Crew Sweater,Knitwear,Charcoal,L,4,58.00,139.00,9312345000036
NW-5120,Northwind,Trail Runner 2,Footwear,Slate,9,3,71.00,179.00,9312345000043
NW-5120,Northwind,Trail Runner 2,Footwear,Slate,10,4,71.00,179.00,9312345000050
NW-5120,Northwind,Trail Runner 2,Footwear,Slate,11,3,71.00,179.00,9312345000067
NW-6033,Northwind,Insulated Bottle 750ml,Drinkware,Forest,One size,12,14.50,39.95,9312345000074
NW-7008,Northwind,Daypack 22L,Bags,Navy,One size,5,52.00,129.00,9312345000081
NW-8821,Northwind,Rain Shell Jacket,Jackets,Olive,M,3,96.00,229.00,9312345000098
NW-8821,Northwind,Rain Shell Jacket,Jackets,Olive,L,3,96.00,229.00,9312345000104
NW-9102,Northwind,Wool Beanie,Accessories,Rust,One size,10,9.80,29.95,9312345000111
NW-9340,Northwind,Canvas Tote,Bags,Natural,One size,8,11.20,34.95,9312345000128
`;

export async function getDemoToken(): Promise<string> {
  const row = await prisma.appSetting.findUnique({ where: { key: DEMO_TOKEN_SETTING } });
  return parseJson<string>(row?.value, "") || (process.env.DEMO_TOKEN ?? "").trim();
}

export async function makeDemoToken(): Promise<string> {
  const token = randomBytes(18).toString("base64url");
  await prisma.appSetting.upsert({ where: { key: DEMO_TOKEN_SETTING }, create: { key: DEMO_TOKEN_SETTING, value: JSON.stringify(token) }, update: { value: JSON.stringify(token) } });
  return token;
}

/** Ends the demo: the link stops working and every demo session is signed out. */
export async function revokeDemoToken(): Promise<void> {
  await prisma.appSetting.deleteMany({ where: { key: DEMO_TOKEN_SETTING } });
  const user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (user) await prisma.session.deleteMany({ where: { userId: user.id } });
}

/** The demo user, made the first time the link is opened. Staff, so Settings stays an admin's. */
async function demoUser() {
  const had = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (had) return had;
  return prisma.user.create({ data: { email: DEMO_EMAIL, name: "Demo visitor", role: "STAFF", passwordHash: hashPassword(randomBytes(24).toString("hex")) } });
}

/** The demo order, read and built the first time, found after that. Returns its batch id. */
async function demoBatch(userId: string, origin: string): Promise<string> {
  const had = await prisma.importBatch.findFirst({ where: { name: DEMO_BATCH }, select: { id: true, _count: { select: { products: true } } } });
  if (had && had._count.products > 0) return had.id;
  const supplier = await prisma.supplier.upsert({ where: { name: DEMO_SUPPLIER }, create: { name: DEMO_SUPPLIER, defaultBrand: "Northwind" }, update: {} });
  const batch = had
    ? { id: had.id }
    : await prisma.importBatch.create({
        data: { name: DEMO_BATCH, supplierId: supplier.id, createdById: userId, builtBy: initialsFrom("Demo visitor"), currency: supplier.defaultCurrency, gstTreatment: supplier.defaultGstTreatment, notes: "A made-up order, here to try Flöda on. Nothing on it is a real price." },
      });
  if (!had) {
    const { id: fileId } = await storeFile(batch.id, { filename: DEMO_FILENAME, mimeType: "text/csv", buffer: Buffer.from(DEMO_ORDER_CSV, "utf8"), kind: "INVOICE" });
    await extractStoredFile(fileId, origin);
  }
  await autoApplyMappings(batch.id, userId);
  await logAudit("batch.created", { batchId: batch.id, userId, details: { name: DEMO_BATCH, demo: true } });
  return batch.id;
}

/**
 * Open the demo for whoever holds the link: sign them in as the demo visitor and hand back the
 * order to look at. Null when the token is not the one on Settings.
 */
export async function enterDemo(token: string, origin: string): Promise<{ batchId: string | null } | null> {
  const expected = await getDemoToken();
  if (!expected || token !== expected) return null;
  const user = await demoUser();
  let batchId: string | null = null;
  try {
    batchId = await demoBatch(user.id, origin);
  } catch (err) {
    console.error(`[demo] the order could not be built: ${err instanceof Error ? err.message : String(err)}`);
  }
  await createSession(user.id);
  await logAudit("demo.entered", { userId: user.id, details: { batchId } });
  return { batchId };
}
