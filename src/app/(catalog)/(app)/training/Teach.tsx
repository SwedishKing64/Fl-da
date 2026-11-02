"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  deletePricingRuleAction,
  deleteTagRuleAction,
  deleteTemplateAction,
  patchHouseAction,
  ruleReachAction,
  saveKindAction,
  savePricingRuleJsonAction,
  saveSettingsAction,
  saveSupplierDefaultsAction,
  saveTagRuleAction,
  saveTemplateAction,
  setPricingRuleActiveAction,
  setTagRuleActiveAction,
  setTemplateActiveAction,
  type ActionResult,
  type RuleReach,
} from "@/app/(catalog)/actions";
import { Badge, Button, INPUT, cx } from "@/app/(catalog)/ui";
import { fromGrams, toGrams, type HouseConventions } from "@/lib/catalog/house";
import { ENDINGS, SOURCE_LABELS, type Area, type Belief, type Choice, type Edit, type Source } from "@/lib/catalog/teaching";

/**
 * What Flöda believes about the shop, by area, every belief a sentence that can be changed where
 * it stands. A row's Change opens the one editor that belief needs — two tiles for a choice, a box
 * for a text, a few fields for a rule — and Keep writes it and reloads the sentence. Each area ends
 * with Add a rule, for the thing no export could show.
 */
export interface TeachLists {
  /** The product types in force, for the lists under a type field. */
  types: string[];
  tags: string[];
  brands: string[];
  taxName: string;
  houseRules: string;
  houseNotes: string;
}

const TONE: Record<Source, "info" | "success" | "neutral" | "warning"> = { export: "info", website: "info", you: "success", floda: "neutral", supplier: "warning" };

export function Teach({ areas, lists }: { areas: Area[]; lists: TeachLists }) {
  return (
    <div className="space-y-5">
      <datalist id="teach-types">{lists.types.map((t) => <option key={t} value={t} />)}</datalist>
      <datalist id="teach-tags">{lists.tags.map((t) => <option key={t} value={t} />)}</datalist>
      <datalist id="teach-brands">{lists.brands.map((t) => <option key={t} value={t} />)}</datalist>
      {areas.map((a) => <AreaCard key={a.key} area={a} lists={lists} />)}
    </div>
  );
}

/**
 * One area, folded shut: its name, what it covers and how much of it the shop has taught. Open,
 * every belief in it and Add a rule. A link to the area (#house, #pricing-rules) opens it.
 */
function AreaCard({ area, lists }: { area: Area; lists: TeachLists }) {
  const [adding, setAdding] = useState(false);
  const anchor = area.key === "titles" ? "house" : area.key === "pricing" ? "pricing-rules" : area.key;
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const follow = () => { if (window.location.hash === `#${anchor}`) setOpen(true); };
    follow();
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, [anchor]);
  const taught = area.beliefs.filter((b) => b.source !== "floda").length;
  const off = area.beliefs.filter((b) => b.off).length;
  return (
    <section id={anchor} className="card scroll-mt-6">
      <button type="button" className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="min-w-0">
          <span className="block text-[17px] font-bold tracking-[-0.01em]">{area.title}</span>
          <span className="mt-0.5 block text-[13px] text-[var(--ink-soft)]">{area.blurb}</span>
        </span>
        <span className="flex shrink-0 items-center gap-3 text-[12.5px] text-[var(--ink-soft)]">
          <span className="hidden sm:inline">{taught ? <><strong className="text-[var(--ink-2)]">{taught}</strong> from your shop · </> : null}{area.beliefs.length - taught} Flöda&rsquo;s own{off ? ` · ${off} off` : ""}</span>
          <span className={cx("grid h-7 w-7 place-items-center rounded-full bg-[var(--canvas-2)] transition-transform", open && "rotate-90")} aria-hidden>›</span>
        </span>
      </button>
      {open && (
        <>
          <ol className="divide-y divide-[var(--line-soft)] border-t border-[var(--line-soft)]">
            {area.beliefs.map((b) => <BeliefRow key={b.id} belief={b} lists={lists} />)}
          </ol>
          <footer className="border-t border-[var(--line-soft)] px-5 py-3">
            {adding ? (
              <Composer area={area} lists={lists} onDone={() => setAdding(false)} />
            ) : area.key === "suppliers" ? (
              <a href="#suppliers" className="text-[13.5px] font-semibold text-[var(--meta)]">+ Teach from an invoice</a>
            ) : (
              <button type="button" className="text-[13.5px] font-semibold text-[var(--meta)]" onClick={() => setAdding(true)}>+ Add a rule</button>
            )}
          </footer>
        </>
      )}
    </section>
  );
}

function BeliefRow({ belief: b, lists }: { belief: Belief; lists: TeachLists }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [reach, setReach] = useState<RuleReach | null>(null);
  const e = b.edit;
  const act = (fn: () => Promise<ActionResult<unknown>>) =>
    start(async () => {
      setNote("");
      const r = await fn();
      if (!r.ok) return setNote(r.error);
      setOpen(false);
      router.refresh();
    });
  const ruleId = e?.kind === "tag-rule" ? e.rule.id : e?.kind === "pricing" ? e.rule.id : e?.kind === "template" ? e.template.id : "";
  const switchable = Boolean(ruleId);
  const toggle = () => {
    if (!e) return;
    if (e.kind === "tag-rule") act(() => setTagRuleActiveAction(e.rule.id, Boolean(b.off)));
    if (e.kind === "pricing") act(() => setPricingRuleActiveAction(e.rule.id, Boolean(b.off)));
    if (e.kind === "template") act(() => setTemplateActiveAction(e.template.id, Boolean(b.off)));
  };
  const remove = () => {
    if (!e || !confirm("Delete this rule?")) return;
    if (e.kind === "tag-rule") act(() => deleteTagRuleAction(e.rule.id));
    if (e.kind === "pricing") act(() => deletePricingRuleAction(e.rule.id));
    if (e.kind === "template") act(() => deleteTemplateAction(e.template.id));
  };
  return (
    <li className={cx("px-5 py-2.5", b.off && "opacity-60")}>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-1.5">
        <p className={cx("min-w-0 flex-1 text-[14px] leading-relaxed", b.off && "line-through")}>{b.sentence}</p>
        <div className="flex shrink-0 items-center gap-2">
          <Badge tone={TONE[b.source]}>{SOURCE_LABELS[b.source]}</Badge>
          {e?.kind === "link" ? (
            e.href.startsWith("#") ? <a href={e.href} className="text-[13px] font-semibold text-[var(--meta)]">{e.label} →</a> : <Link href={e.href} className="text-[13px] font-semibold text-[var(--meta)]">{e.label} →</Link>
          ) : e ? (
            <button type="button" className="text-[13px] font-semibold text-[var(--meta)]" onClick={() => setOpen((o) => !o)} aria-expanded={open}>{open ? "Close" : "Change"}</button>
          ) : null}
          {e?.kind === "tag-rule" && <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => { setNote(""); const r = await ruleReachAction(e.rule.id); if (r.ok && r.data) setReach(r.data); else if (!r.ok) setNote(r.error); })}>Try it</Button>}
          {switchable && <Button size="sm" variant="ghost" disabled={pending} onClick={toggle}>{b.off ? "Switch on" : "Switch off"}</Button>}
          {switchable && <Button size="sm" variant="ghost" disabled={pending} onClick={remove}>Delete</Button>}
        </div>
      </div>
      {reach && (
        <p className="mt-1 text-[12.5px] text-[var(--ink-soft)]">
          On <strong>{reach.batch}</strong>: touches {reach.matched} of {reach.of} product{reach.of === 1 ? "" : "s"}{reach.examples.length ? `: ${reach.examples.join("; ")}${reach.matched > reach.examples.length ? "; …" : ""}` : "."}
        </p>
      )}
      {note && <p className="mt-1 text-[12.5px] text-[var(--danger)]">{note}</p>}
      {open && e && e.kind !== "link" && (
        <div className="mt-3 rounded-[12px] border border-[var(--line)] bg-[var(--canvas)] p-4">
          <Editor edit={e} lists={lists} pending={pending} onSave={act} onCancel={() => setOpen(false)} />
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------------------------
// The editors, one per kind of belief
// ---------------------------------------------------------------------------------------------

type Save = (fn: () => Promise<ActionResult<unknown>>) => void;

function Editor({ edit: e, lists, pending, onSave, onCancel }: { edit: Exclude<Edit, { kind: "link" }>; lists: TeachLists; pending: boolean; onSave: Save; onCancel: () => void }) {
  switch (e.kind) {
    case "house-choice": return <ChoiceEditor label={e.label} options={e.options} current={e.current} pending={pending} onCancel={onCancel} onKeep={(key) => onSave(() => patchHouseAction(housePatch(e.path, key)))} />;
    case "house-text": return <TextEditor label={e.label} multiline={e.multiline} placeholder={e.placeholder} pending={pending} onCancel={onCancel} onKeep={(v) => onSave(() => patchHouseAction(housePatch(e.path, v)))} />;
    case "setting-text": return <TextEditor label={e.label} multiline={e.multiline} placeholder={e.placeholder} pending={pending} onCancel={onCancel} onKeep={(v) => onSave(() => saveSettingsAction({ [e.key]: v }))} />;
    case "setting-choice": return <ChoiceEditor label={e.label} options={e.options} current={e.current} pending={pending} onCancel={onCancel} onKeep={(key) => onSave(() => saveSettingsAction({ [e.key]: key }))} />;
    case "setting-number": return <NumberEditor label={e.label} suffix={e.suffix} pending={pending} onCancel={onCancel} onKeep={(n) => onSave(() => saveSettingsAction({ [e.key]: n }))} />;
    case "year-on": return <YearOnEditor types={e.types} tags={e.tags} pending={pending} onCancel={onCancel} onKeep={(types, tags) => onSave(() => patchHouseAction({ naming: { season: "chosen", yearOn: { types, tags } } }))} />;
    case "sections": return <SectionsEditor sections={e.sections} pending={pending} onCancel={onCancel} onKeep={(sections) => onSave(() => patchHouseAction({ descriptions: { sections } }))} />;
    case "weights": return <WeightsEditor weights={e.weights} pending={pending} onCancel={onCancel} onKeep={(weights) => onSave(() => patchHouseAction({ weights }))} />;
    case "kind": return <KindEditor edit={e} pending={pending} onCancel={onCancel} onKeep={(value) => onSave(() => saveKindAction({ type: e.type, patch: e.field === "tags" || e.field === "variesTags" ? { [e.field]: splitList(value) } : { [e.field]: value } }))} />;
    case "tag-rule": return <TagRuleEditor rule={e.rule} pending={pending} onCancel={onCancel} onKeep={(r) => onSave(() => saveTagRuleAction({ id: e.rule.id, ...r }))} />;
    case "template": return <TemplateEditor template={e.template} lists={lists} pending={pending} onCancel={onCancel} onKeep={(t) => onSave(() => saveTemplateAction({ id: e.template.id || undefined, scope: e.template.scope, matchValue: e.template.matchValue, ...t }))} />;
    case "pricing": return <PricingEditor rule={e.rule} taxName={lists.taxName} pending={pending} onCancel={onCancel} onKeep={(r) => onSave(() => savePricingRuleJsonAction({ id: e.rule.id, ...r }))} />;
    case "supplier": return <SupplierEditor supplier={e.supplier} taxName={lists.taxName} pending={pending} onCancel={onCancel} onKeep={(s) => onSave(() => saveSupplierDefaultsAction({ id: e.supplier.id, ...s }))} />;
  }
}

/** "naming.brandInTitle" and a value as the patch the house action takes. */
function housePatch(path: string, value: string): Parameters<typeof patchHouseAction>[0] {
  const [group, field] = path.split(".");
  if (!field) return { notes: value } as Parameters<typeof patchHouseAction>[0];
  return { [group]: { [field]: value } } as Parameters<typeof patchHouseAction>[0];
}

const splitList = (s: string) => s.split(",").map((t) => t.trim()).filter(Boolean);

function Actions({ pending, disabled, onCancel, onKeep, keep = "Keep" }: { pending: boolean; disabled?: boolean; onCancel: () => void; onKeep: () => void; keep?: string }) {
  return (
    <div className="mt-3 flex items-center gap-2">
      <Button size="sm" variant="primary" disabled={pending || disabled} onClick={onKeep}>{pending ? "Keeping…" : keep}</Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={onCancel}>Cancel</Button>
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <span className="mb-1.5 block text-[13px] font-semibold text-[var(--ink-2)]">{children}</span>;
}

function ChoiceEditor({ label, options, current, pending, onCancel, onKeep }: { label: string; options: Choice[]; current: string; pending: boolean; onCancel: () => void; onKeep: (key: string) => void }) {
  const [key, setKey] = useState(current);
  return (
    <div>
      <Label>{label}</Label>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <button key={o.key} type="button" onClick={() => setKey(o.key)} className={cx("rounded-[12px] border px-3 py-2 text-left transition", key === o.key ? "border-[var(--meta)] bg-[var(--meta-tint)]" : "border-[var(--line)] bg-white hover:border-[var(--meta-bright)]")} aria-pressed={key === o.key}>
            <span className="block text-[13.5px] font-semibold">{o.title}</span>
            <span className="block text-[12.5px] text-[var(--ink-soft)]">{o.text}</span>
          </button>
        ))}
      </div>
      <Actions pending={pending} disabled={!key || key === current} onCancel={onCancel} onKeep={() => key && onKeep(key)} />
    </div>
  );
}

function TextEditor({ label, multiline, placeholder, pending, onCancel, onKeep }: { label: string; multiline?: boolean; placeholder?: string; pending: boolean; onCancel: () => void; onKeep: (value: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <div>
      <Label>{label}</Label>
      {multiline ? <textarea className={cx(INPUT, "min-h-[6rem]")} value={value} onChange={(ev) => setValue(ev.target.value)} placeholder={placeholder} /> : <input className={INPUT} value={value} onChange={(ev) => setValue(ev.target.value)} placeholder={placeholder} />}
      <p className="mt-1 text-[12px] text-[var(--ink-soft)]">Leave it empty and keep to clear it.</p>
      <Actions pending={pending} onCancel={onCancel} onKeep={() => onKeep(value.trim())} />
    </div>
  );
}

function NumberEditor({ label, suffix, pending, onCancel, onKeep }: { label: string; suffix: string; pending: boolean; onCancel: () => void; onKeep: (n: number) => void }) {
  const [value, setValue] = useState("");
  const n = Number(value);
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex items-center gap-2"><input type="number" min={0} max={100} className={cx(INPUT, "w-28")} value={value} onChange={(ev) => setValue(ev.target.value)} /><span className="text-[14px]">{suffix}</span></div>
      <Actions pending={pending} disabled={value === "" || !Number.isFinite(n)} onCancel={onCancel} onKeep={() => onKeep(n)} />
    </div>
  );
}

function YearOnEditor({ types, tags, pending, onCancel, onKeep }: { types: string[]; tags: string[]; pending: boolean; onCancel: () => void; onKeep: (types: string[], tags: string[]) => void }) {
  const [t, setT] = useState(types.join(", "));
  const [g, setG] = useState(tags.join(", "));
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block"><Label>Product types that carry the year</Label><input className={INPUT} list="teach-types" value={t} onChange={(ev) => setT(ev.target.value)} placeholder="Bikes, Helmets" /></label>
      <label className="block"><Label>Or anything tagged</Label><input className={INPUT} list="teach-tags" value={g} onChange={(ev) => setG(ev.target.value)} placeholder="seasonal" /></label>
      <div className="sm:col-span-2"><Actions pending={pending} onCancel={onCancel} onKeep={() => onKeep(splitList(t), splitList(g))} /></div>
    </div>
  );
}

function SectionsEditor({ sections, pending, onCancel, onKeep }: { sections: Array<{ heading: string; holds: string }>; pending: boolean; onCancel: () => void; onKeep: (sections: Array<{ heading: string; holds: string }>) => void }) {
  const [rows, setRows] = useState(sections.length ? sections : [{ heading: "", holds: "" }]);
  const set = (i: number, patch: Partial<{ heading: string; holds: string }>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div>
      <Label>Sections after the details, in order</Label>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input className={cx(INPUT, "w-44")} value={r.heading} onChange={(ev) => set(i, { heading: ev.target.value })} placeholder="Features" />
            <input className={cx(INPUT, "min-w-[14rem] flex-1")} value={r.holds} onChange={(ev) => set(i, { holds: ev.target.value })} placeholder="the technologies, one per line" />
            <button type="button" className="text-[13px] text-[var(--ink-soft)] hover:text-[var(--ink)]" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>Remove</button>
          </div>
        ))}
      </div>
      <button type="button" className="mt-2 text-[13px] font-semibold text-[var(--meta)]" onClick={() => setRows((rs) => [...rs, { heading: "", holds: "" }])}>+ Another section</button>
      <Actions pending={pending} onCancel={onCancel} onKeep={() => onKeep(rows.map((r) => ({ heading: r.heading.trim(), holds: r.holds.trim() })).filter((r) => r.heading))} />
    </div>
  );
}

function WeightsEditor({ weights: initial, pending, onCancel, onKeep }: { weights: HouseConventions["weights"]; pending: boolean; onCancel: () => void; onKeep: (w: HouseConventions["weights"]) => void }) {
  const [w, setW] = useState(initial);
  const unit = w.unit;
  return (
    <div className="space-y-3">
      <div>
        <Label>How weight is written</Label>
        <div className="grid gap-2 sm:grid-cols-3">
          {([["none", "Not written", "Shipping is worked out another way."], ["byKind", "By product type", "Tents 2 kg, socks 80 g."], ["fixed", "The same on everything", "One weight on every variant."]] as const).map(([key, title, text]) => (
            <button key={key} type="button" onClick={() => setW({ ...w, mode: key })} className={cx("rounded-[12px] border px-3 py-2 text-left", w.mode === key ? "border-[var(--meta)] bg-[var(--meta-tint)]" : "border-[var(--line)] bg-white")} aria-pressed={w.mode === key}>
              <span className="block text-[13.5px] font-semibold">{title}</span><span className="block text-[12.5px] text-[var(--ink-soft)]">{text}</span>
            </button>
          ))}
        </div>
      </div>
      {w.mode !== "none" && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="block"><Label>Unit</Label><select className={INPUT} value={unit} onChange={(ev) => setW({ ...w, unit: ev.target.value as "g" | "kg" })}><option value="g">grams</option><option value="kg">kilograms</option></select></label>
          {w.mode === "fixed" && <label className="block"><Label>Weight ({unit})</Label><input type="number" min={0} step={unit === "kg" ? 0.01 : 1} className={cx(INPUT, "w-32")} value={fromGrams(w.fixedGrams, unit)} onChange={(ev) => setW({ ...w, fixedGrams: toGrams(Number(ev.target.value) || 0, unit) })} /></label>}
        </div>
      )}
      {w.mode === "byKind" && (
        <div className="space-y-2">
          {w.byKind.map((k, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className={cx(INPUT, "w-48")} list="teach-types" value={k.type} onChange={(ev) => setW({ ...w, byKind: w.byKind.map((x, j) => (j === i ? { ...x, type: ev.target.value } : x)) })} placeholder="Backpacks" />
              <input type="number" min={0} step={unit === "kg" ? 0.01 : 1} className={cx(INPUT, "w-28")} value={fromGrams(k.grams, unit)} onChange={(ev) => setW({ ...w, byKind: w.byKind.map((x, j) => (j === i ? { ...x, grams: toGrams(Number(ev.target.value) || 0, unit) } : x)) })} />
              <span className="text-[13px]">{unit}</span>
              <button type="button" className="text-[13px] text-[var(--ink-soft)] hover:text-[var(--ink)]" onClick={() => setW({ ...w, byKind: w.byKind.filter((_, j) => j !== i) })}>Remove</button>
            </div>
          ))}
          <button type="button" className="text-[13px] font-semibold text-[var(--meta)]" onClick={() => setW({ ...w, byKind: [...w.byKind, { type: "", grams: 0 }] })}>+ Another product type</button>
        </div>
      )}
      <Actions pending={pending} onCancel={onCancel} onKeep={() => onKeep(w)} />
    </div>
  );
}

function KindEditor({ edit: e, pending, onCancel, onKeep }: { edit: Extract<Edit, { kind: "kind" }>; pending: boolean; onCancel: () => void; onKeep: (value: string) => void }) {
  const [value, setValue] = useState(e.value);
  const list = e.field === "calledAs" ? "teach-types" : e.field === "titleFormat" ? undefined : "teach-tags";
  return (
    <div>
      <Label>{e.label}</Label>
      <input className={INPUT} list={list} value={value} onChange={(ev) => setValue(ev.target.value)} placeholder={e.field === "titleFormat" ? "Osprey Talon 22 2026" : e.field === "calledAs" ? e.type : "hiking, packs, mens"} />
      {(e.field === "tags" || e.field === "variesTags") && <p className="mt-1 text-[12px] text-[var(--ink-soft)]">Comma-separated.</p>}
      <Actions pending={pending} onCancel={onCancel} onKeep={() => onKeep(value.trim())} />
    </div>
  );
}

const FIELDS: Array<[string, string]> = [["brand", "the brand"], ["productType", "the product type"], ["title", "the title"], ["category", "the category"], ["sku", "the SKU"], ["any", "anything about the product"]];

function TagRuleEditor({ rule, pending, onCancel, onKeep }: { rule: { matchField: string; pattern: string; addTags: string; setProductType: string }; pending: boolean; onCancel: () => void; onKeep: (r: { matchField: string; pattern: string; addTags: string; setProductType: string }) => void }) {
  const [r, setR] = useState({ matchField: rule.matchField, pattern: rule.pattern, addTags: rule.addTags, setProductType: rule.setProductType });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block"><Label>When</Label><select className={INPUT} value={r.matchField} onChange={(ev) => setR({ ...r, matchField: ev.target.value })}>{FIELDS.map(([k, w]) => <option key={k} value={k}>{w} contains</option>)}</select></label>
      <label className="block"><Label>This</Label><input className={INPUT} list={r.matchField === "brand" ? "teach-brands" : r.matchField === "productType" ? "teach-types" : undefined} value={r.pattern} onChange={(ev) => setR({ ...r, pattern: ev.target.value })} placeholder={r.matchField === "brand" ? "Osprey" : r.matchField === "productType" ? "Backpacks" : "women's"} /></label>
      <label className="block"><Label>Add the tags</Label><input className={INPUT} list="teach-tags" value={r.addTags} onChange={(ev) => setR({ ...r, addTags: ev.target.value })} placeholder="hiking, osprey" /></label>
      <label className="block"><Label>And file it as (optional)</Label><input className={INPUT} list="teach-types" value={r.setProductType} onChange={(ev) => setR({ ...r, setProductType: ev.target.value })} placeholder="Backpacks" /></label>
      <div className="sm:col-span-2"><Actions pending={pending} onCancel={onCancel} onKeep={() => onKeep(r)} /></div>
    </div>
  );
}

function TemplateEditor({ template, lists, pending, onCancel, onKeep }: { template: { scope: string; matchValue: string; optionNames: string[]; tags: string[]; productType: string; notes: string }; lists: TeachLists; pending: boolean; onCancel: () => void; onKeep: (t: { optionNames: string[]; addTags: string[]; setProductType: string; notes: string }) => void }) {
  const [options, setOptions] = useState(template.optionNames.join(", "));
  const [tags, setTags] = useState(template.tags.join(", "));
  const [type, setType] = useState(template.productType);
  const [notes, setNotes] = useState(template.notes);
  void lists;
  const who = template.scope === "BRAND" ? `${template.matchValue} products` : template.matchValue;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block sm:col-span-2"><Label>{who} are sold by (up to three, in order)</Label><input className={INPUT} value={options} onChange={(ev) => setOptions(ev.target.value)} placeholder="Size, Colour" /></label>
      <label className="block"><Label>Tags every one gets</Label><input className={INPUT} list="teach-tags" value={tags} onChange={(ev) => setTags(ev.target.value)} placeholder="hiking" /></label>
      <label className="block"><Label>Filed as</Label><input className={INPUT} list="teach-types" value={type} onChange={(ev) => setType(ev.target.value)} placeholder={template.scope === "BRAND" ? "leave empty to keep each product's own type" : template.matchValue} /></label>
      <label className="block sm:col-span-2"><Label>A note for the writer about these</Label><textarea className={cx(INPUT, "min-h-[4rem]")} value={notes} onChange={(ev) => setNotes(ev.target.value)} placeholder="Always name the capacity in litres." /></label>
      <div className="sm:col-span-2"><Actions pending={pending} onCancel={onCancel} onKeep={() => onKeep({ optionNames: splitList(options).slice(0, 3), addTags: splitList(tags), setProductType: type.trim(), notes: notes.trim() })} /></div>
    </div>
  );
}

function PricingEditor({ rule, taxName, pending, onCancel, onKeep }: { rule: { scope: string; matchValue: string; mode: string; percent: number; roundTo: string } | null; taxName: string; pending: boolean; onCancel: () => void; onKeep: (r: { scope: string; matchValue: string; mode: string; percent: number; roundTo: string }) => void }) {
  const [r, setR] = useState({ scope: rule?.scope ?? "BRAND", matchValue: rule?.matchValue ?? "", mode: rule?.mode ?? "MARGIN", percent: rule ? String(rule.percent) : "", roundTo: rule?.roundTo ?? "0.99" });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block"><Label>For</Label><select className={INPUT} value={r.scope} onChange={(ev) => setR({ ...r, scope: ev.target.value })}><option value="BRAND">one brand</option><option value="CATEGORY">one product type</option><option value="PRODUCT">one SKU or model</option><option value="DEFAULT">everything else</option></select></label>
      {r.scope !== "DEFAULT" && <label className="block"><Label>Which</Label><input className={INPUT} list={r.scope === "BRAND" ? "teach-brands" : r.scope === "CATEGORY" ? "teach-types" : undefined} value={r.matchValue} onChange={(ev) => setR({ ...r, matchValue: ev.target.value })} placeholder={r.scope === "BRAND" ? "Osprey" : r.scope === "CATEGORY" ? "Backpacks" : "V2610112"} /></label>}
      <label className="block"><Label>Set the price by</Label><select className={INPUT} value={r.mode} onChange={(ev) => setR({ ...r, mode: ev.target.value })}><option value="MARGIN">margin: this much of the ex-{taxName} price is profit</option><option value="MARKUP">markup: the landed cost plus this much</option></select></label>
      <label className="block"><Label>Percent</Label><input type="number" min={0} max={999} className={cx(INPUT, "w-32")} value={r.percent} onChange={(ev) => setR({ ...r, percent: ev.target.value })} placeholder="40" /></label>
      <label className="block"><Label>Then end the price</Label><select className={INPUT} value={r.roundTo} onChange={(ev) => setR({ ...r, roundTo: ev.target.value })}>{ENDINGS.map((e) => <option key={e.key} value={e.key}>{e.title.toLowerCase()}</option>)}</select></label>
      <div className="sm:col-span-2"><Actions pending={pending} disabled={r.percent === ""} onCancel={onCancel} onKeep={() => onKeep({ ...r, percent: Number(r.percent) })} /></div>
    </div>
  );
}

function SupplierEditor({ supplier, taxName, pending, onCancel, onKeep }: { supplier: { name: string; defaultCurrency: string; defaultGstTreatment: string; defaultBrand: string | null }; taxName: string; pending: boolean; onCancel: () => void; onKeep: (s: { defaultCurrency: string; defaultGstTreatment: string; defaultBrand: string }) => void }) {
  const [s, setS] = useState({ defaultCurrency: supplier.defaultCurrency, defaultGstTreatment: supplier.defaultGstTreatment, defaultBrand: supplier.defaultBrand ?? "" });
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="block"><Label>{supplier.name} costs in</Label><input className={INPUT} value={s.defaultCurrency} onChange={(ev) => setS({ ...s, defaultCurrency: ev.target.value.toUpperCase() })} placeholder="AUD" maxLength={3} /></label>
      <label className="block"><Label>{taxName} on their costs</Label><select className={INPUT} value={s.defaultGstTreatment} onChange={(ev) => setS({ ...s, defaultGstTreatment: ev.target.value })}><option value="EXCLUSIVE">not included</option><option value="INCLUSIVE">included</option><option value="NONE">none</option></select></label>
      <label className="block"><Label>Brand, unless the file says</Label><input className={INPUT} list="teach-brands" value={s.defaultBrand} onChange={(ev) => setS({ ...s, defaultBrand: ev.target.value })} placeholder="their own" /></label>
      <div className="sm:col-span-3"><Actions pending={pending} onCancel={onCancel} onKeep={() => onKeep(s)} /></div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Add a rule: the one thing each area can be told that nothing above covers
// ---------------------------------------------------------------------------------------------

function Composer({ area, lists, onDone }: { area: Area; lists: TeachLists; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const save: Save = (fn) =>
    start(async () => {
      setNote("");
      const r = await fn();
      if (!r.ok) return setNote(r.error);
      onDone();
      router.refresh();
    });
  const body = (() => {
    switch (area.key) {
      case "filing":
        return <TagRuleEditor rule={{ matchField: "brand", pattern: "", addTags: "", setProductType: "" }} pending={pending} onCancel={onDone} onKeep={(r) => save(() => saveTagRuleAction(r))} />;
      case "titles":
        return <TypeAndText label="Titles of this product type read like" placeholder="Osprey Talon 22 2026" pending={pending} onCancel={onDone} onKeep={(type, value) => save(() => saveKindAction({ type, patch: { titleFormat: value } }))} />;
      case "descriptions":
        return <TextEditor label="Something the writer should always do, or never do, on every description" multiline placeholder="Never say 'premium'. Mention the warranty." pending={pending} onCancel={onDone} onKeep={(v) => save(() => patchHouseAction({ notes: [lists.houseNotes, v].filter(Boolean).join("\n") }))} />;
      case "variants":
        return <TypeAndText label="This product type is sold by (up to three options, in order)" placeholder="Size, Colour" pending={pending} onCancel={onDone} onKeep={(type, value) => save(() => saveTemplateAction({ scope: "PRODUCT_TYPE", matchValue: type, optionNames: splitList(value).slice(0, 3) }))} />;
      case "pricing":
        return <PricingEditor rule={null} taxName={lists.taxName} pending={pending} onCancel={onDone} onKeep={(r) => save(() => savePricingRuleJsonAction(r))} />;
      case "seo":
        return <TextEditor label="A rule for the writer, on every product" multiline placeholder="Always name the model year. Say 'batteries not included' where they are not." pending={pending} onCancel={onDone} onKeep={(v) => save(() => saveSettingsAction({ houseRules: [lists.houseRules, v].filter(Boolean).join("\n") }))} />;
      default:
        return null;
    }
  })();
  return (
    <div className="rounded-[12px] border border-[var(--line)] bg-[var(--canvas)] p-4">
      {body}
      {note && <p className="mt-2 text-[12.5px] text-[var(--danger)]">{note}</p>}
    </div>
  );
}

function TypeAndText({ label, placeholder, pending, onCancel, onKeep }: { label: string; placeholder: string; pending: boolean; onCancel: () => void; onKeep: (type: string, value: string) => void }) {
  const [type, setType] = useState("");
  const [value, setValue] = useState("");
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block"><Label>Product type</Label><input className={INPUT} list="teach-types" value={type} onChange={(ev) => setType(ev.target.value)} placeholder="Backpacks" /></label>
      <label className="block"><Label>{label}</Label><input className={INPUT} value={value} onChange={(ev) => setValue(ev.target.value)} placeholder={placeholder} /></label>
      <div className="sm:col-span-2"><Actions pending={pending} disabled={!type.trim() || !value.trim()} onCancel={onCancel} onKeep={() => onKeep(type.trim(), value.trim())} /></div>
    </div>
  );
}
