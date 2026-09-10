"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyMappingsAction } from "@/app/(catalog)/actions";
import { Alert, Badge, Button, Card, Field, INPUT } from "@/app/(catalog)/ui";
import type { HeaderGroup } from "@/lib/catalog/pipeline";
import type { Mapping } from "@/lib/catalog/mapping";

interface FieldDef { key: string; label: string; required: boolean }

export function MappingEditor({ batchId, groups, fields, supplierName, hasProducts, disabled }: { batchId: string; groups: HeaderGroup[]; fields: FieldDef[]; supplierName: string | null; hasProducts: boolean; disabled: boolean }) {
  const router = useRouter();
  const [state, setState] = useState(() =>
    groups.map((g) => ({
      hash: g.hash,
      mapping: { ...g.suggestion } as Mapping,
      fixed: { ...(g.options.fixed ?? {}) } as Record<string, string>,
      costIsLineTotal: Boolean(g.options.costIsLineTotal),
      save: Boolean(supplierName) && !g.isCanonical,
      templateName: g.templateName ?? `${supplierName ?? "Supplier"} – ${g.filenames[0]?.split(".").pop()?.toUpperCase() ?? "file"} layout`,
    })),
  );
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const update = (i: number, patch: Partial<(typeof state)[number]>) => setState((s) => s.map((g, j) => (j === i ? { ...g, ...patch } : g)));

  const apply = () =>
    start(async () => {
      setError(null);
      const res = await applyMappingsAction(
        batchId,
        state.map((g) => ({ hash: g.hash, mapping: g.mapping, options: { fixed: g.fixed, costIsLineTotal: g.costIsLineTotal }, saveTemplate: g.save ? { name: g.templateName } : null })),
      );
      if (!res.ok) return setError(res.error);
      router.push(`/batches/${batchId}/review`);
    });

  return (
    <div className="space-y-6">
      {groups.map((g, i) => {
        const st = state[i];
        const targets = Object.values(st.mapping).filter(Boolean);
        const missing = fields.filter((f) => f.required && !targets.includes(f.key as Mapping[string]));
        return (
          <Card key={g.hash} title={<span>{g.filenames.join(", ")} <span className="font-normal text-[var(--ink-soft)]">· {g.rowCount} rows</span></span>} actions={g.templateId ? <Badge tone="success">Saved template: {g.templateName}</Badge> : g.isCanonical ? <Badge tone="info">AI-extracted (already in product fields)</Badge> : <Badge>New layout</Badge>}>
            {g.isCanonical ? (
              <p className="text-sm text-[var(--ink-soft)]">These rows were extracted by AI straight into product fields, so no column mapping is needed. You can still set fixed values below.</p>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-[var(--ink-soft)]"><tr><th className="py-1 pr-3">Supplier column</th><th className="pr-3">Sample values</th><th>Maps to</th></tr></thead>
                  <tbody>
                    {g.headers.map((h) => (
                      <tr key={h} className="border-t border-[var(--line-soft)]">
                        <td className="py-1.5 pr-3 font-medium">{h}</td>
                        <td className="max-w-xs truncate pr-3 text-xs text-[var(--ink-soft)]">{g.sampleRows.map((r) => r[h]).filter(Boolean).slice(0, 3).join(" · ") || "–"}</td>
                        <td>
                          <select value={st.mapping[h] ?? ""} disabled={disabled} onChange={(e) => update(i, { mapping: { ...st.mapping, [h]: e.target.value as Mapping[string] } })} className="w-full max-w-xs rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-sm">
                            <option value="">— ignore —</option>
                            {fields.map((f) => <option key={f.key} value={f.key}>{f.label}{f.required ? " *" : ""}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {missing.length > 0 && !g.isCanonical && <Alert tone="warning" className="mt-3">Still needed: {missing.map((m) => m.label).join(", ")}. Pick the matching supplier column, or set a fixed value below.</Alert>}
            <details className="mt-4 rounded-lg border border-[var(--line-soft)] p-3" open={Object.keys(st.fixed).length > 0}>
              <summary className="cursor-pointer text-sm font-medium">Fixed values & options</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {(["brand", "category", "season", "gender", "productType"] as const).map((k) => (
                  <Field key={k} label={`${fields.find((f) => f.key === k)?.label ?? k} (applies to every row)`}>
                    <input value={st.fixed[k] ?? ""} disabled={disabled} onChange={(e) => update(i, { fixed: { ...st.fixed, [k]: e.target.value } })} className={INPUT} placeholder={k === "category" ? "skis / boots / bindings…" : ""} />
                  </Field>
                ))}
                <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={st.costIsLineTotal} disabled={disabled} onChange={(e) => update(i, { costIsLineTotal: e.target.checked })} /> Cost column is a line total (divide by qty)</label>
              </div>
            </details>
            {supplierName && !g.isCanonical && (
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" checked={st.save} disabled={disabled} onChange={(e) => update(i, { save: e.target.checked })} /> Save as template for {supplierName}</label>
                {st.save && <input value={st.templateName} disabled={disabled} onChange={(e) => update(i, { templateName: e.target.value })} className={`${INPUT} max-w-xs`} />}
              </div>
            )}
          </Card>
        );
      })}
      {error && <Alert tone="danger">{error}</Alert>}
      {hasProducts && !disabled && <Alert tone="warning">Applying the mapping again rebuilds this batch&apos;s products and discards edits made in the review grid.</Alert>}
      {!disabled && <Button variant="primary" onClick={apply} disabled={pending}>{pending ? "Building products…" : "Apply mapping & build products →"}</Button>}
    </div>
  );
}
