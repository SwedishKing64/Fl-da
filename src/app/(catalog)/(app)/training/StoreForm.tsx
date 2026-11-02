"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { forgetStoreAction, saveStoreAction, setAutoPushAction, syncStoreAction } from "@/app/(catalog)/actions";
import { Alert, Badge, Button, Field, INPUT } from "@/app/(catalog)/ui";
import type { StoreState } from "@/lib/catalog/store-sync";

/**
 * The store connection: a domain and an Admin API token, proved by asking the store its name,
 * then read. What the store teaches is listed with when it was last read, and it can be read
 * again at any time; a batch reads it on its own when the last read is a day old.
 */
export function StoreForm({ state, canInstall = false }: { state: StoreState; canInstall?: boolean }) {
  const router = useRouter();
  const [domain, setDomain] = useState(state.domain);
  const [token, setToken] = useState("");
  const [note, setNote] = useState<{ tone: "success" | "danger" | "info"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(!state.configured);
  const [autoPush, setAutoPush] = useState(state.autoPush);

  const toggleAuto = (on: boolean) =>
    start(async () => {
      setAutoPush(on);
      const r = await setAutoPushAction(on);
      if (!r.ok) { setAutoPush(!on); setNote({ tone: "danger", text: r.error }); return; }
      setNote({ tone: "info", text: on ? "On. After a build, every product with every field above the bar goes to the store as a draft on its own, when its supplier reads clean; the rest wait for the quick look. Nothing goes live: a draft is looked at in the store before it is published." : "Off. Products go to the store only when someone presses the button on the quick look or the export page." });
      router.refresh();
    });

  const connect = () =>
    start(async () => {
      setNote(null);
      const r = await saveStoreAction({ domain, token });
      if (!r.ok) return setNote({ tone: "danger", text: r.error });
      setNote({ tone: "info", text: `Connected to ${r.data!.name}. Reading it…` });
      const s = await syncStoreAction();
      if (!s.ok) return setNote({ tone: "danger", text: s.error });
      setToken("");
      setEditing(false);
      setNote({ tone: "success", text: `Read ${s.data!.products} products: ${s.data!.types} product types, ${s.data!.templates} conventions per brand and kind, and every listing for placing orders on.` });
      router.refresh();
    });

  const readAgain = () =>
    start(async () => {
      setNote(null);
      const s = await syncStoreAction();
      if (!s.ok) return setNote({ tone: "danger", text: s.error });
      setNote({ tone: "success", text: `Read ${s.data!.products} products: ${s.data!.types} product types, ${s.data!.templates} conventions per brand and kind.` });
      router.refresh();
    });

  const forget = () =>
    start(async () => {
      if (!confirm("Forget the store connection? What its reads taught is dropped; what an export taught stays.")) return;
      const r = await forgetStoreAction();
      setNote(r.ok ? { tone: "info", text: "Forgotten." } : { tone: "danger", text: r.error });
      setEditing(true);
      setDomain("");
      router.refresh();
    });

  return (
    <div className="space-y-4 text-[14px]">
      <p className="text-[var(--ink-soft)]">
        Connect the store once and Flöda reads it instead of being told: which product types it has, which tags go with each, how each brand is listed, and every listing an order line can be placed on. It reads the store again before a batch when the last read is a day old, so a product added in the store last week is known to this week&rsquo;s batch. The connection reads, and on the export page pushes drafts; it never changes a listing on its own.
      </p>

      {state.configured && !editing && (
        <div className="rounded-[12px] border border-[var(--line)] bg-[var(--canvas-2)] px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="success">Connected</Badge>
            <span className="font-semibold">{state.domain}</span>
            {state.tokenTail && <span className="text-[12.5px] text-[var(--ink-soft)]">token {state.tokenTail}</span>}
            {state.syncedAt ? (
              <span className="text-[12.5px] text-[var(--ink-soft)]">read {new Date(state.syncedAt).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}: {state.products} products, {state.types} kinds, {state.templates} conventions</span>
            ) : (
              <span className="text-[12.5px] text-[var(--ink-soft)]">not read yet</span>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="primary" disabled={pending} onClick={readAgain}>{pending ? "Reading…" : "Read it again"}</Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setEditing(true)}>{canInstall ? "Connect again" : "Change the token"}</Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={forget}>Forget the store</Button>
          </div>
        </div>
      )}

      {editing && canInstall && (
        // Flöda's Shopify app: the owner approves it on their own admin, and comes back here.
        <form action="/api/shopify/install" method="get" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="next" value="/training#store" />
          <Field label="Your store" hint="The name before .myshopify.com, as your Shopify admin shows it.">
            <input id="store-shop" name="shop" className={INPUT} defaultValue={state.domain.replace(/\.myshopify\.com$/, "")} placeholder="your-shop" required />
          </Field>
          <Button variant="primary" type="submit">Connect with Shopify</Button>
          {state.configured && <Button variant="ghost" type="button" onClick={() => setEditing(false)}>Cancel</Button>}
        </form>
      )}

      {editing && !canInstall && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Store domain" hint="Your Shopify admin's address, such as alpine-sports.myshopify.com.">
            <input className={INPUT} value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="your-shop.myshopify.com" autoComplete="off" />
          </Field>
          <Field label="Admin API access token" hint={state.tokenTail ? `A token ending ${state.tokenTail} is kept; leave this empty to keep it.` : "From a custom app in Shopify admin (Settings → Apps → Develop apps) with read_products, write_products, read_inventory, read_files and write_files (the files scopes keep your pictures in your store's Files)."}>
            <input className={INPUT} type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="shpat_…" autoComplete="off" />
          </Field>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <Button variant="primary" disabled={pending || !domain.trim() || (!token.trim() && !state.tokenTail)} onClick={connect}>{pending ? "Reading the store…" : "Connect and read the store"}</Button>
            {state.configured && <Button variant="ghost" disabled={pending} onClick={() => { setEditing(false); setToken(""); setDomain(state.domain); }}>Cancel</Button>}
          </div>
        </div>
      )}

      {state.configured && !editing && (
        <label className="flex items-start gap-3 rounded-[12px] border border-[var(--line)] px-4 py-3">
          <input type="checkbox" className="mt-1" checked={autoPush} disabled={pending} onChange={(e) => toggleAuto(e.target.checked)} />
          <span>
            <span className="block font-semibold">Push what is ready on its own</span>
            <span className="block text-[13px] text-[var(--ink-soft)]">After a build, a product with every field above the bar and nothing wrong on it goes to the store as a draft without anyone pressing anything, once its supplier has a clean record. The products that need a look wait on the quick look and go with one press. Drafts only; a push can be rolled back from the export page.</span>
          </span>
        </label>
      )}

      {note && <Alert tone={note.tone}>{note.text}</Alert>}
    </div>
  );
}
