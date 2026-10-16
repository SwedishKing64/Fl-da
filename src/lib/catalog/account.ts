/**
 * A shop's account on the website: the vendor's side of signing up, signing in and staying
 * signed in.
 *
 * The account is the `Client` row itself, with a password on it. Making one starts the trial
 * and mints the licence key; the shop then signs in to its copy of Flöda with the same email
 * and password (`/api/licence/signin`), which hands the copy the key. The account page shows
 * the plan, the key, the fortnight's reading against its allowance, and the billing buttons.
 * Sessions live in `ClientSession`, named by an httpOnly cookie of their own, so a shop's
 * account and the vendor's own staff login never share a cookie.
 */

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "./db";
import { hashPassword, verifyPassword } from "./auth";
import { newLicenceKey } from "./licence";
import { planOf, TRIAL_DAYS, type PlanId } from "./plans";

export const ACCOUNT_COOKIE = "floda_account";
const SESSION_DAYS = 30;
const MIN_PASSWORD = 8;

export type Account = Awaited<ReturnType<typeof prisma.client.findUniqueOrThrow>>;

const cleanEmail = (email: string) => email.trim().toLowerCase().slice(0, 200);

/** The signed-in shop, or null. */
export async function currentAccount(): Promise<Account | null> {
  const id = (await cookies()).get(ACCOUNT_COOKIE)?.value;
  if (!id) return null;
  const session = await prisma.clientSession.findUnique({ where: { id }, include: { client: true } });
  if (!session || session.expiresAt.getTime() < Date.now()) return null;
  return session.client;
}

async function openSession(clientId: string): Promise<void> {
  const id = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await prisma.clientSession.create({ data: { id, clientId, expiresAt } });
  (await cookies()).set(ACCOUNT_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: expiresAt });
}

export async function signOutAccount(): Promise<void> {
  const store = await cookies();
  const id = store.get(ACCOUNT_COOKIE)?.value;
  if (id) await prisma.clientSession.deleteMany({ where: { id } });
  store.delete(ACCOUNT_COOKIE);
}

export type AccountOutcome = { ok: true; client: Account } | { ok: false; why: string };

/**
 * Make the account, and with it the trial and the key. An email that already has a licence
 * but no password (a client made by hand, or from a lead) claims it by setting one; an email
 * with a password already is told to sign in.
 */
export async function signUpAccount(input: { shop: string; email: string; password: string; plan: string }): Promise<AccountOutcome> {
  const shop = input.shop.trim().slice(0, 120);
  const email = cleanEmail(input.email);
  if (!shop) return { ok: false, why: "The shop's name is needed." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, why: "That email address does not look right." };
  if (input.password.length < MIN_PASSWORD) return { ok: false, why: `The password needs at least ${MIN_PASSWORD} characters.` };
  const plan = planOf(input.plan);
  const had = await prisma.client.findFirst({ where: { email } });
  if (had && had.passwordHash) return { ok: false, why: "That email address already has a Flöda account. Sign in instead." };
  if (had) {
    const client = await prisma.client.update({ where: { id: had.id }, data: { passwordHash: hashPassword(input.password), ...(had.name.trim() ? {} : { name: shop }) } });
    await openSession(client.id);
    return { ok: true, client };
  }
  const client = await prisma.client.create({
    data: {
      name: shop,
      email,
      plan: plan.id,
      status: "TRIAL",
      expiresAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000),
      licenceKey: newLicenceKey(),
      aiCapCents: plan.readingCapCents,
      passwordHash: hashPassword(input.password),
      notes: "Made an account on the website.",
    },
  });
  await openSession(client.id);
  return { ok: true, client };
}

/** Check an email and password against the accounts. The same answer whichever half is wrong. */
export async function checkAccount(email: string, password: string): Promise<Account | null> {
  const client = await prisma.client.findFirst({ where: { email: cleanEmail(email) } });
  if (!client || !client.passwordHash || !verifyPassword(password, client.passwordHash)) return null;
  return client;
}

export async function signInAccount(email: string, password: string): Promise<AccountOutcome> {
  const client = await checkAccount(email, password);
  if (!client) return { ok: false, why: "That email and password do not match an account. If you have a licence but no account yet, make one with the same email." };
  await openSession(client.id);
  return { ok: true, client };
}

export async function changePlan(clientId: string, plan: PlanId): Promise<void> {
  await prisma.client.update({ where: { id: clientId }, data: { plan, aiCapCents: planOf(plan).readingCapCents } });
}
