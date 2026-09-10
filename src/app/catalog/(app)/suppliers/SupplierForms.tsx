"use client";

import { useActionState, useTransition } from "react";
import { deleteSupplierAction, deleteTemplateAction, saveSupplierAction } from "@/app/catalog/actions";
import { Alert, Button, Field, INPUT } from "@/app/catalog/ui";
import { CURRENCIES } from "@/lib/catalog/types";

interface SupplierData { id?: string; name: string; defaultCurrency: string; defaultGstTreatment: string; defaultBrand: string; notes: string }

export function SupplierForm({ supplier }: { supplier?: SupplierData }) {
  const [state, action, pending] = useActionState(saveSupplierAction, null);
  return (
    <form action={action} className="space-y-3">
      {supplier?.id && <input type="hidden" name="id" value={supplier.id} />}
      <Field label="Name"><input name="name" required defaultValue={supplier?.name} className={INPUT} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Invoice currency"><select name="defaultCurrency" defaultValue={supplier?.defaultCurrency ?? "AUD"} className={INPUT}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Cost prices are"><select name="defaultGstTreatment" defaultValue={supplier?.defaultGstTreatment ?? "EXCLUSIVE"} className={INPUT}><option value="EXCLUSIVE">Ex GST</option><option value="INCLUSIVE">Inc GST</option><option value="NONE">No GST</option></select></Field>
      </div>
      <Field label="Default brand" hint="Used when the invoice doesn't state a brand."><input name="defaultBrand" defaultValue={supplier?.defaultBrand} className={INPUT} /></Field>
      <Field label="Notes"><textarea name="notes" rows={2} defaultValue={supplier?.notes} className={INPUT} /></Field>
      {state && (state.ok ? <Alert tone="success">{state.message}</Alert> : <Alert tone="danger">{state.error}</Alert>)}
      <Button type="submit" variant="primary" disabled={pending}>{supplier ? "Save changes" : "Add supplier"}</Button>
    </form>
  );
}

export function DeleteSupplierButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return <Button size="sm" variant="ghost" disabled={pending} onClick={() => { if (confirm("Delete this supplier and its templates? Batches keep their data.")) start(async () => { const r = await deleteSupplierAction(id); if (!r.ok) alert(r.error); }); }}>Delete</Button>;
}

export function DeleteTemplateButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return <Button size="sm" variant="ghost" disabled={pending} onClick={() => { if (confirm("Delete this template?")) start(async () => { await deleteTemplateAction(id); }); }}>Delete</Button>;
}
