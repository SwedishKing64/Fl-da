"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveShopAction } from "@/app/(catalog)/actions";
import { Alert, Button, Card, Field, INPUT, cx } from "@/app/(catalog)/ui";
import { ActionForm } from "@/app/(catalog)/ActionForm";
import { COUNTRIES, type ShopProfile } from "@/lib/catalog/shop";
import { PACKS, PICKABLE_PACKS, packIds } from "@/lib/catalog/trades";

/**
 * Who the shop is and what it sells. The same form sits on Settings; in setup it moves on to the
 * next step once saved.
 */
export function ShopForm({ profile, next }: { profile: ShopProfile; next?: string }) {
  const [state, action, pending] = useActionState(saveShopAction, null);
  const router = useRouter();
  const [country, setCountry] = useState(profile.country);
  const [currency, setCurrency] = useState(profile.currency);
  const [taxName, setTaxName] = useState(profile.taxName);
  const [taxRate, setTaxRate] = useState(String(Math.round(profile.taxRate * 1000) / 10));
  const [packs, setPacks] = useState<string[]>(packIds(profile.pack));
  const toggle = (id: string, on: boolean) => setPacks((now) => (on ? [...now.filter((p) => p !== id), id] : now.filter((p) => p !== id)));

  useEffect(() => {
    if (next && state?.ok) router.push(next);
  }, [state, next, router]);

  const pickCountry = (code: string) => {
    setCountry(code);
    const c = COUNTRIES.find((x) => x.code === code);
    if (c) { setCurrency(c.currency); setTaxName(c.taxName); setTaxRate(String(Math.round(c.taxRate * 1000) / 10)); }
  };

  return (
    <ActionForm action={action} state={state} className="grid gap-4 sm:grid-cols-2">
      <Field label="Shop name" hint="As it should read on a product's SEO title." className="sm:col-span-2"><input name="name" required defaultValue={profile.name} className={INPUT} placeholder="Northside Bikes" /></Field>
      <Field label="Your shop in a few words" hint="What it sells, in your own words. It tells the reader what kind of documents to expect." className="sm:col-span-2"><input name="sells" required defaultValue={profile.sells} className={INPUT} placeholder="bikes, parts and riding gear" /></Field>
      <Field label="Country">
        <select name="country" value={country} onChange={(e) => pickCountry(e.target.value)} className={INPUT}>
          {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Currency" hint="The one your prices are in."><input name="currency" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} className={INPUT} /></Field>
      <Field label="Sales tax is called" hint="Leave empty if prices carry none."><input name="taxName" value={taxName} onChange={(e) => setTaxName(e.target.value)} className={INPUT} placeholder="GST" /></Field>
      <Field label="Rate (%)"><input name="taxRate" type="number" step="0.1" min={0} max={100} value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className={INPUT} /></Field>

      {/* Every shop starts blank unless it picks a trade to start from. Nothing from another shop
          carries over; a trade pack is only a starting menu, and the shop's own store overrides it. */}
      <fieldset className="sm:col-span-2">
        <legend className="mb-2 text-[13.5px] font-semibold text-[var(--ink-2)]">What do you sell?</legend>
        <p className="mb-2 text-[12.5px] text-[var(--ink-soft)]">Tick each trade that fits, or none. A trade gives Flöda a starting menu, the sizes that trade uses and where its products sit in Shopify; your own store overrides it.</p>
        <input type="hidden" name="pack" value={packs.length ? packs.join("+") : "general"} />
        <div className="grid gap-2 sm:grid-cols-2">
          {PICKABLE_PACKS.map((id) => (
            <label key={id} className={cx("flex cursor-pointer gap-2.5 rounded-[12px] border p-3 transition", packs.includes(id) ? "border-[var(--meta)] bg-[var(--meta-tint)]" : "border-[var(--line)] bg-white hover:border-[var(--meta-bright)]")}>
              <input id={`pack-${id}`} type="checkbox" className="mt-1" checked={packs.includes(id)} onChange={(e) => toggle(id, e.target.checked)} />
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold">{PACKS[id].name}</span>
                <span className="block text-[12.5px] leading-snug text-[var(--ink-soft)]">{PACKS[id].sells}</span>
                {PACKS[id].knowledge?.verified === false && <span className="mt-1 block text-[12px] text-[var(--passive)]">A first draft, not yet checked against real invoices from shops in this trade.</span>}
              </span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-[12.5px] text-[var(--ink-soft)]">{packs.length ? "" : "None ticked: Flöda learns everything from your own store and paperwork, and asks the first time it meets something new."}</p>
      </fieldset>
      <p className="rounded-[12px] bg-[var(--meta-tint)] px-3 py-2.5 text-[13.5px] sm:col-span-2">
        Flöda learns your product types from your store, your website or your Shopify export, your supplier formats from their invoices, and how you list from the rules you set, all on <strong>Teach Flöda</strong>. A trade to start from only fills the gaps until it has; nothing from any other shop carries over.
      </p>

      <Field label="Marker tag" hint="Optional. A tag written on everything Flöda builds, with the builder's initials on the end (abc → abc-jd), so you can find its work in Shopify. Leave empty for none." className="sm:col-span-2">
        <input name="marker" defaultValue={profile.marker} maxLength={12} className={INPUT} placeholder="floda" />
      </Field>

      {state && <div className="sm:col-span-2">{state.ok ? <Alert tone="success">{state.message}</Alert> : <Alert tone="danger">{state.error}</Alert>}</div>}
      <div className="sm:col-span-2"><Button type="submit" variant="primary" icon="🏪" disabled={pending}>{pending ? "Saving…" : next ? "Save and continue" : "Save"}</Button></div>
    </ActionForm>
  );
}

export function ShopStep({ profile }: { profile: ShopProfile }) {
  return (
    <Card title="Your shop">
      <p className="mb-4 text-[14px] text-[var(--ink-soft)]">Nothing about a shop is built into Flöda. What you say here is how it reads your paperwork and writes your listings, and you can change any of it later in Settings.</p>
      <ShopForm profile={profile} next="/setup?step=learn" />
    </Card>
  );
}
