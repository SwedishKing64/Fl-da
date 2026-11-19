"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateBatchAction } from "@/app/(catalog)/actions";
import { Alert, Button, Field, INPUT } from "@/app/(catalog)/ui";
import { CURRENCIES } from "@/lib/catalog/types";

interface BatchForm { id: string; supplierId: string | null; currency: string; fxRateToHome: number; gstTreatment: string; freightTotalHome: number; freightMode: string; splitExportBy: string; builtBy: string; notes: string }

export function BatchSettingsForm({ batch, suppliers, disabled, home }: { batch: BatchForm; suppliers: Array<{ id: string; name: string }>; disabled: boolean; home: string }) {
  const router = useRouter();
  const [form, setForm] = useState(batch);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof BatchForm>(k: K, v: BatchForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = () =>
    start(async () => {
      const res = await updateBatchAction(batch.id, {
        supplierId: form.supplierId,
        currency: form.currency,
        fxRateToHome: form.currency === home ? 1 : form.fxRateToHome,
        gstTreatment: form.gstTreatment as "INCLUSIVE" | "EXCLUSIVE" | "NONE",
        freightTotalHome: form.freightTotalHome,
        freightMode: form.freightMode as "PER_UNIT" | "BY_VALUE",
        splitExportBy: form.splitExportBy as "NONE" | "BRAND" | "PRODUCT_TYPE",
        builtBy: form.builtBy,
        notes: form.notes,
      });
      setMsg(res.ok ? { ok: true, text: "Saved and repriced." } : { ok: false, text: res.error });
      router.refresh();
    });

  return (
    <div className="space-y-3">
      <Field label="Supplier">
        <select value={form.supplierId ?? ""} onChange={(e) => set("supplierId", e.target.value || null)} disabled={disabled} className={INPUT}>
          <option value="">—</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Currency"><select value={form.currency} onChange={(e) => set("currency", e.target.value)} disabled={disabled} className={INPUT}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label={`FX → ${home}`}><input type="number" step="0.0001" value={form.currency === home ? 1 : form.fxRateToHome} onChange={(e) => set("fxRateToHome", Number(e.target.value))} disabled={disabled || form.currency === home} className={INPUT} /></Field>
      </div>
      <Field label="GST on cost prices">
        <select value={form.gstTreatment} onChange={(e) => set("gstTreatment", e.target.value)} disabled={disabled} className={INPUT}>
          <option value="EXCLUSIVE">Ex GST</option><option value="INCLUSIVE">Inc GST</option><option value="NONE">No GST (overseas)</option>
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Freight total (${home})`}><input type="number" step="0.01" min="0" value={form.freightTotalHome} onChange={(e) => set("freightTotalHome", Number(e.target.value))} disabled={disabled} className={INPUT} /></Field>
        <Field label="Spread"><select value={form.freightMode} onChange={(e) => set("freightMode", e.target.value)} disabled={disabled} className={INPUT}><option value="PER_UNIT">Per unit</option><option value="BY_VALUE">By value</option></select></Field>
      </div>
      <Field label="Export files">
        <select value={form.splitExportBy} onChange={(e) => set("splitExportBy", e.target.value)} disabled={disabled} className={INPUT}>
          <option value="BRAND">One CSV per brand</option><option value="PRODUCT_TYPE">One CSV per product type</option><option value="NONE">Single CSV</option>
        </select>
      </Field>
      <Field label="Built by" hint="Your initials. They become the suffix on the shop's marker tag, which says who built the listing, so it cannot be worked out from the product.">
        <input value={form.builtBy} onChange={(e) => set("builtBy", e.target.value.replace(/[^A-Za-z]/g, "").slice(0, 3))} disabled={disabled} placeholder="js" className={INPUT} />
      </Field>
      <Field label="Notes"><textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} disabled={disabled} className={INPUT} /></Field>
      {msg && <Alert tone={msg.ok ? "success" : "danger"}>{msg.text}</Alert>}
      {!disabled && <Button variant="primary" icon="💾" onClick={save} disabled={pending}>{pending ? "Saving…" : "Save & reprice"}</Button>}
    </div>
  );
}
