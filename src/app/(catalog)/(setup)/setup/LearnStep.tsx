"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { learnTemplatesAction, learnVocabularyAction, rememberListingsAction, skipSetupStepAction } from "@/app/(catalog)/actions";
import { Alert, Button, Card } from "@/app/(catalog)/ui";
import { describeLearned, learnVocabulary } from "@/lib/catalog/learn";
import { listingsFromCsv } from "@/lib/catalog/shop-memory";
import { analyseShopifyCsvGroups } from "@/lib/catalog/templates";
import { parseCsv } from "@/lib/catalog/csv";
import type { LearnedVocabulary } from "@/lib/catalog/taxonomy";

/** A Shopify product export, as against a supplier's file: it has the importer's own columns. */
function isShopifyExport(header: string[]): boolean {
  const h = new Set(header.map((c) => c.trim()));
  return h.has("Handle") && h.has("Title") && (h.has("Variant Price") || h.has("Option1 Name"));
}

type Outcome = { learned: LearnedVocabulary; lines: string[]; templates: number; remembered: number; warnings: string[] };

/**
 * Teach Flöda the shop from its own Shopify export. The file is read here in the browser — it can
 * be tens of megabytes — and three small things go to the server: the vocabulary, the templates
 * per brand and kind, and the listings in chunks.
 */
export function LearnPanel({ learned: before, next, onDone }: { learned: LearnedVocabulary | null; next?: string; onDone?: () => void }) {
  const [pending, start] = useTransition();
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const router = useRouter();

  const teach = (file: File) => {
    setError(""); setOutcome(null);
    start(async () => {
      try {
        setProgress("Reading the file…");
        const text = await file.text();
        const header = parseCsv(text.slice(0, 20000))[0] ?? [];
        if (!isShopifyExport(header)) {
          setError("That is not a Shopify product export: it needs Handle, Title and Variant Price columns. In Shopify, Products → Export → All products, as a CSV.");
          setProgress("");
          return;
        }
        const listings = listingsFromCsv(text);
        if (listings.length === 0) { setError("No products were found in the file."); setProgress(""); return; }
        setProgress(`Working out how ${listings.length.toLocaleString("en-AU")} products are filed and tagged…`);
        const learned = learnVocabulary(listings, file.name);
        const { groups, warnings } = analyseShopifyCsvGroups(text);

        setProgress("Keeping what was learned…");
        const v = await learnVocabularyAction(learned);
        if (!v.ok) throw new Error(v.error);
        const t = await learnTemplatesAction({ file: file.name, groups });
        if (!t.ok) throw new Error(t.error);

        let remembered = 0;
        for (let at = 0; at < listings.length; at += 400) {
          setProgress(`Remembering your listings… ${Math.min(at + 400, listings.length).toLocaleString("en-AU")} of ${listings.length.toLocaleString("en-AU")}`);
          const r = await rememberListingsAction(listings.slice(at, at + 400));
          if (!r.ok) throw new Error(r.error);
          remembered += r.data!.remembered;
        }
        setOutcome({ learned, lines: describeLearned(learned), templates: t.data!.templates, remembered, warnings });
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
          Last taught from <strong>{before.file || "an export"}</strong>: {before.products.toLocaleString("en-AU")} products, {before.types.length} kinds. A newer export replaces it.
        </Alert>
      )}
      <label className={`block cursor-pointer rounded-[12px] border-2 border-dashed p-6 text-center ${pending ? "border-[var(--line)] bg-neutral-50" : "border-[var(--meta)] bg-[var(--meta-tint)] hover:bg-[var(--meta-tint-2)]"}`}>
        <input type="file" accept=".csv,text/csv" className="sr-only" disabled={pending} onChange={(e) => { const f = e.target.files?.[0]; if (f) teach(f); e.target.value = ""; }} />
        <span className="block text-[15px] font-semibold">{pending ? progress || "Working…" : "Choose your Shopify product export (CSV)"}</span>
        {!pending && <span className="mt-1 block text-[13px] text-[var(--ink-soft)]">In Shopify: Products → Export → All products → CSV for Excel, Numbers or other. The whole file is read here on your computer; only what was learned is kept.</span>}
      </label>
      {error && <Alert tone="danger">{error}</Alert>}
      {outcome && (
        <Alert tone="success">
          <div className="font-semibold">Learned.</div>
          <ul className="mt-1 list-disc pl-5 text-[14px]">
            {outcome.lines.map((l) => <li key={l}>{l}</li>)}
            <li>{outcome.templates} convention{outcome.templates === 1 ? "" : "s"} per brand and kind of product, kept as templates.</li>
            <li>{outcome.remembered.toLocaleString("en-AU")} listings remembered, so next season&rsquo;s product of the same model keeps its shelves, name and price.</li>
          </ul>
          {outcome.warnings.length > 0 && <div className="mt-2 text-[13px] text-[var(--ink-soft)]">{outcome.warnings.join(" ")}</div>}
          {next && <div className="mt-3"><Link href={next} className="inline-flex items-center gap-1.5 rounded-[10px] bg-[var(--meta)] px-4 py-2.5 text-[15px] font-semibold text-white">Continue →</Link></div>}
        </Alert>
      )}
    </div>
  );
}

export function LearnStep({ learned }: { learned: LearnedVocabulary | null }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Card title="Teach Flöda your catalogue">
      <p className="mb-4 text-[14px] text-[var(--ink-soft)]">
        Flöda learns how your shop files and tags products from the products you already sell: which kinds of product you have, which menu tags go with each, how each shelf tag is spelled, and the conventions each brand follows. New listings are then built to match. You can do this again whenever your catalogue changes.
      </p>
      <LearnPanel learned={learned} next="/setup?step=ai" />
      <div className="mt-5 flex items-center justify-between border-t border-[var(--line-soft)] pt-4 text-[13px] text-[var(--ink-soft)]">
        <span>No export to hand? Flöda works without one; it just has less to go on.</span>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => { await skipSetupStepAction("learn"); router.push("/setup?step=ai"); })}>Skip for now</Button>
      </div>
    </Card>
  );
}
