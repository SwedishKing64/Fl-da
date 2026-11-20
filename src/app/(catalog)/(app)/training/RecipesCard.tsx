"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSupplierRecipeAction, trySupplierRecipeAction } from "@/app/(catalog)/actions";
import { Button, INPUT, cx } from "@/app/(catalog)/ui";
import { CHECK_FIELDS, type ReadComparison, type Recipes } from "@/lib/catalog/recipes";

/**
 * How each supplier's documents are to be read, in the shop's words, and what in them to trust.
 * A recipe can be tried on the supplier's last document before it is kept: the document is read
 * again with and without it and the two readings compared, nothing written.
 */
export function RecipesCard({ suppliers, recipes, aiEnabled }: { suppliers: Array<{ id: string; name: string }>; recipes: Recipes; aiEnabled: boolean }) {
  if (!suppliers.length) return <p className="text-[13px] text-[var(--ink-soft)]">No supplier yet. Drop in a supplier&rsquo;s document above and it is listed here, with room for how its documents are to be read.</p>;
  return (
    <div className="space-y-3">
      <p className="text-[14px] text-[var(--ink-soft)]">Anything the reader could not guess about a supplier&rsquo;s paperwork, said once: &ldquo;the size is the last two characters of the SKU&rdquo;, &ldquo;ignore the second tab, it is the price list&rdquo;, &ldquo;their RRP column is wholesale&rdquo;. The reader hears it ahead of every document from that supplier. Trust says what is always put to a person, and whether their descriptions are kept as written.</p>
      {suppliers.map((s) => <SupplierRecipeRow key={s.id} supplier={s} recipe={recipes[s.id]} aiEnabled={aiEnabled} />)}
    </div>
  );
}

function SupplierRecipeRow({ supplier, recipe, aiEnabled }: { supplier: { id: string; name: string }; recipe: Recipes[string] | undefined; aiEnabled: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(recipe?.recipe ?? "");
  const [checks, setChecks] = useState<string[]>(recipe?.checkFields ?? []);
  const [keep, setKeep] = useState(recipe?.keepDescriptions ?? false);
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [tried, setTried] = useState<({ filename: string } & ReadComparison) | null>(null);
  const taught = Boolean(recipe);
  const summary = recipe ? [recipe.recipe && `"${recipe.recipe.slice(0, 90)}${recipe.recipe.length > 90 ? "…" : ""}"`, recipe.checkFields.length && `always check ${recipe.checkFields.join(", ")}`, recipe.keepDescriptions && "descriptions kept"].filter(Boolean).join(" · ") : "Nothing said yet";
  const save = () => start(async () => {
    setNote("");
    const r = await saveSupplierRecipeAction(supplier.id, { recipe: text, checkFields: checks, keepDescriptions: keep });
    setNote(r.ok ? "Kept." : r.error);
    if (r.ok) router.refresh();
  });
  const tryIt = () => start(async () => {
    setNote(""); setTried(null);
    const r = await trySupplierRecipeAction(supplier.id, text);
    if (!r.ok || !r.data) return setNote(r.ok ? "No answer." : r.error);
    setTried(r.data);
  });
  return (
    <section className="rounded-[12px] border border-[var(--line)] bg-white">
      <button type="button" className="flex w-full flex-wrap items-start justify-between gap-2 px-4 py-3 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-semibold">{supplier.name}</span>
          <span className={cx("block text-[13px]", taught ? "text-[var(--ink-2)]" : "text-[var(--ink-soft)]")}>{summary}</span>
        </span>
        <span className="text-[13px] font-semibold text-[var(--meta)]">{open ? "Close" : "Change"}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-[var(--line-soft)] bg-[var(--canvas)] px-4 py-3">
          <label className="block text-sm"><span className="mb-1 block text-[13px] font-semibold text-[var(--ink-2)]">How {supplier.name}&rsquo;s documents are read</span><textarea className={cx(INPUT, "min-h-[90px]")} value={text} onChange={(e) => setText(e.target.value)} placeholder="The size is the last two characters of the SKU. Ignore the second tab; it is the price list." /></label>
          <div>
            <span className="mb-1 block text-[13px] font-semibold text-[var(--ink-2)]">Always put to a person before export</span>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13.5px]">
              {CHECK_FIELDS.map((f) => (
                <label key={f.key} className="inline-flex items-center gap-1.5"><input type="checkbox" checked={checks.includes(f.key)} onChange={(e) => setChecks((c) => (e.target.checked ? [...c, f.key] : c.filter((x) => x !== f.key)))} /> {f.label}</label>
              ))}
            </div>
          </div>
          <label className="inline-flex items-center gap-1.5 text-[13.5px]"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Keep {supplier.name}&rsquo;s descriptions as written; do not rewrite them</label>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="primary" disabled={pending} onClick={save}>Keep</Button>
            <Button size="sm" variant="ghost" disabled={pending || !aiEnabled || !text.trim()} onClick={tryIt} title={aiEnabled ? "Read this supplier's last document again, with and without the recipe, and compare" : "Needs a reading key"}>{pending ? "Working…" : "Try it on the last document"}</Button>
            {note && <span className={cx("text-[12.5px]", note === "Kept." ? "text-[var(--promoter)]" : "text-[var(--danger)]")}>{note}</span>}
          </div>
          {tried && (
            <div className="rounded-[10px] border border-[var(--line)] bg-white p-3 text-[13px]">
              <p><strong>{tried.filename}</strong>: {tried.summary}</p>
              {tried.changed.length > 0 && (
                <ul className="mt-2 space-y-1 text-[12.5px] text-[var(--ink-2)]">
                  {tried.changed.map((c) => <li key={c.row}>Line {c.row}: <del className="text-[var(--ink-soft)]">{c.before}</del> → <ins className="no-underline">{c.after}</ins></li>)}
                </ul>
              )}
              <p className="mt-2 text-[12.5px] text-[var(--ink-soft)]">Nothing was written. Keep the recipe if this is right; the next document from {supplier.name} is read with it.</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
