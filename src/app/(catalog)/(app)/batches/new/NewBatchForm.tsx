"use client";

import { useActionState, useState } from "react";
import { createBatchAction } from "@/app/(catalog)/actions";
import { Alert, Button, Card, Field, INPUT } from "@/app/(catalog)/ui";
import { CURRENCIES } from "@/lib/catalog/types";

interface SupplierOpt { id: string; name: string; defaultCurrency: string; defaultGstTreatment: string }

export function NewBatchForm({ suppliers, fxRates }: { suppliers: SupplierOpt[]; fxRates: Record<string, number> }) {
  const [state, action, pending] = useActionState(createBatchAction, null);
  const [supplierId, setSupplierId] = useState("");
  const [currency, setCurrency] = useState("AUD");
  const [gst, setGst] = useState("EXCLUSIVE");
  const [fx, setFx] = useState(1);

  const pickSupplier = (id: string) => {
    setSupplierId(id);
    const s = suppliers.find((x) => x.id === id);
    if (s) {
      setCurrency(s.defaultCurrency);
      setGst(s.defaultGstTreatment);
      setFx(s.defaultCurrency === "AUD" ? 1 : fxRates[s.defaultCurrency] ?? 1);
    }
  };

  return (
    <form action={action} className="max-w-2xl space-y-5">
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
            <select name="currency" value={currency} onChange={(e) => { setCurrency(e.target.value); setFx(e.target.value === "AUD" ? 1 : fxRates[e.target.value] ?? 1); }} className={INPUT}>
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="FX rate → AUD" hint={currency === "AUD" ? "Not needed for AUD" : `Default from Settings: ${fxRates[currency] ?? "–"}`}>
            <input name="fxRateToAud" type="number" step="0.0001" min="0.0001" value={fx} onChange={(e) => setFx(Number(e.target.value))} disabled={currency === "AUD"} className={INPUT} />
          </Field>
          <Field label="GST on cost prices">
            <select name="gstTreatment" value={gst} onChange={(e) => setGst(e.target.value)} className={INPUT}>
              <option value="EXCLUSIVE">Ex GST (GST added on top)</option>
              <option value="INCLUSIVE">Inc GST (GST included)</option>
              <option value="NONE">No GST (overseas supplier)</option>
            </select>
          </Field>
          <Field label="Freight / landed cost loading (AUD)" hint="Total freight for the whole batch, spread across units."><input name="freightTotalAud" type="number" step="0.01" min="0" defaultValue={0} className={INPUT} /></Field>
          <Field label="Spread freight">
            <select name="freightMode" className={INPUT}>
              <option value="PER_UNIT">Evenly per unit</option>
              <option value="BY_VALUE">Pro-rata by cost value</option>
            </select>
          </Field>
          <Field label="Publish on export" hint="Off = products import as drafts (recommended for pre-books).">
            <label className="flex items-center gap-2 py-2 text-sm"><input type="checkbox" name="publishOnExport" /> Mark products active</label>
          </Field>
          <Field label="Notes" className="sm:col-span-3"><textarea name="notes" rows={2} className={INPUT} /></Field>
        </div>
      </Card>
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      <Button type="submit" variant="primary" disabled={pending}>{pending ? "Creating…" : "Create batch & upload files"}</Button>
    </form>
  );
}
