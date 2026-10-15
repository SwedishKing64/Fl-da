"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveHouseAction, skipSetupStepAction } from "@/app/(catalog)/actions";
import { Alert, Button, Card, Field, INPUT, cx } from "@/app/(catalog)/ui";
import { fromGrams, toGrams, TAG_RULE_FIELDS, type HouseConventions, type TagRuleInput } from "@/lib/catalog/house";

/** One choice among a few, each with a line saying what it means. */
function Choice<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: Array<{ key: T; title: string; text: string }> }) {
  return (
    <fieldset>
      <legend className="mb-2 text-[13.5px] font-semibold text-[var(--ink-2)]">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {options.map((o) => (
          <label key={o.key} className={cx("flex cursor-pointer gap-2.5 rounded-[12px] border p-3 transition", value === o.key ? "border-[var(--meta)] bg-[var(--meta-tint)] shadow-[var(--ring)]" : "border-[var(--line)] bg-white hover:border-[var(--meta-bright)]")}>
            <input type="radio" className="mt-1" checked={value === o.key} onChange={() => onChange(o.key)} />
            <span className="min-w-0">
              <span className="block text-[14px] font-semibold">{o.title}</span>
              <span className="block text-[12.5px] leading-snug text-[var(--ink-soft)]">{o.text}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * How the shop writes a listing: the things an export cannot show. The same form sits on
 * Settings; in setup it moves on once saved.
 */
/** The three naming choices applied to one made-up product, so they can be seen rather than imagined. */
export function previewTitle(naming: HouseConventions["naming"]): string {
  const name = naming.casing === "supplier" ? "M7 MANTRA 88 TI" : "M7 Mantra 88 Ti";
  const brand = naming.brandInTitle === "always" ? "Völkl " : "";
  const year = naming.season === "never" ? "" : " 2026";
  return `${brand}${name}${year}`;
}

export function HouseForm({ house: initial, tagRules: initialRules, kinds, next }: { house: HouseConventions; tagRules: TagRuleInput[]; kinds: string[]; next?: string }) {
  const [house, setHouse] = useState<HouseConventions>(initial);
  const [rules, setRules] = useState<TagRuleInput[]>(initialRules.length ? initialRules : []);
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();

  const set = <K extends keyof HouseConventions>(key: K, patch: Partial<HouseConventions[K]>) => setHouse((h) => ({ ...h, [key]: { ...(h[key] as object), ...patch } }));
  const unit = house.weights.unit;

  const save = () => start(async () => {
    setNote(null);
    const r = await saveHouseAction({ house, tagRules: rules });
    if (!r.ok) { setNote({ ok: false, text: r.error ?? "Something went wrong." }); return; }
    setNote({ ok: true, text: r.message ?? "Kept." });
    if (next) router.push(next);
    else router.refresh();
  });

  return (
    <div className="space-y-7">
      <section className="space-y-4">
        <h3 className="text-[15px] font-bold">Names</h3>
        <Choice<HouseConventions["naming"]["brandInTitle"]> label="The brand in the product title" value={house.naming.brandInTitle} onChange={(v) => set("naming", { brandInTitle: v })} options={[
          { key: "never", title: "Not in the title", text: "“Mantra 88”. The brand sits in the Vendor column and leads the SEO title." },
          { key: "always", title: "Leads the title", text: "“Völkl Mantra 88”. Many general stores write it this way." },
        ]} />
        <Choice<HouseConventions["naming"]["season"]> label="The model year" value={house.naming.season} onChange={(v) => set("naming", { season: v })} options={[
          { key: "seasonal", title: "On seasonal kinds", text: "Products that carry a year tag get it after the name: “Mantra 88 2026”." },
          { key: "always", title: "On everything", text: "Every title ends with its year." },
          { key: "never", title: "Never", text: "Names carry no year." },
        ]} />
        <Choice<HouseConventions["naming"]["casing"]> label="Capitals" value={house.naming.casing} onChange={(v) => set("naming", { casing: v })} options={[
          { key: "shop", title: "Mixed case", text: "A supplier’s “M7 MANTRA 88 TI” becomes “M7 Mantra 88 Ti”." },
          { key: "supplier", title: "As the supplier writes it", text: "Names go out exactly as they came in." },
        ]} />
        <p className="rounded-[10px] bg-[var(--meta-tint)] px-3 py-2 text-[13.5px]">With these choices a title comes out as <strong>{previewTitle(house.naming)}</strong>.</p>
        <Field label="A typical title of yours" hint="One real product name, written the way you would list it. The reader copies its shape.">
          <input className={INPUT} value={house.naming.example} onChange={(e) => set("naming", { example: e.target.value })} placeholder="Mantra 88 2026" />
        </Field>
      </section>

      <section className="space-y-4">
        <h3 className="text-[15px] font-bold">SKUs and barcodes</h3>
        <Choice<HouseConventions["identifiers"]["sku"]> label="What goes in the SKU column" value={house.identifiers.sku} onChange={(v) => set("identifiers", { sku: v })} options={[
          { key: "supplier", title: "The supplier’s code", text: "The article or style number from the paperwork, as most shops do." },
          { key: "barcode", title: "The barcode", text: "The EAN or UPC doubles as the SKU; the supplier’s code is used when there is none." },
          { key: "none", title: "We don’t use SKUs", text: "The column goes out empty and nothing is flagged for it." },
        ]} />
        <Choice<HouseConventions["identifiers"]["barcode"]> label="Barcodes" value={house.identifiers.barcode} onChange={(v) => set("identifiers", { barcode: v })} options={[
          { key: "keep", title: "When the paperwork has one", text: "Written when the invoice or spec sheet gives it; otherwise left empty." },
          { key: "required", title: "On every variant", text: "A variant without one is flagged on the review grid so it can be filled in." },
          { key: "none", title: "We don’t use barcodes", text: "The column goes out empty." },
        ]} />
      </section>

      <section className="space-y-4">
        <h3 className="text-[15px] font-bold">Shipping weight</h3>
        <Choice<HouseConventions["weights"]["mode"]> label="How weight is written" value={house.weights.mode} onChange={(v) => set("weights", { mode: v })} options={[
          { key: "none", title: "Not written", text: "Weight is left at zero; shipping is worked out another way." },
          { key: "byKind", title: "A weight per kind", text: "A band per kind of product: every ski 2 kg, every snowboard 1 kg." },
          { key: "fixed", title: "The same on everything", text: "One weight on every variant." },
        ]} />
        {house.weights.mode !== "none" && (
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Unit">
              <select className={INPUT} value={unit} onChange={(e) => set("weights", { unit: e.target.value as "g" | "kg" })}><option value="g">grams</option><option value="kg">kilograms</option></select>
            </Field>
            {house.weights.mode === "fixed" && (
              <Field label={`Weight (${unit})`}>
                <input type="number" min={0} step={unit === "kg" ? 0.01 : 1} className={INPUT} value={fromGrams(house.weights.fixedGrams, unit)} onChange={(e) => set("weights", { fixedGrams: toGrams(Number(e.target.value) || 0, unit) })} />
              </Field>
            )}
          </div>
        )}
        {house.weights.mode === "byKind" && (
          <div className="rounded-[12px] border border-[var(--line)] bg-white">
            <table className="w-full text-[14px]">
              <thead className="text-left text-[12px] text-[var(--ink-soft)]"><tr><th className="px-3 py-2 font-semibold">Kind of product</th><th className="px-3 py-2 font-semibold">Weight ({unit})</th><th /></tr></thead>
              <tbody>
                {house.weights.byKind.map((k, i) => (
                  <tr key={i} className="border-t border-[var(--line-soft)]">
                    <td className="px-3 py-1.5"><input className={INPUT} list="house-kinds" value={k.type} onChange={(e) => set("weights", { byKind: house.weights.byKind.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)) })} placeholder="Skis" /></td>
                    <td className="px-3 py-1.5"><input type="number" min={0} step={unit === "kg" ? 0.01 : 1} className={INPUT} value={fromGrams(k.grams, unit)} onChange={(e) => set("weights", { byKind: house.weights.byKind.map((x, j) => (j === i ? { ...x, grams: toGrams(Number(e.target.value) || 0, unit) } : x)) })} /></td>
                    <td className="px-2 py-1.5 text-right"><button type="button" className="text-[13px] text-[var(--ink-soft)] hover:text-[var(--ink)]" onClick={() => set("weights", { byKind: house.weights.byKind.filter((_, j) => j !== i) })}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-[var(--line-soft)] px-3 py-2">
              <Button size="sm" variant="ghost" onClick={() => set("weights", { byKind: [...house.weights.byKind, { type: "", grams: 0 }] })}>+ Add a kind</Button>
            </div>
            <datalist id="house-kinds">{kinds.map((k) => <option key={k} value={k} />)}</datalist>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-[15px] font-bold">Tags that go with certain products</h3>
        <p className="text-[13.5px] text-[var(--ink-soft)]">Your export already teaches which menu tags go with each kind. Add the rules it cannot see: a tag every product of a brand gets, a tag for anything with a word in its name.</p>
        <div className="space-y-2">
          {rules.map((r, i) => (
            <div key={i} className="grid items-center gap-2 rounded-[12px] border border-[var(--line)] bg-white p-3 sm:grid-cols-[auto_1fr_1fr_auto_1fr_auto]">
              <span className="text-[13px] text-[var(--ink-soft)]">When</span>
              <select className={INPUT} value={r.field} onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, field: e.target.value as TagRuleInput["field"] } : x)))}>
                {TAG_RULE_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
              <input className={INPUT} value={r.pattern} placeholder="contains… e.g. Burton" onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, pattern: e.target.value } : x)))} />
              <span className="text-[13px] text-[var(--ink-soft)]">add tags</span>
              <input className={INPUT} value={r.addTags} placeholder="snowboard, burton" onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, addTags: e.target.value } : x)))} />
              <button type="button" className="text-[13px] text-[var(--ink-soft)] hover:text-[var(--ink)]" onClick={() => setRules(rules.filter((_, j) => j !== i))}>Remove</button>
            </div>
          ))}
        </div>
        <Button size="sm" variant="ghost" onClick={() => setRules([...rules, { field: "any", pattern: "", addTags: "" }])}>+ Add a rule</Button>
      </section>

      <section className="space-y-4">
        <h3 className="text-[15px] font-bold">Descriptions</h3>
        <p className="text-[13.5px] text-[var(--ink-soft)]">A brand page or a spec sheet gives the manufacturer&rsquo;s words and a list of details. Say how a description should be laid out and written here, and every description Flöda takes from a page or writes itself comes out that way. It never adds a fact that was not given.</p>
        <Field label="How a description should read" hint="What comes first, how long, what to leave out, what never to say.">
          <textarea className={cx(INPUT, "min-h-[96px]")} value={house.descriptions.format} onChange={(e) => set("descriptions", { format: e.target.value })} placeholder={"Two short paragraphs: who it is for, then what makes it different. Then the details as a list. Plain English, no exclamation marks, never mention the price."} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Heading over the details list" hint="Leave empty for a list with no heading.">
            <input className={INPUT} value={house.descriptions.specsHeading} onChange={(e) => set("descriptions", { specsHeading: e.target.value })} placeholder="Tech Specs" />
          </Field>
        </div>
        <Field label="A description of yours, as the shape to match" hint="Paste one real description from your shop. Optional, and the strongest signal of all.">
          <textarea className={cx(INPUT, "min-h-[120px] font-mono text-[12.5px]")} value={house.descriptions.example} onChange={(e) => set("descriptions", { example: e.target.value })} />
        </Field>
      </section>

      <section className="space-y-2">
        <h3 className="text-[15px] font-bold">Anything else</h3>
        <Field label="In your own words" hint="Standing instructions the reader follows on every product: “Lead descriptions with who it suits”, “Never mention the RRP”, “Call the flex number ‘stiffness’”.">
          <textarea className={cx(INPUT, "min-h-[96px]")} value={house.notes} onChange={(e) => setHouse({ ...house, notes: e.target.value })} />
        </Field>
      </section>

      {note && <Alert tone={note.ok ? "success" : "danger"}>{note.text}</Alert>}
      <Button variant="primary" disabled={pending} onClick={save}>{pending ? "Keeping…" : next ? "Save and continue" : "Save"}</Button>
    </div>
  );
}

export function HouseStep({ house, tagRules, kinds }: { house: HouseConventions; tagRules: TagRuleInput[]; kinds: string[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Card title="How you list">
      <p className="mb-5 text-[14px] text-[var(--ink-soft)]">
        Your export shows Flöda what you sell and how it is filed. It cannot show the choices a person makes on every listing — whether the brand goes in the title, what the SKU is, what you write for weight. Say them once here, and every listing Flöda builds follows them. All of it can be changed later in Settings.
      </p>
      <HouseForm house={house} tagRules={tagRules} kinds={kinds} next="/setup?step=ai" />
      <div className="mt-5 flex items-center justify-between border-t border-[var(--line-soft)] pt-4 text-[13px] text-[var(--ink-soft)]">
        <span>Not sure yet? The plainest reading applies until you say otherwise.</span>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => { await skipSetupStepAction("house"); router.push("/setup?step=ai"); })}>Skip for now</Button>
      </div>
    </Card>
  );
}
