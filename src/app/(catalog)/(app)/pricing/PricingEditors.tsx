"use client";

import { useActionState, useState, useTransition } from "react";
import { deleteCategoryRuleAction, saveCategoryRuleAction } from "@/app/(catalog)/actions";
import { Alert, Button, Field, INPUT } from "@/app/(catalog)/ui";
import { ActionForm } from "@/app/(catalog)/ActionForm";
import { CATEGORIES } from "@/lib/catalog/types";

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
        <ActionForm action={action} state={state} key={editing ? editing.id || editing.pattern : "new"} className="grid gap-3 rounded-lg border border-[var(--line-soft)] p-3 sm:grid-cols-4">
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
        </ActionForm>
      )}
    </div>
  );
}
