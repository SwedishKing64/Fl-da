"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { deleteTagRuleAction, saveTagRuleAction, seedDefaultsAction } from "@/app/(catalog)/actions";
import { Alert, Badge, Button, Field, INPUT } from "@/app/(catalog)/ui";
import { applyTagRules, MATCH_FIELDS, type TagRuleLike } from "@/lib/catalog/rules";

interface RuleRow { id: string; name: string; matchField: string; pattern: string; addTags: string; addCollections: string; setProductType: string; setMetafields: Record<string, string>; priority: number; active: boolean }

const META_KEYS = ["length_cm", "flex", "ability_level", "din_range", "terrain", "waist_width", "gender", "season", "model_code"];

export function TagRulesEditor({ rules, isAdmin }: { rules: RuleRow[]; isAdmin: boolean }) {
  const [editing, setEditing] = useState<RuleRow | null>(null);
  const [state, action, pending] = useActionState(saveTagRuleAction, null);
  const [, start] = useTransition();
  const [sample, setSample] = useState({ title: "Atomic Bent 90 W Skis 2026", vendor: "Atomic", category: "skis", productType: "Skis", sku: "AA0029-166" });

  const preview = useMemo(() => {
    const all: TagRuleLike[] = rules.map((r) => ({ ...r }));
    return applyTagRules({ title: sample.title, vendor: sample.vendor, category: sample.category, productType: sample.productType, skus: [sample.sku], tags: [], collections: [], metafields: {} }, all);
  }, [rules, sample]);

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--canvas)] p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ink-soft)]">Try the rules on a sample product</div>
        <div className="grid gap-2 sm:grid-cols-5">
          <input value={sample.title} onChange={(e) => setSample({ ...sample, title: e.target.value })} className={INPUT} placeholder="Title" />
          <input value={sample.vendor} onChange={(e) => setSample({ ...sample, vendor: e.target.value })} className={INPUT} placeholder="Brand" />
          <input value={sample.category} onChange={(e) => setSample({ ...sample, category: e.target.value })} className={INPUT} placeholder="Category" />
          <input value={sample.productType} onChange={(e) => setSample({ ...sample, productType: e.target.value })} className={INPUT} placeholder="Product type" />
          <input value={sample.sku} onChange={(e) => setSample({ ...sample, sku: e.target.value })} className={INPUT} placeholder="SKU" />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span><span className="text-[var(--ink-soft)]">Matched:</span> {preview.matched.length ? preview.matched.map((m) => m.name).join(", ") : "no rules"}</span>
          <span><span className="text-[var(--ink-soft)]">Tags:</span> {preview.tags.join(", ") || "–"}</span>
          <span><span className="text-[var(--ink-soft)]">Collections:</span> {preview.collections.join(", ") || "–"}</span>
          <span><span className="text-[var(--ink-soft)]">Type:</span> {preview.productType || "–"}</span>
          <span><span className="text-[var(--ink-soft)]">Metafields:</span> {Object.entries(preview.metafields).map(([k, v]) => `${k}=${v}`).join(", ") || "–"}</span>
        </div>
      </div>

      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-[var(--ink-soft)]"><tr><th className="py-1">Rule</th><th>When</th><th>Adds</th><th className="text-right">Priority</th><th /></tr></thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} className="border-t border-[var(--line-soft)] align-top">
                <td className="py-1.5">{r.name} {!r.active && <Badge>off</Badge>}</td>
                <td className="text-xs"><span className="text-[var(--ink-soft)]">{MATCH_FIELDS.find((f) => f.key === r.matchField)?.label.split(" (")[0] ?? r.matchField}</span> matches <code className="rounded bg-neutral-100 px-1">{r.pattern}</code></td>
                <td className="text-xs">
                  {r.addTags && <div>tags: {r.addTags}</div>}
                  {r.addCollections && <div>collections: {r.addCollections}</div>}
                  {r.setProductType && <div>type → {r.setProductType}</div>}
                  {Object.keys(r.setMetafields).length > 0 && <div>metafields: {Object.entries(r.setMetafields).map(([k, v]) => `${k}=${v}`).join(", ")}</div>}
                </td>
                <td className="text-right">{r.priority}</td>
                <td className="text-right">{isAdmin && <><button className="text-xs text-[var(--violet)]" onClick={() => setEditing(r)}>Edit</button> <button className="ml-2 text-xs text-red-600" onClick={() => { if (confirm("Delete rule?")) start(async () => { await deleteTagRuleAction(r.id); }); }}>Delete</button></>}</td>
              </tr>
            ))}
            {rules.length === 0 && <tr><td colSpan={5} className="py-3 text-[var(--ink-soft)]">No rules yet. {isAdmin && <button className="text-[var(--violet)] underline" onClick={() => start(async () => { await seedDefaultsAction(); })}>Load the starter rules</button>}</td></tr>}
          </tbody>
        </table>
      </div>

      {isAdmin && (
        <form action={action} key={editing?.id ?? "new"} className="grid gap-3 rounded-lg border border-[var(--line-soft)] p-3 sm:grid-cols-4">
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <Field label="Rule name" className="sm:col-span-2"><input name="name" required defaultValue={editing?.name} className={INPUT} placeholder="e.g. Women's products" /></Field>
          <Field label="Look at"><select name="matchField" defaultValue={editing?.matchField ?? "any"} className={INPUT}>{MATCH_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select></Field>
          <Field label="Pattern" hint="Plain text or a regular expression, case-insensitive"><input name="pattern" required defaultValue={editing?.pattern} className={`${INPUT} font-mono text-xs`} placeholder={String.raw`\b(womens|w's)\b`} /></Field>
          <Field label="Add tags (comma separated)"><input name="addTags" defaultValue={editing?.addTags} className={INPUT} /></Field>
          <Field label="Add collections (comma separated)"><input name="addCollections" defaultValue={editing?.addCollections} className={INPUT} /></Field>
          <Field label="Set product type (optional)"><input name="setProductType" defaultValue={editing?.setProductType} className={INPUT} /></Field>
          <Field label="Set metafields" hint={`One per line as key=value. Keys: ${META_KEYS.join(", ")}`}><textarea name="setMetafields" rows={2} defaultValue={editing ? Object.entries(editing.setMetafields).map(([k, v]) => `${k}=${v}`).join("\n") : ""} className={`${INPUT} font-mono text-xs`} placeholder="gender=Womens" /></Field>
          <Field label="Priority"><input name="priority" type="number" defaultValue={editing?.priority ?? 0} className={INPUT} /></Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="active" defaultChecked={editing?.active ?? true} /> Active</label>
          <div className="flex items-end gap-2 sm:col-span-2">
            <Button type="submit" variant="primary" disabled={pending}>{editing ? "Save rule" : "Add rule"}</Button>
            {editing && <Button type="button" onClick={() => setEditing(null)}>Cancel</Button>}
            {state && (state.ok ? <span className="text-xs text-emerald-700">{state.message}</span> : <span className="text-xs text-red-700">{state.error}</span>)}
          </div>
          {state && !state.ok && <div className="sm:col-span-4"><Alert tone="danger">{state.error}</Alert></div>}
        </form>
      )}
    </div>
  );
}
