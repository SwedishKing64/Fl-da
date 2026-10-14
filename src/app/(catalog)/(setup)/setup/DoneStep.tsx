"use client";

import { useTransition } from "react";
import Link from "next/link";
import { finishSetupAction } from "@/app/(catalog)/actions";
import { Button, Card } from "@/app/(catalog)/ui";

/** The end of setup: what is in place, what was put off, and the door into the app. */
export function DoneStep({ shopName, learned, aiReady, skipped }: { shopName: string; learned: boolean; aiReady: boolean; skipped: { learn?: boolean; ai?: boolean } }) {
  const [pending, start] = useTransition();
  const rows: Array<{ ok: boolean; text: string; href?: string }> = [
    { ok: true, text: `${shopName || "The shop"} is set up.` },
    { ok: learned, text: learned ? "Flöda has learned your catalogue." : "Your catalogue has not been taught yet. Until it is, Flöda has only your supplier's paperwork to go on.", href: learned ? undefined : "/setup?step=learn" },
    { ok: aiReady, text: aiReady ? "PDFs, photos and brand pages can be read." : "No API key yet: spreadsheets work, PDFs and photos wait.", href: aiReady ? undefined : "/setup?step=ai" },
  ];
  void skipped;
  return (
    <Card title="Ready">
      <ul className="mb-5 space-y-2 text-[15px]">
        {rows.map((r) => (
          <li key={r.text} className="flex items-start gap-2">
            <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${r.ok ? "bg-[var(--promoter)] text-white" : "bg-[var(--passive-tint)] text-[var(--passive)]"}`} aria-hidden>{r.ok ? "✓" : "!"}</span>
            <span>{r.text}{r.href && <> <Link href={r.href} className="font-semibold text-[var(--meta)]">Do it now</Link></>}</span>
          </li>
        ))}
      </ul>
      <div className="rounded-[12px] bg-[var(--canvas)] p-4 text-[14px]">
        <div className="font-semibold">How to work in Flöda</div>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-[var(--ink-soft)]">
          <li><strong className="text-[var(--ink)]">New products</strong>: start an import, drop in the supplier&rsquo;s invoice or order form (and any spec sheet or photos), say anything in words, build, check the grid, download the Shopify CSV.</li>
          <li><strong className="text-[var(--ink)]">Prices and stock</strong>: load your Shopify export, say the change in plain words or add a delivery, check every changed cell, download the updated file.</li>
          <li><strong className="text-[var(--ink)]">Tidy a document</strong>: a photo of scribbled-on paperwork becomes a table you can check and save as a CSV the other two take.</li>
          <li><strong className="text-[var(--ink)]">Settings</strong>: staff accounts, the shop, the key, and teaching Flöda a newer export.</li>
        </ol>
      </div>
      <div className="mt-5">
        <Button variant="primary" icon="🏠" disabled={pending} onClick={() => start(() => finishSetupAction())}>{pending ? "Opening…" : "Go to Flöda"}</Button>
      </div>
    </Card>
  );
}
