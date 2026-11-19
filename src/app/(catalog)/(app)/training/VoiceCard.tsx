"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { saveVoiceAction } from "@/app/(catalog)/actions";
import { Button, INPUT, cx } from "@/app/(catalog)/ui";
import { MAX_EXEMPLARS, type Voice } from "@/lib/catalog/voice";

const split = (s: string) => s.split(",").map((t) => t.trim()).filter(Boolean);

/**
 * The shop's voice, piece by piece: who it writes for, the words it uses and never uses, how it
 * spells things, its own listings as the writer's examples, the sections that are the shop's,
 * and what it says about each brand. Each piece saves on its own.
 */
export function VoiceCard({ voice, types, brands }: { voice: Voice; types: string[]; brands: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const save = (patch: Partial<Voice>) =>
    start(async () => {
      setNote("");
      const r = await saveVoiceAction(patch);
      if (!r.ok) return setNote(r.error);
      router.refresh();
    });
  return (
    <div className="space-y-5">
      <Group title="Who you write for" taught={Boolean(voice.audience)} summary={voice.audience || "Not said yet"}>
        <OneLine label="In a sentence" placeholder="weekend families from Canberra who camp twice a year" initial={voice.audience} pending={pending} onKeep={(v) => save({ audience: v })} />
      </Group>
      <Group title="Words you use, and words you never use" taught={voice.use.length + voice.avoid.length > 0} summary={[voice.use.length ? `use: ${voice.use.join(", ")}` : "", voice.avoid.length ? `never: ${voice.avoid.join(", ")}` : ""].filter(Boolean).join(" · ") || "No house dictionary yet"}>
        <TwoLines a={{ label: "Words you use (comma separated)", placeholder: "colourway, mitts, bluebird day", initial: voice.use.join(", ") }} b={{ label: "Words you never use", placeholder: "premium, game-changing, must-have", initial: voice.avoid.join(", ") }} pending={pending} onKeep={(a, b) => save({ use: split(a), avoid: split(b) })} />
      </Group>
      <Group title="Spelled your way" taught={voice.spellings.length > 0} summary={voice.spellings.length ? voice.spellings.map((s) => `${s.to} not ${s.from}${s.brand ? ` (${s.brand})` : ""}`).join(", ") : "None yet"}>
        <Rows
          rows={voice.spellings.map((s) => `${s.to} not ${s.from}${s.brand ? ` (${s.brand})` : ""}`)}
          onRemove={(i) => save({ spellings: voice.spellings.filter((_, j) => j !== i) })}
          fields={[{ key: "from", label: "Instead of", placeholder: "color" }, { key: "to", label: "write", placeholder: "colour" }, { key: "brand", label: "for brand (blank for all)", placeholder: "", list: brands }]}
          pending={pending}
          onAdd={(r) => save({ spellings: [...voice.spellings, { from: r.from, to: r.to, brand: r.brand }] })}
        />
      </Group>
      <Group title={`Your listings as the writer's examples (${voice.exemplars.length} of ${MAX_EXEMPLARS})`} taught={voice.exemplars.length > 0} summary={voice.exemplars.length ? voice.exemplars.map((e) => e.title || e.productType).join(", ") : "None yet: the writer goes by the format alone"}>
        <p className="mb-2 text-[12.5px] text-[var(--ink-soft)]">Pick a handful of listings you are proud of, one or two per product type. The writer sees the ones closest to each new product.</p>
        <Rows
          rows={voice.exemplars.map((e) => `${e.title || "(untitled)"}${e.productType ? ` · ${e.productType}` : ""}${e.vendor ? ` · ${e.vendor}` : ""}`)}
          onRemove={(i) => save({ exemplars: voice.exemplars.filter((_, j) => j !== i) })}
          fields={voice.exemplars.length >= MAX_EXEMPLARS ? [] : [{ key: "title", label: "Title", placeholder: "Talon 22 2026" }, { key: "productType", label: "Product type", placeholder: "Backpacks", list: types }, { key: "vendor", label: "Brand", placeholder: "Osprey", list: brands }, { key: "body", label: "The description, pasted", placeholder: "", multiline: true }]}
          pending={pending}
          onAdd={(r) => save({ exemplars: [...voice.exemplars, { title: r.title, productType: r.productType, vendor: r.vendor, body: r.body }] })}
        />
      </Group>
      <Group title="Sections of your own, after every copy" taught={voice.sections.length > 0} summary={voice.sections.length ? voice.sections.map((s) => `"${s.heading}"${s.types.length || s.brands.length ? ` (${[...s.types, ...s.brands].join(", ")})` : ""}`).join(", ") : "None yet"}>
        <p className="mb-2 text-[12.5px] text-[var(--ink-soft)]">&ldquo;Fitted in store&rdquo;, &ldquo;Our warranty&rdquo;, &ldquo;Local delivery&rdquo;: what makes a listing read as yours. Written once, added under its heading to every product it applies to.</p>
        <Rows
          rows={voice.sections.map((s) => `${s.heading}: ${s.text.slice(0, 80)}${s.text.length > 80 ? "…" : ""}${s.types.length || s.brands.length ? ` (${[...s.types, ...s.brands].join(", ")})` : ""}`)}
          onRemove={(i) => save({ sections: voice.sections.filter((_, j) => j !== i) })}
          fields={[{ key: "heading", label: "Heading", placeholder: "Fitted in store" }, { key: "text", label: "What it says", placeholder: "Bring it in and we will fit it, no charge.", multiline: true }, { key: "types", label: "Only these product types (comma separated, blank for all)", placeholder: "", list: types }, { key: "brands", label: "Only these brands (blank for all)", placeholder: "", list: brands }]}
          pending={pending}
          onAdd={(r) => save({ sections: [...voice.sections, { heading: r.heading, text: r.text, types: split(r.types), brands: split(r.brands) }] })}
        />
      </Group>
      <Group title="What you say about each brand" taught={voice.brandNotes.length > 0} summary={voice.brandNotes.length ? voice.brandNotes.map((b) => b.brand).join(", ") : "None yet"}>
        <p className="mb-2 text-[12.5px] text-[var(--ink-soft)]">Fit, care and where it is made, written once per brand and added to every one of its products.</p>
        <Rows
          rows={voice.brandNotes.map((b) => `${b.brand}: ${[b.fit && `fit, ${b.fit}`, b.care && `care, ${b.care}`, b.origin && `made, ${b.origin}`].filter(Boolean).join("; ")}`)}
          onRemove={(i) => save({ brandNotes: voice.brandNotes.filter((_, j) => j !== i) })}
          fields={[{ key: "brand", label: "Brand", placeholder: "Arc'teryx", list: brands }, { key: "fit", label: "Fit", placeholder: "Runs small; go up a size." }, { key: "care", label: "Care", placeholder: "Wash cold, no softener." }, { key: "origin", label: "Made", placeholder: "Made in Canada." }]}
          pending={pending}
          onAdd={(r) => save({ brandNotes: [...voice.brandNotes.filter((b) => b.brand.toLowerCase() !== r.brand.toLowerCase()), { brand: r.brand, fit: r.fit, care: r.care, origin: r.origin }] })}
        />
      </Group>
      <Group title="Tags you never write" taught={voice.neverTags.length > 0} summary={voice.neverTags.length ? voice.neverTags.map((t) => `${t.tag}${t.brand ? ` on ${t.brand}` : ""}`).join(", ") : "None"}>
        <Rows
          rows={voice.neverTags.map((t) => `${t.tag}${t.brand ? ` on ${t.brand}` : ""}`)}
          onRemove={(i) => save({ neverTags: voice.neverTags.filter((_, j) => j !== i) })}
          fields={[{ key: "tag", label: "Tag", placeholder: "Sale" }, { key: "brand", label: "on brand (blank for all)", placeholder: "", list: brands }]}
          pending={pending}
          onAdd={(r) => save({ neverTags: [...voice.neverTags, { tag: r.tag, brand: r.brand }] })}
        />
      </Group>
      {note && <p className="text-[13px] text-[var(--danger)]">{note}</p>}
    </div>
  );
}

function Group({ title, taught, summary, children }: { title: string; taught: boolean; summary: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-[12px] border border-[var(--line)] bg-white">
      <button type="button" className="flex w-full flex-wrap items-start justify-between gap-2 px-4 py-3 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-semibold">{title}</span>
          <span className={cx("block text-[13px]", taught ? "text-[var(--ink-2)]" : "text-[var(--ink-soft)]")}>{summary}</span>
        </span>
        <span className="text-[13px] font-semibold text-[var(--meta)]">{open ? "Close" : "Change"}</span>
      </button>
      {open && <div className="border-t border-[var(--line-soft)] bg-[var(--canvas)] px-4 py-3">{children}</div>}
    </section>
  );
}

function OneLine({ label, placeholder, initial, pending, onKeep }: { label: string; placeholder: string; initial: string; pending: boolean; onKeep: (v: string) => void }) {
  const [v, setV] = useState(initial);
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="block min-w-[260px] flex-1 text-sm"><span className="mb-1.5 block text-[13px] font-semibold text-[var(--ink-2)]">{label}</span><input className={INPUT} value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} /></label>
      <Button size="sm" variant="primary" disabled={pending} onClick={() => onKeep(v)}>Keep</Button>
    </div>
  );
}

function TwoLines({ a, b, pending, onKeep }: { a: { label: string; placeholder: string; initial: string }; b: { label: string; placeholder: string; initial: string }; pending: boolean; onKeep: (a: string, b: string) => void }) {
  const [va, setA] = useState(a.initial);
  const [vb, setB] = useState(b.initial);
  return (
    <div className="space-y-2">
      <label className="block text-sm"><span className="mb-1.5 block text-[13px] font-semibold text-[var(--ink-2)]">{a.label}</span><input className={INPUT} value={va} onChange={(e) => setA(e.target.value)} placeholder={a.placeholder} /></label>
      <label className="block text-sm"><span className="mb-1.5 block text-[13px] font-semibold text-[var(--ink-2)]">{b.label}</span><input className={INPUT} value={vb} onChange={(e) => setB(e.target.value)} placeholder={b.placeholder} /></label>
      <Button size="sm" variant="primary" disabled={pending} onClick={() => onKeep(va, vb)}>Keep</Button>
    </div>
  );
}

interface FieldDef { key: string; label: string; placeholder: string; list?: string[]; multiline?: boolean }

function Rows({ rows, onRemove, fields, pending, onAdd }: { rows: string[]; onRemove: (i: number) => void; fields: FieldDef[]; pending: boolean; onAdd: (r: Record<string, string>) => void }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const ready = fields.length > 0 && fields.slice(0, 2).every((f) => (draft[f.key] ?? "").trim());
  return (
    <div className="space-y-3">
      {rows.length > 0 && (
        <ul className="divide-y divide-[var(--line-soft)] rounded-[10px] border border-[var(--line)] bg-white">
          {rows.map((r, i) => (
            <li key={i} className="flex items-start justify-between gap-2 px-3 py-1.5 text-[13.5px]"><span className="min-w-0 flex-1">{r}</span><button type="button" className="text-[12.5px] font-semibold text-[var(--ink-soft)] hover:text-[var(--danger)]" disabled={pending} onClick={() => onRemove(i)}>Remove</button></li>
          ))}
        </ul>
      )}
      {fields.length > 0 && (
        <div className="grid gap-2 md:grid-cols-2">
          {fields.map((f) => (
            <label key={f.key} className={cx("block text-sm", f.multiline && "md:col-span-2")}>
              <span className="mb-1 block text-[12.5px] font-semibold text-[var(--ink-2)]">{f.label}</span>
              {f.multiline ? <textarea className={cx(INPUT, "min-h-[90px]")} value={draft[f.key] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))} placeholder={f.placeholder} /> : <input className={INPUT} list={f.list ? `voice-${f.key}-${f.label.length}` : undefined} value={draft[f.key] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))} placeholder={f.placeholder} />}
              {f.list && <datalist id={`voice-${f.key}-${f.label.length}`}>{f.list.map((x) => <option key={x} value={x} />)}</datalist>}
            </label>
          ))}
          <div className="md:col-span-2"><Button size="sm" variant="primary" disabled={pending || !ready} onClick={() => { onAdd(Object.fromEntries(fields.map((f) => [f.key, (draft[f.key] ?? "").trim()]))); setDraft({}); }}>Add</Button></div>
        </div>
      )}
    </div>
  );
}
