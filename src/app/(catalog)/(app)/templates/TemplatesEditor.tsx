"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import {
  analyseTemplateCsvsAction,
  deleteProductTemplateAction,
  saveHouseRulesAction,
  saveTemplateAction,
  saveTemplatesBulkAction,
  toggleProductTemplateAction,
  type TemplateProposal,
} from "@/app/(catalog)/actions";
import { Alert, Badge, Button, Field, INPUT } from "@/app/(catalog)/ui";
import { ActionForm } from "@/app/(catalog)/ActionForm";
import { TEMPLATE_SCOPES } from "@/lib/catalog/templates";
import { CATEGORIES } from "@/lib/catalog/types";

export interface TemplateRow {
  id: string;
  name: string;
  scope: string;
  matchValue: string;
  matchProductType: string;
  notes: string;
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

/** A proposal plus the two things a person can change about it before saving. */
type Draft = TemplateProposal & { selected: boolean; notes: string };

const TEXTAREA =
  "w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm leading-relaxed outline-none focus:border-[var(--violet)]";

const NOTES_PLACEHOLDER = `What the export can't show. For example:
• Lead the title with the model year, then brand, then model.
• The supplier's "flex" number is our stiffness metafield, 1-10.
• Never tag a junior ski as All-Mountain even if the spec sheet says so.
• Length goes in the option, never in the title.`;

export function TemplatesEditor({
  templates,
  houseRules,
  isAdmin,
}: {
  templates: TemplateRow[];
  houseRules: string;
  isAdmin: boolean;
}) {
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [uploadWarnings, setUploadWarnings] = useState<string[]>([]);
  const [filesRead, setFilesRead] = useState(0);
  const [openNotes, setOpenNotes] = useState<string | null>(null);
  const [editing, setEditing] = useState<TemplateRow | null>(null);
  const [reading, startReading] = useTransition();
  const [saving, startSaving] = useTransition();
  const [readError, setReadError] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [state, action, pending] = useActionState(saveTemplateAction, null);
  const [houseState, houseAction, housePending] = useActionState(saveHouseRulesAction, null);
  const [, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const readFiles = (files: FileList) => {
    setReadError(null);
    setBulkResult(null);
    const data = new FormData();
    for (const file of Array.from(files)) data.append("files", file);
    startReading(async () => {
      const result = await analyseTemplateCsvsAction(data);
      if (result.ok && result.data) {
        setEditing(null);
        setDrafts(result.data.proposals.map((p) => ({ ...p, selected: true, notes: "" })));
        setUploadWarnings(result.data.warnings);
        setFilesRead(result.data.filesRead);
      } else {
        setDrafts(null);
        setReadError(result.ok ? "Those files could not be read." : result.error);
      }
    });
  };

  const patch = (key: string, change: Partial<Draft>) =>
    setDrafts((current) => current?.map((d) => (d.key === key ? { ...d, ...change } : d)) ?? null);

  const clearUpload = () => {
    setDrafts(null);
    setUploadWarnings([]);
    setOpenNotes(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const saveSelected = () => {
    const chosen = drafts?.filter((d) => d.selected) ?? [];
    if (chosen.length === 0) return;
    startSaving(async () => {
      const result = await saveTemplatesBulkAction(chosen);
      if (result.ok) {
        setBulkResult({ ok: true, message: result.message ?? "Saved." });
        clearUpload();
      } else {
        setBulkResult({ ok: false, message: result.error });
      }
    });
  };

  const selectedCount = drafts?.filter((d) => d.selected).length ?? 0;
  const withNotes = drafts?.filter((d) => d.notes.trim()).length ?? 0;

  return (
    <div className="space-y-8">
      {/* ---- 1. The nuances that apply to everything ---- */}
      {isAdmin && (
        <section>
          <h3 className="text-sm font-semibold">House rules</h3>
          <p className="mt-1 max-w-3xl text-sm text-[var(--ink-soft)]">
            Things that are true of every product you build, in your own words. An export shows which fields were filled
            in; it cannot say why. This is read every time a product description or SEO title is written, so it is where
            conventions belong that no spreadsheet can express.
          </p>
          <ActionForm action={houseAction} state={houseState} className="mt-3 space-y-2">
            <textarea
              id="house-rules"
              name="houseRules"
              rows={5}
              defaultValue={houseRules}
              className={TEXTAREA}
              placeholder={"For example:\n• Australian spelling. Colour, not color.\n• Never claim a ski is “beginner friendly” unless the supplier says so.\n• Always name who the product suits in the first sentence.\n• Sizes are AU unless the brand is European."}
            />
            <div className="flex items-center gap-3">
              <Button type="submit" variant="primary" disabled={housePending}>Save house rules</Button>
              {houseState && (houseState.ok
                ? <span className="text-sm text-[var(--ink-soft)]">{houseState.message}</span>
                : <span className="text-sm text-red-600">{houseState.error}</span>)}
            </div>
          </ActionForm>
        </section>
      )}

      {/* ---- 2. Bulk upload ---- */}
      <section>
        <h3 className="text-sm font-semibold">Upload your existing products</h3>
        <p className="mt-1 max-w-3xl text-sm text-[var(--ink-soft)]">
          Shopify exports of products you have already built. Select as many files as you like at once — each file is
          split by brand and product type, so one whole-catalogue export becomes a template per range rather than one
          muddled template for everything. Nothing is saved until you have looked at what it read.
        </p>
        <div className="mt-3 rounded-lg border border-dashed border-[var(--line)] bg-[var(--canvas)] p-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              id="template-file"
              type="file"
              multiple
              accept=".csv,text/csv"
              className="text-sm"
              onChange={(e) => {
                const files = e.target.files;
                if (files && files.length) readFiles(files);
              }}
            />
            {reading && <span className="text-sm text-[var(--ink-soft)]">Reading…</span>}
          </div>
          <p className="mt-2 text-xs text-[var(--ink-soft)]">
            Up to 60 files, each under 8MB. A brand and type you upload twice updates its template rather than making a
            second one, so re-exporting later is safe.
          </p>
        </div>
        {readError && <div className="mt-3"><Alert tone="danger">{readError}</Alert></div>}
        {bulkResult && (
          <div className="mt-3">
            {bulkResult.ok ? <Alert tone="success">{bulkResult.message}</Alert> : <Alert tone="danger">{bulkResult.message}</Alert>}
          </div>
        )}
      </section>

      {/* ---- 3. Review what it learned ---- */}
      {drafts && (
        <section className="rounded-lg border border-[var(--line)] p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">
              {drafts.length} template{drafts.length === 1 ? "" : "s"} proposed from {filesRead} file{filesRead === 1 ? "" : "s"}
            </h3>
            <div className="flex gap-3 text-xs text-[var(--ink-soft)]">
              <button type="button" className="text-[var(--violet)]" onClick={() => setDrafts(drafts.map((d) => ({ ...d, selected: true })))}>Select all</button>
              <button type="button" className="text-[var(--violet)]" onClick={() => setDrafts(drafts.map((d) => ({ ...d, selected: false })))}>Select none</button>
            </div>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-[var(--ink-soft)]">
            Untick anything that looks like a coincidence rather than a convention — a tag that happens to be on most of
            a range is not necessarily one you want on everything new. Add a note to any range where the nuances matter.
          </p>

          {uploadWarnings.length > 0 && (
            <details className="mt-3 text-xs text-[var(--ink-soft)]">
              <summary className="cursor-pointer">{uploadWarnings.length} note{uploadWarnings.length === 1 ? "" : "s"} about the files</summary>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {uploadWarnings.map((w) => <li key={w}>{w}</li>)}
              </ul>
            </details>
          )}

          <div className="mt-3 overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-[var(--ink-soft)]">
                <tr>
                  <th className="w-8 py-1" />
                  <th className="py-1">Template</th>
                  <th>Applies to</th>
                  <th>What it learned</th>
                  <th className="text-right">From</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {drafts.map((d) => (
                  <FragmentRow
                    key={d.key}
                    draft={d}
                    open={openNotes === d.key}
                    onToggleNotes={() => setOpenNotes(openNotes === d.key ? null : d.key)}
                    onPatch={(change) => patch(d.key, change)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {isAdmin ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button variant="primary" onClick={saveSelected} disabled={saving || selectedCount === 0}>
                {saving ? "Saving…" : `Save ${selectedCount} template${selectedCount === 1 ? "" : "s"}`}
              </Button>
              <Button onClick={clearUpload}>Discard</Button>
              <span className="text-xs text-[var(--ink-soft)]">
                {withNotes > 0 ? `${withNotes} with notes. ` : ""}
                You can add or change notes later from the list below.
              </span>
            </div>
          ) : (
            <div className="mt-4"><Alert tone="info">Only an admin can save templates.</Alert></div>
          )}
        </section>
      )}

      {/* ---- 4. Editing one existing template by hand ---- */}
      {isAdmin && editing && (
        <ActionForm action={action} state={state} key={editing.id} className="grid gap-3 rounded-lg border border-[var(--line)] p-4 sm:grid-cols-4">
          <div className="sm:col-span-4 text-sm font-semibold">Edit “{editing.name}”</div>
          <input type="hidden" name="id" value={editing.id} />
          <input type="hidden" name="sourceFileName" value={editing.sourceFileName} />
          <input type="hidden" name="productCount" value={editing.productCount} />
          <input type="hidden" name="setMetafields" value={JSON.stringify(editing.setMetafields)} />

          <Field label="Template name" className="sm:col-span-2">
            <input name="name" required defaultValue={editing.name} className={INPUT} />
          </Field>
          <Field label="Applies to">
            <select name="scope" defaultValue={editing.scope} className={INPUT}>
              {TEMPLATE_SCOPES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Matching" hint="The brand, product type or category to match">
            <input name="matchValue" required defaultValue={editing.matchValue} className={INPUT} list="template-cats" />
            <datalist id="template-cats">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field
            label="Only for product type"
            className="sm:col-span-2"
            hint="Leave blank to apply to everything that matches above. Set when the export was all one type, so a brand's skis conventions do not land on its beanies."
          >
            <input name="matchProductType" defaultValue={editing.matchProductType} className={INPUT} placeholder="e.g. Skis" />
          </Field>

          <Field label="Set product type" className="sm:col-span-2" hint="Only used when the product has no type yet">
            <input name="setProductType" defaultValue={editing.setProductType} className={INPUT} />
          </Field>
          <Field label="Option names" className="sm:col-span-2" hint="Comma separated, in order">
            <input name="optionNames" defaultValue={editing.optionNames} className={INPUT} placeholder="Length, Colour" />
          </Field>
          <Field label="Add tags" className="sm:col-span-2">
            <input name="addTags" defaultValue={editing.addTags} className={INPUT} />
          </Field>
          <Field label="Add collections" className="sm:col-span-2">
            <input name="addCollections" defaultValue={editing.addCollections} className={INPUT} />
          </Field>

          <Field
            label="Notes for this range"
            className="sm:col-span-4"
            hint="Read every time copy is written for a product this template matches. Explain what the export could not show."
          >
            <textarea name="notes" rows={5} defaultValue={editing.notes} className={TEXTAREA} placeholder={NOTES_PLACEHOLDER} />
          </Field>

          {Object.keys(editing.setMetafields).length > 0 && (
            <p className="sm:col-span-4 text-xs text-[var(--ink-soft)]">
              Metafield defaults: {Object.entries(editing.setMetafields).map(([k, v]) => `${k}=${v}`).join(", ")}
            </p>
          )}

          <Field label="Priority" hint="Lower runs first">
            <input name="priority" type="number" defaultValue={editing.priority} className={INPUT} />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={editing.active} /> Active
          </label>
          <div className="flex items-end gap-2 sm:col-span-2">
            <Button type="submit" variant="primary" disabled={pending}>Save template</Button>
            <Button type="button" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
          {state && <div className="sm:col-span-4">{state.ok ? <Alert tone="success">{state.message}</Alert> : <Alert tone="danger">{state.error}</Alert>}</div>}
        </ActionForm>
      )}

      {/* ---- 5. What is saved ---- */}
      <section>
        <h3 className="text-sm font-semibold">Saved templates</h3>
        <div className="mt-2 overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-[var(--ink-soft)]">
              <tr><th className="py-1">Template</th><th>Applies to</th><th>What it sets</th><th className="text-right">From</th><th /></tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className="border-t border-[var(--line-soft)] align-top">
                  <td className="py-1.5">
                    {t.name} {!t.active && <Badge>off</Badge>}
                    {t.notes && <div className="mt-0.5 max-w-xs whitespace-pre-line text-xs text-[var(--ink-soft)]">{t.notes}</div>}
                  </td>
                  <td className="text-xs">
                    <span className="text-[var(--ink-soft)]">{TEMPLATE_SCOPES.find((s) => s.key === t.scope)?.label ?? t.scope}</span>{" "}
                    <code className="rounded bg-neutral-100 px-1">{t.matchValue}</code>
                    {t.matchProductType && <div className="text-[var(--ink-soft)]">only type {t.matchProductType}</div>}
                  </td>
                  <td className="max-w-md text-xs">
                    {t.summary}
                    {t.addTags && <div className="mt-0.5 text-[var(--ink-soft)]">tags: {t.addTags}</div>}
                    {!t.notes && <div className="mt-0.5 text-[var(--ink-soft)]">no notes yet</div>}
                  </td>
                  <td className="whitespace-nowrap text-right text-xs text-[var(--ink-soft)]">
                    {t.productCount} product{t.productCount === 1 ? "" : "s"}
                    {t.sourceFileName && <div className="truncate" title={t.sourceFileName}>{t.sourceFileName}</div>}
                  </td>
                  <td className="whitespace-nowrap text-right">
                    {isAdmin && (
                      <>
                        <button className="text-xs text-[var(--violet)]" onClick={() => { clearUpload(); setEditing(t); }}>
                          {t.notes ? "Edit" : "Add notes"}
                        </button>
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
                <tr><td colSpan={5} className="py-3 text-[var(--ink-soft)]">No templates yet. Upload your exports above to teach the importer how each range is built.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function FragmentRow({
  draft,
  open,
  onToggleNotes,
  onPatch,
}: {
  draft: Draft;
  open: boolean;
  onToggleNotes: () => void;
  onPatch: (change: Partial<Draft>) => void;
}) {
  const metafields = Object.entries(draft.setMetafields);
  return (
    <>
      <tr className="border-t border-[var(--line-soft)] align-top">
        <td className="py-1.5">
          <input
            type="checkbox"
            aria-label={`Save ${draft.name}`}
            checked={draft.selected}
            onChange={(e) => onPatch({ selected: e.target.checked })}
          />
        </td>
        <td className="py-1.5">
          <input
            aria-label={`Name for ${draft.matchValue}`}
            value={draft.name}
            onChange={(e) => onPatch({ name: e.target.value })}
            className="w-44 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm hover:border-[var(--line)] focus:border-[var(--violet)] focus:outline-none"
          />
        </td>
        <td className="text-xs">
          <span className="text-[var(--ink-soft)]">{draft.scope === "BRAND" ? "Brand" : "Product type"}</span>{" "}
          <code className="rounded bg-neutral-100 px-1">{draft.matchValue}</code>
          {draft.matchProductType && <div className="text-[var(--ink-soft)]">only type {draft.matchProductType}</div>}
        </td>
        <td className="max-w-md text-xs">
          {draft.addTags && <div>tags: {draft.addTags}</div>}
          {draft.addCollections && <div className="text-[var(--ink-soft)]">collections: {draft.addCollections}</div>}
          {draft.optionNames && <div className="text-[var(--ink-soft)]">options: {draft.optionNames.split(",").map((o) => o.trim()).join(" / ")}</div>}
          {metafields.length > 0 && (
            <div className="text-[var(--ink-soft)]">{metafields.map(([k, v]) => `${k}=${v}`).join(", ")}</div>
          )}
          {draft.titleExamples.length > 0 && (
            <div className="mt-0.5 text-[var(--ink-soft)]">titles like: {draft.titleExamples.slice(0, 2).join(" · ")}</div>
          )}
        </td>
        <td className="whitespace-nowrap text-right text-xs text-[var(--ink-soft)]">
          {draft.productCount} product{draft.productCount === 1 ? "" : "s"}
          <div className="max-w-[12rem] truncate" title={draft.fileName}>{draft.fileName}</div>
        </td>
        <td className="whitespace-nowrap text-right">
          <button type="button" className="text-xs text-[var(--violet)]" onClick={onToggleNotes}>
            {draft.notes.trim() ? "Notes ✓" : open ? "Close" : "Add notes"}
          </button>
        </td>
      </tr>
      {open && (
        <tr className="border-t border-[var(--line-soft)]">
          <td />
          <td colSpan={5} className="pb-3">
            <label className="text-xs text-[var(--ink-soft)]" htmlFor={`notes-${draft.key}`}>
              What matters about {draft.name} that the export could not show
            </label>
            <textarea
              id={`notes-${draft.key}`}
              rows={5}
              value={draft.notes}
              onChange={(e) => onPatch({ notes: e.target.value })}
              className={`${TEXTAREA} mt-1`}
              placeholder={NOTES_PLACEHOLDER}
            />
          </td>
        </tr>
      )}
    </>
  );
}
