"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { changePlan, currentAccount, signInAccount, signOutAccount, signUpAccount } from "@/lib/catalog/account";
import { vendorMode } from "@/lib/catalog/licence";
import { isPlanId } from "@/lib/catalog/plans";
import { createCheckout, createPortal, stripeConfigured } from "@/lib/catalog/stripe";
import { SUPPORT_EMAIL } from "@/lib/catalog/support";
import { logAudit } from "@/lib/catalog/audit";

export type AccountResult = { ok: true; message?: string; url?: string } | { ok: false; error: string };

/** The website's own address, for Stripe to send the person back to. */
async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "https://fl-da.vercel.app";
}

export async function signUpAction(_prev: AccountResult | null, form: FormData): Promise<AccountResult> {
  if (!vendorMode()) return { ok: false, error: "Accounts are made on Flöda's own website." };
  const out = await signUpAccount({ shop: String(form.get("shop") ?? ""), email: String(form.get("email") ?? ""), password: String(form.get("password") ?? ""), plan: String(form.get("plan") ?? "shop") });
  if (!out.ok) return { ok: false, error: out.why };
  await logAudit("account.made", { details: { client: out.client.id, plan: out.client.plan } });
  redirect("/account?welcome=1");
}

export async function signInAction(_prev: AccountResult | null, form: FormData): Promise<AccountResult> {
  if (!vendorMode()) return { ok: false, error: "Accounts are on Flöda's own website." };
  const out = await signInAccount(String(form.get("email") ?? ""), String(form.get("password") ?? ""));
  if (!out.ok) return { ok: false, error: out.why };
  redirect("/account");
}

export async function signOutAction(): Promise<void> {
  await signOutAccount();
  redirect("/account/login");
}

/** A Stripe checkout page for the signed-in shop on a plan. Same tab: this is the website. */
export async function accountCheckoutAction(plan: string): Promise<AccountResult> {
  const client = await currentAccount();
  if (!client) return { ok: false, error: "Sign in first." };
  if (!isPlanId(plan)) return { ok: false, error: "That is not a plan." };
  if (!stripeConfigured()) return { ok: false, error: `Paying online is not set up yet. Write to ${SUPPORT_EMAIL} and a person will sort the plan out.` };
  try {
    const url = await createCheckout(client, plan, await origin());
    await logAudit("account.checkout_opened", { details: { client: client.id, plan } });
    return { ok: true, url };
  } catch (err) {
    return { ok: false, error: `The payment page could not be made: ${err instanceof Error ? err.message : "no answer from Stripe"}.` };
  }
}

/** Stripe's customer portal for the signed-in shop: card, plan, invoices, cancelling. */
export async function accountPortalAction(): Promise<AccountResult> {
  const client = await currentAccount();
  if (!client) return { ok: false, error: "Sign in first." };
  if (!client.stripeCustomerId || !stripeConfigured()) return { ok: false, error: `This account has not paid online yet, so there is no billing page for it. Write to ${SUPPORT_EMAIL} to change anything.` };
  try {
    return { ok: true, url: await createPortal(client.stripeCustomerId, await origin()) };
  } catch (err) {
    return { ok: false, error: `The billing page could not be opened: ${err instanceof Error ? err.message : "no answer from Stripe"}.` };
  }
}

/** On a trial, the plan can still be changed freely; once paid, the plan is changed on the billing page. */
export async function accountPlanAction(plan: string): Promise<AccountResult> {
  const client = await currentAccount();
  if (!client) return { ok: false, error: "Sign in first." };
  if (!isPlanId(plan)) return { ok: false, error: "That is not a plan." };
  if (client.stripeSubscriptionId) return { ok: false, error: "Your plan is paid through Stripe; change it on the billing page." };
  await changePlan(client.id, plan);
  await logAudit("account.plan", { details: { client: client.id, plan } });
  return { ok: true, message: "Plan changed. Your copy sees it the next time it checks its key." };
}
