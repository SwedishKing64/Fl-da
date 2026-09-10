"use client";

import { useActionState, useState, useTransition } from "react";
import { deleteCategoryRuleAction, deletePricingRuleAction, saveCategoryRuleAction, savePricingRuleAction, saveSettingsAction, seedDefaultsAction } from "@/app/(catalog)/actions";
import { Alert, Badge, Button, Field, INPUT } from "@/app/(catalog)/ui";
import { CATEGORIES, CURRENCIES } from "@/lib/catalog/types";

interface RuleRow { id: string; name: string; scope: string; matchValue: string; mode: string; percent: number; roundTo: string; priority: number; active: boolean }

export function PricingRulesEditor({ rules, isAdmin }: { rules: RuleRow[]; isAdmin: boolean }) {
  const [editing, setEditing] = useState<RuleRow | null>(null);
  const [state, action, pending] = useActionState(savePricingRuleAction, null);
  const [, start] = useTransition();
  return (
    <div className="space-y-4">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-[var(--ink-soft)]"><tr><th className="py-1">Rule</th><th>Applies to</th><th>Mode</th><th className="text-right">%</th><th>Ending</th><th className="text-right">Priority</th><th /></tr></thead>
        <tbody>
          {rules.map((r) => (
            <tr key={r.id} className="border-t border-[var(--line-soft)]">
              <td className="py-1.5">{r.name} {!r.active && <Badge>off</Badge>}</td>
              <td className="text-xs">{r.scope === "DEFAULT" ? "Everything else" : `${r.scope.toLowerCase()}: ${r.matchValue}`}</td>
              <td className="text-xs">{r.mode === "MARGIN" ? "Margin" : "Markup"}</td>
              <td className="pr-3 text-right">{r.percent}%</td>
              <td className="text-xs">{r.roundTo}</td>
              <td className="text-right">{r.priority}</td>
              <td className="text-right">{isAdmin && <><button className="text-xs text-[var(--violet)]" onClick={() => setEditing(r)}>Edit</button> <button className="ml-2 text-xs text-red-600" onClick={() => { if (confirm("Delete rule?")) start(async () => { await deletePricingRuleAction(r.id); }); }}>Delete</button></>}</td>
            </tr>
          ))}
          {rules.length === 0 && <tr><td colSpan={7} className="py-3 text-[var(--ink-soft)]">No rules yet — a fallback of 40% margin applies. {isAdmin && <button className="text-[var(--violet)] underline" onClick={() => start(async () => { await seedDefaultsAction(); })}>Load recommended defaults</button>}</td></tr>}
        </tbody>
      </table>
      {isAdmin && (
        <form action={action} key={editing?.id ?? "new"} className="grid gap-3 rounded-lg border border-[var(--line-soft)] p-3 sm:grid-cols-4">
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <Field label="Name" className="sm:col-span-2"><input name="name" required defaultValue={editing?.name} className={INPUT} placeholder="e.g. Skis 40% margin" /></Field>
          <Field label="Scope"><select name="scope" defaultValue={editing?.scope ?? "CATEGORY"} className={INPUT}><option value="DEFAULT">Default</option><option value="CATEGORY">Category</option><option value="BRAND">Brand</option><option value="PRODUCT">Product (SKU/model)</option></select></Field>
          <Field label="Match value" hint="category key, brand or SKU/model code"><input name="matchValue" defaultValue={editing?.matchValue} className={INPUT} list="cats" /><datalist id="cats">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist></Field>
          <Field label="Mode"><select name="mode" defaultValue={editing?.mode ?? "MARGIN"} className={INPUT}><option value="MARGIN">Margin (% of sell price)</option><option value="MARKUP">Markup (% on cost)</option></select></Field>
          <Field label="Percent"><input name="percent" type="number" step="0.1" min="0" required defaultValue={editing?.percent ?? 40} className={INPUT} /></Field>
          <Field label="Price ending"><select name="roundTo" defaultValue={editing?.roundTo ?? "0.99"} className={INPUT}>{["0.99", "0.95", "1.00", "5.00", "10.00", "NONE"].map((r) => <option key={r}>{r}</option>)}</select></Field>
          <Field label="Priority"><input name="priority" type="number" defaultValue={editing?.priority ?? 0} className={INPUT} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={editing?.active ?? true} /> Active</label>
          <div className="flex items-end gap-2 sm:col-span-3">
            <Button type="submit" variant="primary" disabled={pending}>{editing ? "Save rule" : "Add rule"}</Button>
            {editing && <Button type="button" onClick={() => setEditing(null)}>Cancel</Button>}
            {state && (state.ok ? <span className="text-xs text-emerald-700">{state.message}</span> : <span className="text-xs text-red-700">{state.error}</span>)}
          </div>
        </form>
      )}
    </div>
  );
}

interface CatRow { id: string; category: string; pattern: string; productType: string; collections: string; tags: string; option1: string; option2: string; option3: string; priority: number; active: boolean }

export function CategoryRulesEditor({ rules, usingDefaults, isAdmin }: { rules: CatRow[]; usingDefaults: boolean; isAdmin: boolean }) {
  const [editing, setEditing] = useState<CatRow | null>(null);
  const [state, action, pending] = useActionState(saveCategoryRuleAction, null);
  const [, start] = useTransition();
  const OPTS = ["", "length", "size", "width", "colour"];
  return (
    <div className="space-y-4">
      {usingDefaults && <Alert tone="info">Showing the built-in defaults. Saving any rule here switches to your own list (copy the ones you want to keep, or run the seed script).</Alert>}
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-[var(--ink-soft)]"><tr><th className="py-1">Category</th><th>Pattern</th><th>Type</th><th>Collections</th><th>Options</th><th className="text-right">Prio</th><th /></tr></thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} className="border-t border-[var(--line-soft)]">
                <td className="py-1.5">{r.category}</td><td className="max-w-xs truncate font-mono text-[11px]" title={r.pattern}>{r.pattern}</td><td>{r.productType}</td><td className="text-xs">{r.collections}</td><td className="text-xs">{[r.option1, r.option2, r.option3].filter(Boolean).join(" / ")}</td><td className="text-right">{r.priority}</td>
                <td className="text-right">{isAdmin && <><button className="text-xs text-[var(--violet)]" onClick={() => setEditing(usingDefaults ? { ...r, id: "" } : r)}>{usingDefaults ? "Copy" : "Edit"}</button>{!usingDefaults && <button className="ml-2 text-xs text-red-600" onClick={() => { if (confirm("Delete rule?")) start(async () => { await deleteCategoryRuleAction(r.id); }); }}>Delete</button>}</>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {isAdmin && (
        <form action={action} key={editing ? editing.id || editing.pattern : "new"} className="grid gap-3 rounded-lg border border-[var(--line-soft)] p-3 sm:grid-cols-4">
          {editing?.id && <input type="hidden" name="id" value={editing.id} />}
          <Field label="Category"><select name="category" defaultValue={editing?.category ?? "skis"} className={INPUT}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Pattern (regex)" className="sm:col-span-2"><input name="pattern" required defaultValue={editing?.pattern} className={`${INPUT} font-mono text-xs`} /></Field>
          <Field label="Product type"><input name="productType" required defaultValue={editing?.productType} className={INPUT} /></Field>
          <Field label="Collections (comma separated)"><input name="collections" defaultValue={editing?.collections} className={INPUT} /></Field>
          <Field label="Tags (comma separated)"><input name="tags" defaultValue={editing?.tags} className={INPUT} /></Field>
          <Field label="Priority"><input name="priority" type="number" defaultValue={editing?.priority ?? 0} className={INPUT} /></Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="active" defaultChecked={editing?.active ?? true} /> Active</label>
          {(["option1", "option2", "option3"] as const).map((k, i) => <Field key={k} label={`Option ${i + 1}`}><select name={k} defaultValue={editing?.[k] ?? ""} className={INPUT}>{OPTS.map((o) => <option key={o} value={o}>{o || "—"}</option>)}</select></Field>)}
          <div className="flex items-end gap-2">
            <Button type="submit" variant="primary" disabled={pending}>{editing?.id ? "Save" : "Add rule"}</Button>
            {editing && <Button type="button" onClick={() => setEditing(null)}>Cancel</Button>}
          </div>
          {state && <div className="sm:col-span-4">{state.ok ? <span className="text-xs text-emerald-700">{state.message}</span> : <span className="text-xs text-red-700">{state.error}</span>}</div>}
        </form>
      )}
    </div>
  );
}

export function PricingSettingsForm({ settings, isAdmin }: { settings: { gstRate: number; pricesIncludeGst: boolean; minMarginPct: number; fxRates: Record<string, number> }; isAdmin: boolean }) {
  const [form, setForm] = useState({ gstPct: settings.gstRate * 100, pricesIncludeGst: settings.pricesIncludeGst, minMarginPct: settings.minMarginPct, fxRates: { ...settings.fxRates } });
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="space-y-3">
      <Field label="GST rate (%)"><input type="number" step="0.1" value={form.gstPct} disabled={!isAdmin} onChange={(e) => setForm({ ...form, gstPct: Number(e.target.value) })} className={INPUT} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.pricesIncludeGst} disabled={!isAdmin} onChange={(e) => setForm({ ...form, pricesIncludeGst: e.target.checked })} /> Storefront prices include GST (standard for AU)</label>
      <Field label="Warn when margin is below (%)"><input type="number" step="1" value={form.minMarginPct} disabled={!isAdmin} onChange={(e) => setForm({ ...form, minMarginPct: Number(e.target.value) })} className={INPUT} /></Field>
      <div>
        <div className="mb-1 text-sm font-medium text-[var(--ink-2)]">FX rates (AUD per 1 unit)</div>
        <div className="grid grid-cols-2 gap-2">
          {CURRENCIES.filter((c) => c !== "AUD").map((c) => <label key={c} className="flex items-center gap-2 text-sm"><span className="w-10 font-mono">{c}</span><input type="number" step="0.0001" value={form.fxRates[c] ?? ""} disabled={!isAdmin} onChange={(e) => setForm({ ...form, fxRates: { ...form.fxRates, [c]: Number(e.target.value) } })} className={INPUT} /></label>)}
        </div>
        <p className="mt-1 text-xs text-[var(--ink-soft)]">Defaults for new batches; each batch can override its own rate.</p>
      </div>
      {msg && <Alert tone={msg.ok ? "success" : "danger"}>{msg.text}</Alert>}
      {isAdmin && <Button variant="primary" disabled={pending} onClick={() => start(async () => { const r = await saveSettingsAction({ gstRate: form.gstPct / 100, pricesIncludeGst: form.pricesIncludeGst, minMarginPct: form.minMarginPct, fxRates: form.fxRates }); setMsg(r.ok ? { ok: true, text: "Saved. Existing batches reprice when next opened or edited." } : { ok: false, text: r.error }); })}>Save</Button>}
    </div>
  );
}
