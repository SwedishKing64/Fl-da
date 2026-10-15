/**
 * An open copy: Flöda with no sign-in and no licence.
 *
 * A desktop build made with FLODA_OPEN=1 runs for whoever opens the window. Its launcher opens
 * `/open`, which signs the person in as the copy's owner (an admin called "Shop owner", made the
 * first time) and sends them on; the proxy sends anyone without a session there too, so the login
 * page is never seen. The licence check is off (`licenceServer()` is empty), so there is no trial
 * and no paywall, and the build can carry an Anthropic key of its own (`anthropicApiKey` in
 * floda.json, handed to the server as ANTHROPIC_API_KEY) so documents read without pasting a key.
 *
 * Only a desktop copy should run like this: the server listens on 127.0.0.1 and the window is
 * the only thing that reaches it. On a hosted copy, "no sign-in" would mean "anyone".
 */

import { randomBytes } from "node:crypto";
import { prisma } from "./db";
import { createSession, hashPassword } from "./auth";

export const OWNER_EMAIL = "owner@floda.local";
export const OWNER_NAME = "Shop owner";

export function openMode(): boolean {
  return process.env.FLODA_OPEN === "1";
}

/** Signs the person in as the owner, making the account the first time. */
export async function enterOpen(): Promise<void> {
  const had = await prisma.user.findUnique({ where: { email: OWNER_EMAIL } });
  const owner = had ?? (await prisma.user.create({ data: { email: OWNER_EMAIL, name: OWNER_NAME, role: "ADMIN", passwordHash: hashPassword(randomBytes(24).toString("hex")) } }));
  await createSession(owner.id);
}

/** Where to go after signing in: a path on this copy, never another site. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/open") || next.startsWith("/login")) return "/";
  return next;
}
