"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveShopAction } from "@/app/(catalog)/actions";
import { Alert, Button, Card, Field, INPUT } from "@/app/(catalog)/ui";
import { ActionForm } from "@/app/(catalog)/ActionForm";
import { COUNTRIES, type ShopProfile } from "@/lib/catalog/shop";

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
  const [pack, setPack] = useState<ShopProfile["pack"]>(profile.pack);

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
      <Field label="What you sell" hint="A few words, in your own. It tells the reader what kind of documents to expect." className="sm:col-span-2"><input name="sells" required defaultValue={profile.sells} className={INPUT} placeholder="bikes, parts and riding gear" /></Field>
      <Field label="Country">
        <select name="country" value={country} onChange={(e) => pickCountry(e.target.value)} className={INPUT}>
          {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Currency" hint="The one your prices are in."><input name="currency" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} className={INPUT} /></Field>
      <Field label="Sales tax is called" hint="Leave empty if prices carry none."><input name="taxName" value={taxName} onChange={(e) => setTaxName(e.target.value)} className={INPUT} placeholder="GST" /></Field>
      <Field label="Rate (%)"><input name="taxRate" type="number" step="0.1" min={0} max={100} value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className={INPUT} /></Field>

      <fieldset className="sm:col-span-2">
        <legend className="mb-2 text-[14px] font-semibold">Rules to start from</legend>
        <label className={`mb-2 flex cursor-pointer gap-3 rounded-[12px] border p-3 ${pack === "general" ? "border-[var(--meta)] bg-[var(--meta-tint)]" : "border-[var(--line)] bg-white"}`}>
          <input type="radio" name="pack" value="general" checked={pack === "general"} onChange={() => setPack("general")} className="mt-1" />
          <span>
            <span className="block font-semibold">Start blank and learn from my catalogue</span>
            <span className="block text-[13px] text-[var(--ink-soft)]">Flöda takes its kinds of product, menus and tag spellings from your Shopify export on the next step, and its conventions per brand from the same file. Right for any shop whose paperwork is not snow gear.</span>
          </span>
        </label>
        <label className={`flex cursor-pointer gap-3 rounded-[12px] border p-3 ${pack === "snow-outdoor" ? "border-[var(--meta)] bg-[var(--meta-tint)]" : "border-[var(--line)] bg-white"}`}>
          <input type="radio" name="pack" value="snow-outdoor" checked={pack === "snow-outdoor"} onChange={() => setPack("snow-outdoor")} className="mt-1" />
          <span>
            <span className="block font-semibold">Snow and outdoor</span>
            <span className="block text-[13px] text-[var(--ink-soft)]">Skis, snowboards, boots, bindings, packages, outerwear, packs, tents and climbing gear, with the menu, binding classification, mount charges, package and season rules Flöda was built with. Your own export still teaches it on top.</span>
          </span>
        </label>
      </fieldset>

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
