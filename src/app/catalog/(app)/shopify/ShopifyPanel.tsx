"use client";

import { useState, useTransition } from "react";
import { fetchLocationsAction, saveSettingsAction, syncCatalogAction } from "@/app/catalog/actions";
import { Alert, Button, Card, Field, INPUT } from "@/app/catalog/ui";
import type { ShopifyLocation } from "@/lib/catalog/types";

export function ShopifyPanel({ isAdmin, config, locations }: { isAdmin: boolean; config: { storeDomain: string; apiVersion: string; hasToken: boolean }; locations: ShopifyLocation[] }) {
  const [form, setForm] = useState({ storeDomain: config.storeDomain, accessToken: "", apiVersion: config.apiVersion });
  const [locs, setLocs] = useState(locations);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "success" | "danger" | "info"; text: string } | null>(null);

  return (
    <Card title="Connection">
      <div className="space-y-3">
        <Field label="Store domain"><input value={form.storeDomain} disabled={!isAdmin} onChange={(e) => setForm({ ...form, storeDomain: e.target.value })} placeholder="my-store.myshopify.com" className={INPUT} /></Field>
        <Field label="Admin API access token" hint={config.hasToken ? "A token is saved. Leave blank to keep it." : "shpat_…"}><input type="password" value={form.accessToken} disabled={!isAdmin} onChange={(e) => setForm({ ...form, accessToken: e.target.value })} className={INPUT} autoComplete="off" /></Field>
        <Field label="API version"><input value={form.apiVersion} disabled={!isAdmin} onChange={(e) => setForm({ ...form, apiVersion: e.target.value })} className={INPUT} /></Field>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <div className="flex flex-wrap gap-2">
          {isAdmin && <Button variant="primary" disabled={pending} onClick={() => start(async () => { const r = await saveSettingsAction({ shopify: { storeDomain: form.storeDomain.trim(), apiVersion: form.apiVersion.trim(), ...(form.accessToken ? { accessToken: form.accessToken.trim() } : {}) } as never }); setMsg(r.ok ? { tone: "success", text: "Connection saved." } : { tone: "danger", text: r.error }); })}>Save</Button>}
          <Button disabled={pending || (!config.hasToken && !form.accessToken)} onClick={() => start(async () => { const r = await syncCatalogAction(); setMsg(r.ok ? { tone: "success", text: `Synced ${r.data!.products} products / ${r.data!.variants} variants.` } : { tone: "danger", text: r.error }); })}>{pending ? "Working…" : "Sync catalog now"}</Button>
          {isAdmin && <Button disabled={pending || !config.hasToken} onClick={() => start(async () => { const r = await fetchLocationsAction(); setMsg(r.ok ? { tone: "success", text: `Loaded ${r.data!.count} locations.` } : { tone: "danger", text: r.error }); })}>Load locations</Button>}
        </div>
        <div>
          <div className="mb-1 text-sm font-medium text-[var(--ink-2)]">Inventory locations</div>
          {locs.length === 0 ? <p className="text-xs text-[var(--ink-soft)]">None loaded. With one location, all quantity goes there. With several, set per-location quantities on variants (Details drawer) or the default location receives the full quantity.</p> : (
            <ul className="space-y-1 text-sm">
              {locs.map((l) => <li key={l.id} className="flex items-center gap-2"><input type="radio" name="defaultLoc" checked={Boolean(l.isDefault)} disabled={!isAdmin} onChange={() => { const next = locs.map((x) => ({ ...x, isDefault: x.id === l.id })); setLocs(next); start(async () => { await saveSettingsAction({ locations: next }); }); }} /> {l.name} <span className="font-mono text-[10px] text-[var(--ink-soft)]">{l.id}</span>{l.isDefault && <span className="text-xs text-[var(--violet)]">default</span>}</li>)}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}
