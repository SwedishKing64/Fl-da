"use server";

import { z } from "zod";
import { prisma } from "@/lib/catalog/db";
import { logAudit } from "@/lib/catalog/audit";

/**
 * A retailer putting their hand up from the landing page.
 *
 * Kept in the app's own settings table, under one key, as a list: nothing to set up, nothing to
 * send anywhere, and an admin can read them off the database until there is a proper place for
 * them. The page is public, so the fields are checked and capped.
 */
const LEADS_KEY = "floda.leads";

const Lead = z.object({
  email: z.string().trim().email().max(200),
  shop: z.string().trim().min(1).max(120),
  sells: z.string().trim().max(120),
  platform: z.string().trim().max(60),
  note: z.string().trim().max(1000),
});

export type RegisterResult = { ok: true } | { ok: false; error: string };

export async function registerInterestAction(_prev: RegisterResult | null, form: FormData): Promise<RegisterResult> {
  const parsed = Lead.safeParse({
    email: form.get("email") ?? "",
    shop: form.get("shop") ?? "",
    sells: form.get("sells") ?? "",
    platform: form.get("platform") ?? "",
    note: form.get("note") ?? "",
  });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: first?.path[0] === "email" ? "That email address does not look right." : "The shop's name is needed." };
  }
  const lead = { ...parsed.data, at: new Date().toISOString() };
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: LEADS_KEY } });
    const leads: unknown[] = row ? (JSON.parse(row.value) as unknown[]) : [];
    if (!Array.isArray(leads)) throw new Error("leads are not a list");
    const next = JSON.stringify([...leads.slice(-499), lead]);
    await prisma.appSetting.upsert({ where: { key: LEADS_KEY }, create: { key: LEADS_KEY, value: next }, update: { value: next } });
    await logAudit("floda.lead", { details: { email: lead.email, shop: lead.shop } }).catch(() => undefined);
    return { ok: true };
  } catch (err) {
    console.error("[floda] could not keep a lead", err);
    return { ok: false, error: "Something went wrong saving that. Email hello@floda.ai instead and we will get back to you." };
  }
}
