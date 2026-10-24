"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { learnTemplatesAction, learnVocabularyAction, rememberListingsAction, skipSetupStepAction } from "@/app/(catalog)/actions";
import { Alert, Button, Card } from "@/app/(catalog)/ui";
import { describeLearned, kindsFromListings, learnVocabulary } from "@/lib/catalog/learn";
import { listingsFromCsv } from "@/lib/catalog/shop-memory";
import { analyseShopifyCsvGroups } from "@/lib/catalog/templates";
import { parseCsv } from "@/lib/catalog/csv";
import type { LearnedVocabulary } from "@/lib/catalog/taxonomy";
import type { KindRule } from "@/lib/catalog/house";
import { KindsEditor } from "./KindsEditor";

/** A Shopify product export, as against a supplier's file: it has the importer's own columns. */
function isShopifyExport(header: string[]): boolean {
  const h = new Set(header.map((c) => c.trim()));
  return h.has("Handle") && h.has("Title") && (h.has("Variant Price") || h.has("Option1 Name"));
}

type Outcome = { file: string; lines: string[]; templates: number; remembered: number; warnings: string[]; kinds: KindRule[] };

const fmtSize = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

/**
 * Teach Flöda the shop from its own Shopify export, one file at a time: a shop exports a
 * category at a time, and each file is read here in the browser (they can be tens of megabytes)
 * with three small things going to the server: the vocabulary, the templates per brand and kind,
 * and the listings in chunks, each joined to what earlier files taught. Then the kinds the file
 * showed are laid out for the shop to say what each is called, its tags and how its titles read.
 */
export function LearnPanel({ learned: before, kinds: saved = [], next, onDone }: { learned: LearnedVocabulary | null; kinds?: KindRule[]; next?: string; onDone?: () => void }) {
  const [pending, start] = useTransition();
  const [chosen, setChosen] = useState<{ file: File; problem?: string } | null>(null);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const router = useRouter();

  const choose = async (file: File) => {
    setError(""); setOutcome(null);
    const header = parseCsv(await file.slice(0, 20000).text())[0] ?? [];
    setChosen(isShopifyExport(header) ? { file } : { file, problem: "Not a Shopify product export: it needs Handle, Title and Variant Price columns." });
  };

  const teach = () => {
    const file = chosen?.file;
    if (!file || chosen?.problem) return;
    setError(""); setOutcome(null);
    start(async () => {
      try {
        setProgress("Reading the file…");
        const text = await file.text();
        const listings = listingsFromCsv(text);
        if (listings.length === 0) { setError("No products were found in the file."); setProgress(""); return; }
        const found = analyseShopifyCsvGroups(text);
        setProgress(`Working out how ${listings.length.toLocaleString("en-AU")} products are filed and tagged…`);
        const learned = learnVocabulary(listings, file.name);

        setProgress("Keeping what was learned…");
        const v = await learnVocabularyAction(learned);
        if (!v.ok) throw new Error(v.error);
        const t = await learnTemplatesAction({ file: file.name, groups: found.groups });
        if (!t.ok) throw new Error(t.error);

        let remembered = 0;
        for (let at = 0; at < listings.length; at += 400) {
          setProgress(`Remembering your listings… ${Math.min(at + 400, listings.length).toLocaleString("en-AU")} of ${listings.length.toLocaleString("en-AU")}`);
          const r = await rememberListingsAction(listings.slice(at, at + 400));
          if (!r.ok) throw new Error(r.error);
          remembered += r.data!.remembered;
        }
        // The kinds this file showed, pre-filled from its rows and from what the shop said before.
        const known = new Map(saved.map((k) => [k.type.toLowerCase(), k]));
        const kinds: KindRule[] = kindsFromListings(listings).map((k) => {
          const was = known.get(k.type.toLowerCase());
          return { type: k.type, calledAs: was?.calledAs ?? k.type, tags: was?.tags ?? k.commonTags, variesTags: k.variesTags, titleFormat: was?.titleFormat ?? k.exampleTitle, count: k.count };
        });
        setOutcome({ file: file.name, lines: describeLearned(learned), templates: t.data!.templates, remembered, warnings: found.warnings, kinds });
        setChosen(null);
        setProgress("");
        onDone?.();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setProgress("");
      }
    });
  };

  return (
    <div className="space-y-4">
      {before && !outcome && (
        <Alert tone="info">
          Taught so far from <strong>{before.file || "an export"}</strong>: {before.products.toLocaleString("en-AU")} products, {before.types.length} kinds. Another export adds to it; the same file again replaces its own earlier reading.
        </Alert>
      )}
      <label className={`block cursor-pointer rounded-[12px] border-2 border-dashed p-6 text-center ${pending ? "border-[var(--line)] bg-neutral-50" : "border-[var(--meta)] bg-[var(--meta-tint)] hover:bg-[var(--meta-tint-2)]"}`}>
        <input type="file" accept=".csv,text/csv" className="sr-only" disabled={pending} onChange={(e) => { const file = e.target.files?.[0]; if (file) void choose(file); e.target.value = ""; }} />
        <span className="block text-[15px] font-semibold">{pending ? progress || "Working…" : outcome || before ? "Choose another export (one product group at a time)" : "Choose a Shopify product export (CSV)"}</span>
        {!pending && <span className="mt-1 block text-[13px] text-[var(--ink-soft)]">In Shopify: Products → filter to one product group → Export → CSV for Excel, Numbers or other. One file at a time; each adds to what the last one taught. The whole file is read here on your computer; only what was learned is kept.</span>}
      </label>
      {chosen && !pending && (
        <div className="flex items-center justify-between gap-3 rounded-[12px] border border-[var(--line)] bg-white px-4 py-3 text-[14px]">
          <span className="min-w-0">
            <span className="block truncate font-medium">{chosen.file.name}</span>
            <span className={`block text-[12px] ${chosen.problem ? "text-[var(--danger)]" : "text-[var(--ink-soft)]"}`}>{chosen.problem ?? fmtSize(chosen.file.size)}</span>
          </span>
          <span className="flex shrink-0 items-center gap-3">
            <button type="button" className="text-[13px] text-[var(--ink-soft)] hover:text-[var(--ink)]" onClick={() => setChosen(null)}>Remove</button>
            <Button size="sm" disabled={Boolean(chosen.problem)} onClick={teach}>Read it</Button>
          </span>
        </div>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
      {outcome && (
        <>
          <Alert tone="success">
            <div className="font-semibold">Read {outcome.file}.</div>
            <ul className="mt-1 list-disc pl-5 text-[14px]">
              {outcome.lines.map((l) => <li key={l}>{l}</li>)}
              <li>{outcome.templates} convention{outcome.templates === 1 ? "" : "s"} per brand and product type, kept as templates.</li>
              <li>{outcome.remembered.toLocaleString("en-AU")} listings remembered, so next season&rsquo;s product of the same model keeps its shelves, name and price.</li>
            </ul>
            {outcome.warnings.length > 0 && <div className="mt-2 text-[13px] text-[var(--ink-soft)]">{outcome.warnings.join(" ")}</div>}
          </Alert>
          <KindsEditor key={outcome.file} kinds={outcome.kinds} />
          {next && <div><Link href={next} className="inline-flex items-center gap-1.5 rounded-[10px] bg-[var(--meta)] px-4 py-2.5 text-[15px] font-semibold text-white">Continue →</Link></div>}
        </>
      )}
      {!outcome && saved.length > 0 && (
        <KindsEditor kinds={saved} title="The product types you have told Flöda about" blurb="From the exports read so far. Change what is wrong; the next export's kinds join this list." />
      )}
    </div>
  );
}

export function LearnStep({ learned, kinds }: { learned: LearnedVocabulary | null; kinds: KindRule[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Card title="Teach Flöda your catalogue">
      <p className="mb-4 text-[14px] text-[var(--ink-soft)]">
        Flöda learns how your shop files and tags products from the products you already sell, one export at a time: which product types you have, which tags go with each, how each shelf tag is spelled, and the conventions each brand follows. After each file, say what each kind is called, the tags every one gets, and how its titles read. New listings are then built to match.
      </p>
      <LearnPanel learned={learned} kinds={kinds} next="/setup?step=house" />
      <div className="mt-5 flex items-center justify-between border-t border-[var(--line-soft)] pt-4 text-[13px] text-[var(--ink-soft)]">
        <span>No export to hand? Flöda works without one; it just has less to go on.</span>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => { await skipSetupStepAction("learn"); router.push("/setup?step=house"); })}>Skip for now</Button>
      </div>
    </Card>
  );
}
