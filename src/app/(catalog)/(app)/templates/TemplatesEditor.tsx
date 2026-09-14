"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { analyseTemplateCsvAction, deleteProductTemplateAction, saveTemplateAction, toggleProductTemplateAction } from "@/app/(catalog)/actions";
import { Alert, Badge, Button, Field, INPUT } from "@/app/(catalog)/ui";
import { ActionForm } from "@/app/(catalog)/ActionForm";
import { TEMPLATE_SCOPES, type TemplateAnalysis } from "@/lib/catalog/templates";
import { CATEGORIES } from "@/lib/catalog/types";

export interface TemplateRow {
  id: string;
  name: string;
  scope: string;
  matchValue: string;
  matchProductType: string;
  sourceFileName: string;
  productCount: number;
  setProductType: string;
  addTags: string;
  addCollections: string;
  optionNames: string;
  setMetafields: Record<string, string>;
  priority: number;
  active: boolean;
  summary: string;
}

const list = (value: string) => value.split(",").map((v) => v.trim()).filter(Boolean);

export function TemplatesEditor({ templates, isAdmin }: { templates: TemplateRow[]; isAdmin: boolean }) {
  const [analysis, setAnalysis] = useState<{ analysis: TemplateAnalysis; fileName: string } | null>(null);
  const [editing, setEditing] = useState<TemplateRow | null>(null);
  const [reading, startReading] = useTransition();
  const [readError, setReadError] = useState<string | null>(null);
  const [state, action, pending] = useActionState(saveTemplateAction, null);
  const [, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const readFile = (file: File) => {
    setReadError(null);
    const data = new FormData();
    data.set("file", file);
    startReading(async () => {
      const result = await analyseTemplateCsvAction(data);
      if (result.ok && result.data) {
        setEditing(null);
        setAnalysis(result.data);
      } else if (result.ok) {
        setAnalysis(null);
        setReadError("That file could not be read.");
      } else {
        setAnalysis(null);
        setReadError(result.error);
      }
    });
  };

  // The form is filled either from a freshly read file or from a template being edited.
  const a = analysis?.analysis;
  const form = editing
    ? {
        name: editing.name,
        scope: editing.scope,
        matchValue: editing.matchValue,
        matchProductType: editing.matchProductType,
        productType: editing.setProductType,
        tags: editing.addTags,
        collections: editing.addCollections,
        optionNames: editing.optionNames,
        metafields: editing.setMetafields,
        priority: editing.priority,
        active: editing.active,
        sourceFileName: editing.sourceFileName,
        productCount: editing.productCount,
      }
    : a
      ? {
          name: a.vendor || a.productType || analysis!.fileName.replace(/\.csv$/i, ""),
          scope: a.vendor ? "BRAND" : "PRODUCT_TYPE",
          matchValue: a.vendor || a.productType,
          // An export of one product type only describes that type, so narrow to it by default.
          matchProductType: a.vendor && a.productType ? a.productType : "",
          productType: a.productType,
          tags: a.commonTags.join(", "),
          collections: a.collections.join(", "),
          optionNames: a.optionNames.join(", "),
          metafields: a.metafields,
          priority: 0,
          active: true,
          sourceFileName: analysis!.fileName,
          productCount: a.productCount,
        }
      : null;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-dashed border-[var(--line)] bg-[var(--canvas)] p-4">
        <div className="text-sm font-medium">Upload a Shopify export</div>
        <p className="mt-1 max-w-2xl text-sm text-[var(--ink-soft)]">
          Export products you have already built for one brand or product type, and this reads the conventions back out:
          the tags they all share, the collections, the product type, what the options are called and any metafield that
          carries a standing value. Nothing is saved until you have looked at it.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            id="template-file"
            type="file"
            accept=".csv,text/csv"
            className="text-sm"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) readFile(file);
            }}
          />
          {reading && <span className="text-sm text-[var(--ink-soft)]">Reading…</span>}
        </div>
        {readError && <div className="mt-3"><Alert tone="danger">{readError}</Alert></div>}
      </div>

      {a && (
        <div className="rounded-lg border border-[var(--line)] p-4">
          <div className="text-sm font-semibold">
            Read {a.productCount} product{a.productCount === 1 ? "" : "s"} from {analysis!.fileName}
          </div>
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Detail k="Vendor" v={a.vendor || "—"} />
            <Detail k="Product type" v={a.productType || "—"} />
            <Detail k="Tags on most products" v={a.commonTags.join(", ") || "none"} />
            <Detail k="Collections" v={a.collections.join(", ") || "none"} />
            <Detail k="Option names" v={a.optionNames.join(" / ") || "none"} />
            <Detail k="Metafields with a standing value" v={Object.entries(a.metafields).map(([k, v]) => `${k}=${v}`).join(", ") || "none"} />
          </dl>
          {a.metafieldKeys.length > 0 && (
            <p className="mt-2 text-xs text-[var(--ink-soft)]">
              Metafields seen: {a.metafieldKeys.join(", ")}. Only those where nearly every product agreed are carried over
              as a default, so per-product values like length are left alone.
            </p>
          )}
          {a.tagCounts.length > a.commonTags.length && (
            <p className="mt-1 text-xs text-[var(--ink-soft)]">
              Not carried over, too occasional:{" "}
              {a.tagCounts.filter((t) => !a.commonTags.includes(t.tag)).slice(0, 12).map((t) => `${t.tag} (${t.count})`).join(", ")}
            </p>
          )}
          {a.titleExamples.length > 0 && (
            <p className="mt-2 text-xs text-[var(--ink-soft)]">Titles look like: {a.titleExamples.join(" · ")}</p>
          )}
          {a.warnings.map((w) => (
            <div key={w} className="mt-2"><Alert tone="info">{w}</Alert></div>
          ))}
        </div>
      )}

      {isAdmin && form && (
        <ActionForm action={action} state={state} key={editing?.id ?? analysis?.fileName ?? "new"} className="grid gap-3 rounded-lg border border-[var(--line)] p-4 sm:grid-cols-4">
          <div className="sm:col-span-4 text-sm font-semibold">{editing ? `Edit “${editing.name}”` : "Save this as a template"}</div>
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <input type="hidden" name="sourceFileName" value={form.sourceFileName} />
          <input type="hidden" name="productCount" value={form.productCount} />
          <input type="hidden" name="analysis" value={a ? JSON.stringify(a) : "{}"} />
          <input type="hidden" name="setMetafields" value={JSON.stringify(form.metafields)} />

          <Field label="Template name" className="sm:col-span-2">
            <input name="name" required defaultValue={form.name} className={INPUT} placeholder="e.g. Atomic skis" />
          </Field>
          <Field label="Applies to">
            <select name="scope" defaultValue={form.scope} className={INPUT}>
              {TEMPLATE_SCOPES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Matching" hint="The brand, product type or category to match">
            <input name="matchValue" required defaultValue={form.matchValue} className={INPUT} list="template-cats" />
            <datalist id="template-cats">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field label="Only for product type" className="sm:col-span-2" hint="Leave blank to apply to everything that matches above. Prefilled when the export was all one type, so a brand's skis conventions do not land on its beanies.">
            <input name="matchProductType" defaultValue={form.matchProductType} className={INPUT} placeholder="e.g. Skis" />
          </Field>

          <Field label="Set product type" className="sm:col-span-2" hint="Only used when the product has no type yet">
            <input name="setProductType" defaultValue={form.productType} className={INPUT} />
          </Field>
          <Field label="Option names" className="sm:col-span-2" hint="Comma separated, in order">
            <input name="optionNames" defaultValue={form.optionNames} className={INPUT} placeholder="Length, Colour" />
          </Field>
          <Field label="Add tags" className="sm:col-span-2">
            <input name="addTags" defaultValue={form.tags} className={INPUT} />
          </Field>
          <Field label="Add collections" className="sm:col-span-2">
            <input name="addCollections" defaultValue={form.collections} className={INPUT} />
          </Field>

          {Object.keys(form.metafields).length > 0 && (
            <p className="sm:col-span-4 text-xs text-[var(--ink-soft)]">
              Metafield defaults: {Object.entries(form.metafields).map(([k, v]) => `${k}=${v}`).join(", ")}
            </p>
          )}

          <Field label="Priority" hint="Lower runs first">
            <input name="priority" type="number" defaultValue={form.priority} className={INPUT} />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={form.active} /> Active
          </label>
          <div className="flex items-end gap-2 sm:col-span-2">
            <Button type="submit" variant="primary" disabled={pending}>{editing ? "Save template" : "Add template"}</Button>
            <Button type="button" onClick={() => { setEditing(null); setAnalysis(null); if (fileRef.current) fileRef.current.value = ""; }}>Cancel</Button>
          </div>
          {state && <div className="sm:col-span-4">{state.ok ? <Alert tone="success">{state.message}</Alert> : <Alert tone="danger">{state.error}</Alert>}</div>}
        </ActionForm>
      )}

      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-[var(--ink-soft)]">
            <tr><th className="py-1">Template</th><th>Applies to</th><th>What it sets</th><th className="text-right">From</th><th /></tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id} className="border-t border-[var(--line-soft)] align-top">
                <td className="py-1.5">{t.name} {!t.active && <Badge>off</Badge>}</td>
                <td className="text-xs">
                  <span className="text-[var(--ink-soft)]">{TEMPLATE_SCOPES.find((s) => s.key === t.scope)?.label ?? t.scope}</span>{" "}
                  <code className="rounded bg-neutral-100 px-1">{t.matchValue}</code>
                  {t.matchProductType && <div className="text-[var(--ink-soft)]">only type {t.matchProductType}</div>}
                </td>
                <td className="max-w-md text-xs">
                  {t.summary}
                  {list(t.addTags).length > 0 && <div className="mt-0.5 text-[var(--ink-soft)]">tags: {t.addTags}</div>}
                </td>
                <td className="whitespace-nowrap text-right text-xs text-[var(--ink-soft)]">
                  {t.productCount} product{t.productCount === 1 ? "" : "s"}
                  {t.sourceFileName && <div className="truncate" title={t.sourceFileName}>{t.sourceFileName}</div>}
                </td>
                <td className="whitespace-nowrap text-right">
                  {isAdmin && (
                    <>
                      <button className="text-xs text-[var(--violet)]" onClick={() => { setAnalysis(null); setEditing(t); }}>Edit</button>
                      <button className="ml-2 text-xs text-[var(--ink-soft)]" onClick={() => start(async () => { await toggleProductTemplateAction(t.id, !t.active); })}>
                        {t.active ? "Turn off" : "Turn on"}
                      </button>
                      <button className="ml-2 text-xs text-red-600" onClick={() => { if (confirm(`Delete “${t.name}”?`)) start(async () => { await deleteProductTemplateAction(t.id); }); }}>Delete</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {templates.length === 0 && (
              <tr><td colSpan={5} className="py-3 text-[var(--ink-soft)]">No templates yet. Upload an export above to teach the importer how a brand is built.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Detail({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-[var(--ink-soft)]">{k}:</dt>
      <dd className="m-0 break-words font-medium">{v}</dd>
    </div>
  );
}
