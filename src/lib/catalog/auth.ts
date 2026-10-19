// Minimal email/password auth for a handful of staff accounts. Passwords are scrypt-hashed,
// sessions live in the database and are referenced by an httpOnly cookie.

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { ensureConventions } from "./shop-profile";

export const SESSION_COOKIE = "catalog_session";
const SESSION_DAYS = 14;

export type Role = "ADMIN" | "STAFF";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export async function createSession(userId: string): Promise<string> {
  const id = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
  await prisma.session.create({ data: { id, userId, expiresAt } });
  const store = await cookies();
  store.set(SESSION_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: expiresAt });
  return id;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const id = store.get(SESSION_COOKIE)?.value;
  if (id) await prisma.session.deleteMany({ where: { id } });
  store.delete(SESSION_COOKIE);
}

/**
 * Who is signed in, looked up once per render rather than once per caller.
 *
 * The layout asks, and then the page inside it asks again, so every single page was paying for two
 * identical session queries before it rendered anything. React's cache dedupes them for the life of
 * one request — which is exactly the scope that is safe, since a different request is a different
 * person.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const store = await cookies();
  const id = store.get(SESSION_COOKIE)?.value;
  if (!id) return null;
  const session = await prisma.session.findUnique({ where: { id }, include: { user: true } });
  if (!session || session.expiresAt < new Date()) return null;
  return { id: session.user.id, email: session.user.email, name: session.user.name, role: session.user.role as Role };
});

/** For pages: redirect to login (or to setup when no users exist yet). */
export async function requireUser(role?: Role): Promise<CurrentUser> {
  await ensureConventions();
  const user = await getCurrentUser();
  if (!user) {
    const count = await prisma.user.count();
    redirect(count === 0 ? "/setup" : "/login");
  }
  if (role === "ADMIN" && user.role !== "ADMIN") redirect("/?denied=1");
  return user;
}

/** For route handlers: returns null instead of redirecting. */
export async function requireApiUser(role?: Role): Promise<CurrentUser | null> {
  await ensureConventions();
  const user = await getCurrentUser();
  if (!user) return null;
  if (role === "ADMIN" && user.role !== "ADMIN") return null;
  return user;
}

export async function usersExist(): Promise<boolean> {
  return (await prisma.user.count()) > 0;
}

/**
 * A way back in that does not depend on what the database holds (asked 2026-10-19).
 *
 * The shop could not sign in with its two long-standing accounts, and with nobody signed in there
 * is no Settings page to put an account back from. So two values set in the Vercel project — never
 * in the code, never in a chat — let the named emails sign in with the password they give:
 *
 *   FLODA_RECOVERY_EMAILS     owner@example.com, manager@example.com
 *   FLODA_RECOVERY_PASSWORD   (a password of at least 12 characters)
 * (RUBIN_RECOVERY_EMAILS and RUBIN_RECOVERY_PASSWORD, the ski shop's names for them, also work.)
 *
 * Signing in that way makes sure the account exists, as an admin, with that password, in the
 * database the site is using. Remove the two values once the accounts work again.
 */
const recoveryPassword = (): string => process.env.FLODA_RECOVERY_PASSWORD ?? process.env.RUBIN_RECOVERY_PASSWORD ?? "";

export function recoveryEnabled(): boolean {
  return recoveryEmails().length > 0 && recoveryPassword().length >= 12;
}

function recoveryEmails(): string[] {
  return (process.env.FLODA_RECOVERY_EMAILS ?? process.env.RUBIN_RECOVERY_EMAILS ?? "").split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@"));
}

/** The account for a recovery sign-in, made or brought up to date; null when this is not one. */
export async function recoveryUser(email: string, password: string): Promise<{ id: string } | null> {
  if (!recoveryEnabled() || !recoveryEmails().includes(email.trim().toLowerCase())) return null;
  const expected = Buffer.from(recoveryPassword());
  const given = Buffer.from(password);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const address = email.trim().toLowerCase();
  const name = address.split("@")[0].replace(/^./, (c) => c.toUpperCase());
  return prisma.user.upsert({
    where: { email: address },
    create: { email: address, name, role: "ADMIN", passwordHash: hashPassword(password) },
    update: { role: "ADMIN", passwordHash: hashPassword(password) },
    select: { id: true },
  });
}
