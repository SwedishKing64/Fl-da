"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { disconnectShopifyAction, saveShopifyTokenAction } from "@/app/(catalog)/actions";
import { Alert, Button, Field, INPUT } from "@/app/(catalog)/ui";

/** What came back from Shopify, as the person reads it. */
const OUTCOMES: Record<string, { tone: "success" | "warning"; text: string }> = {
  connected: { tone: "success", text: "Connected. Flöda can now read your store and push drafts to it." },
  "bad-shop": { tone: "warning", text: "That is not a store address. Use the name before .myshopify.com, as it shows in your Shopify admin." },
  expired: { tone: "warning", text: "The approval took too long, or came back for a different store. Start again." },
  unsigned: { tone: "warning", text: "The reply did not carry Shopify's signature, so it was not trusted. Start again." },
  declined: { tone: "warning", text: "The store did not approve Flöda's access." },
  failed: { tone: "warning", text: "Shopify approved, but did not hand over the access token. Start again; if it keeps happening, check the app's client ID and secret." },
  "signed-out": { tone: "warning", text: "You were signed out while on Shopify. Sign in and connect again." },
};

/**
 * Connecting the shop's Shopify store. Where this copy has Flöda's Shopify app set up, the owner
 * names the store and approves Flöda on it; otherwise an Admin API token is pasted, as before.
 */
export function ShopifyConnect({ connected, canInstall, outcome, next = "/settings#shopify", intro = true }: { connected: { domain: string; by: "oauth" | "token" } | null; canInstall: boolean; outcome?: string; next?: string; intro?: boolean }) {
  const [shop, setShop] = useState("");
  const [domain, setDomain] = useState("");
  const [token, setToken] = useState("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const said = outcome ? OUTCOMES[outcome] : undefined;

  return (
    <div className="space-y-4">
      {said && <Alert tone={said.tone}>{said.text}</Alert>}
      {connected ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[14px]">Connected to <strong>{connected.domain}</strong>{connected.by === "oauth" ? " through the install link." : " with a pasted token."}</p>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => { if (confirm("Disconnect the store? Flöda stops reading it and cannot push until it is connected again.")) start(async () => { await disconnectShopifyAction(); router.refresh(); }); }}>Disconnect</Button>
        </div>
      ) : intro ? (
        <p className="text-[14px] text-[var(--ink-soft)]">Connect your store so Flöda can read what you already sell and push new products to it as drafts.</p>
      ) : null}
      {canInstall ? (
        <form action="/api/shopify/install" method="get" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="next" value={next} />
          <Field label="Your store" hint="The name before .myshopify.com, as your Shopify admin shows it.">
            <input id="shopify-shop" name="shop" className={INPUT} value={shop} onChange={(e) => setShop(e.target.value)} placeholder="your-shop" required />
          </Field>
          <Button variant="primary" type="submit">{connected ? "Connect again" : "Connect with Shopify"}</Button>
        </form>
      ) : (
        <div className="space-y-3">
          <p className="text-[13px] text-[var(--ink-soft)]">This copy has no Shopify app set up, so it connects with an Admin API token from a custom app on your store (Settings → Apps → Develop apps). Give the app read_products, write_products, read_inventory, write_inventory, read_locations, read_files and write_files: the last two let your pictures be kept in your store&apos;s Files, where Shopify can always fetch them.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Store domain"><input id="shopify-domain" className={INPUT} value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="your-shop.myshopify.com" /></Field>
            <Field label="Admin API access token"><input id="shopify-token" type="password" className={INPUT} value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" /></Field>
          </div>
          <Button disabled={pending || !domain || !token} onClick={() => start(async () => {
            setNote(null);
            const r = await saveShopifyTokenAction({ domain, token });
            setNote(r.ok ? { ok: true, text: r.message ?? "Connected." } : { ok: false, text: r.error });
            if (r.ok) { setToken(""); router.refresh(); }
          })}>{pending ? "Checking…" : "Connect"}</Button>
          {note && <Alert tone={note.ok ? "success" : "warning"}>{note.text}</Alert>}
        </div>
      )}
    </div>
  );
}
