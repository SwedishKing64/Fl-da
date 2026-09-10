// Minimal email/password auth for a handful of staff accounts. Passwords are scrypt-hashed,
// sessions live in the database and are referenced by an httpOnly cookie.

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";

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

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const store = await cookies();
  const id = store.get(SESSION_COOKIE)?.value;
  if (!id) return null;
  const session = await prisma.session.findUnique({ where: { id }, include: { user: true } });
  if (!session || session.expiresAt < new Date()) return null;
  return { id: session.user.id, email: session.user.email, name: session.user.name, role: session.user.role as Role };
}

/** For pages: redirect to login (or to setup when no users exist yet). */
export async function requireUser(role?: Role): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    const count = await prisma.user.count();
    redirect(count === 0 ? "/catalog/setup" : "/catalog/login");
  }
  if (role === "ADMIN" && user.role !== "ADMIN") redirect("/catalog?denied=1");
  return user;
}

/** For route handlers: returns null instead of redirecting. */
export async function requireApiUser(role?: Role): Promise<CurrentUser | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  if (role === "ADMIN" && user.role !== "ADMIN") return null;
  return user;
}

export async function usersExist(): Promise<boolean> {
  return (await prisma.user.count()) > 0;
}
