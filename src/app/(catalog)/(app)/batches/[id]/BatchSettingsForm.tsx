"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateBatchAction } from "@/app/(catalog)/actions";
import { Alert, Button, Field, INPUT } from "@/app/(catalog)/ui";
import { CURRENCIES } from "@/lib/catalog/types";

interface BatchForm { id: string; supplierId: string | null; currency: string; fxRateToAud: number; gstTreatment: string; freightTotalAud: number; freightMode: string; publishOnExport: boolean; notes: string }

export function BatchSettingsForm({ batch, suppliers, disabled }: { batch: BatchForm; suppliers: Array<{ id: string; name: string }>; disabled: boolean }) {
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
        fxRateToAud: form.currency === "AUD" ? 1 : form.fxRateToAud,
        gstTreatment: form.gstTreatment as "INCLUSIVE" | "EXCLUSIVE" | "NONE",
        freightTotalAud: form.freightTotalAud,
        freightMode: form.freightMode as "PER_UNIT" | "BY_VALUE",
        publishOnExport: form.publishOnExport,
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
        <Field label="FX → AUD"><input type="number" step="0.0001" value={form.currency === "AUD" ? 1 : form.fxRateToAud} onChange={(e) => set("fxRateToAud", Number(e.target.value))} disabled={disabled || form.currency === "AUD"} className={INPUT} /></Field>
      </div>
      <Field label="GST on cost prices">
        <select value={form.gstTreatment} onChange={(e) => set("gstTreatment", e.target.value)} disabled={disabled} className={INPUT}>
          <option value="EXCLUSIVE">Ex GST</option><option value="INCLUSIVE">Inc GST</option><option value="NONE">No GST (overseas)</option>
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Freight total (AUD)"><input type="number" step="0.01" min="0" value={form.freightTotalAud} onChange={(e) => set("freightTotalAud", Number(e.target.value))} disabled={disabled} className={INPUT} /></Field>
        <Field label="Spread"><select value={form.freightMode} onChange={(e) => set("freightMode", e.target.value)} disabled={disabled} className={INPUT}><option value="PER_UNIT">Per unit</option><option value="BY_VALUE">By value</option></select></Field>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.publishOnExport} onChange={(e) => set("publishOnExport", e.target.checked)} disabled={disabled} /> Publish products on export (otherwise draft)</label>
      <Field label="Notes"><textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} disabled={disabled} className={INPUT} /></Field>
      {msg && <Alert tone={msg.ok ? "success" : "danger"}>{msg.text}</Alert>}
      {!disabled && <Button variant="primary" onClick={save} disabled={pending}>{pending ? "Saving…" : "Save & reprice"}</Button>}
    </div>
  );
}
