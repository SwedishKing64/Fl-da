"use client";

import { useActionState, useState } from "react";
import { createBatchAction } from "@/app/(catalog)/actions";
import { Alert, Button, Card, Field, INPUT } from "@/app/(catalog)/ui";
import { ActionForm } from "@/app/(catalog)/ActionForm";
import { CURRENCIES } from "@/lib/catalog/types";

interface SupplierOpt { id: string; name: string; defaultCurrency: string; defaultGstTreatment: string }

export function NewBatchForm({ suppliers, fxRates, home }: { suppliers: SupplierOpt[]; fxRates: Record<string, number>; home: string }) {
  const [state, action, pending] = useActionState(createBatchAction, null);
  const [supplierId, setSupplierId] = useState("");
  const [currency, setCurrency] = useState(home);
  const [gst, setGst] = useState("EXCLUSIVE");
  const [fx, setFx] = useState(1);

  const pickSupplier = (id: string) => {
    setSupplierId(id);
    const s = suppliers.find((x) => x.id === id);
    if (s) {
      setCurrency(s.defaultCurrency);
      setGst(s.defaultGstTreatment);
      setFx(s.defaultCurrency === home ? 1 : fxRates[s.defaultCurrency] ?? 1);
    }
  };

  return (
    <ActionForm action={action} state={state} className="max-w-2xl space-y-5">
      <Card title="Batch">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Batch name" className="sm:col-span-2"><input name="name" required placeholder="e.g. Atomic pre-book Winter 2026" className={INPUT} /></Field>
          <Field label="Supplier">
            <select name="supplierId" value={supplierId} onChange={(e) => pickSupplier(e.target.value)} className={INPUT}>
              <option value="">— New supplier —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          {!supplierId && <Field label="New supplier name" hint="A mapping template will be saved under this name."><input name="newSupplierName" className={INPUT} placeholder="e.g. Amer Sports AU" /></Field>}
        </div>
      </Card>
      <Card title="How the invoice prices work">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Invoice currency">
            <select name="currency" value={currency} onChange={(e) => { setCurrency(e.target.value); setFx(e.target.value === home ? 1 : fxRates[e.target.value] ?? 1); }} className={INPUT}>
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label={`FX rate → ${home}`} hint={currency === home ? `Not needed for ${home}` : `Default from Settings: ${fxRates[currency] ?? "–"}`}>
            <input name="fxRateToHome" type="number" step="0.0001" min="0.0001" value={fx} onChange={(e) => setFx(Number(e.target.value))} disabled={currency === home} className={INPUT} />
          </Field>
          <Field label="GST on cost prices">
            <select name="gstTreatment" value={gst} onChange={(e) => setGst(e.target.value)} className={INPUT}>
              <option value="EXCLUSIVE">Ex GST (GST added on top)</option>
              <option value="INCLUSIVE">Inc GST (GST included)</option>
              <option value="NONE">No GST (overseas supplier)</option>
            </select>
          </Field>
          <Field label={`Freight / landed cost loading (${home})`} hint="Total freight for the whole batch, spread across units."><input name="freightTotalHome" type="number" step="0.01" min="0" defaultValue={0} className={INPUT} /></Field>
          <Field label="Spread freight">
            <select name="freightMode" className={INPUT}>
              <option value="PER_UNIT">Evenly per unit</option>
              <option value="BY_VALUE">Pro-rata by cost value</option>
            </select>
          </Field>
          <Field label="Export files" hint="Shopify imports are easier to manage per brand.">
            <select name="splitExportBy" defaultValue="BRAND" className={INPUT}><option value="BRAND">One CSV per brand</option><option value="PRODUCT_TYPE">One CSV per product type</option><option value="NONE">Single CSV</option></select>
          </Field>
          <Field label="Notes" className="sm:col-span-3"><textarea name="notes" rows={2} className={INPUT} /></Field>
        </div>
      </Card>
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      <Button type="submit" variant="primary" icon="🧾" disabled={pending}>{pending ? "Creating…" : "Create batch & upload files"}</Button>
    </ActionForm>
  );
}
