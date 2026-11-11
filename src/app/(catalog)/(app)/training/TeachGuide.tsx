"use client";

import { useSyncExternalStore } from "react";
import { Button, cx } from "@/app/(catalog)/ui";

export interface GuideState {
  exportTaught: boolean;
  websiteRead: boolean;
  rulesTouched: boolean;
  supplierTaught: boolean;
  /** Whether reading goes through Snaben's plan (true) or the shop's own key (false): changes one line. */
  readingIncluded: boolean;
}

const KEY = "floda.teach-guide.hidden";
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); window.addEventListener("storage", fn); return () => { listeners.delete(fn); window.removeEventListener("storage", fn); }; };

/**
 * How to teach Snaben, in four steps, for a shop opening the page for the first time: what to do,
 * why, and where on this page. Each step is ticked once it is done, and the whole guide folds
 * away once all four are, or when the person closes it. Nothing here reads the model, and the
 * reading that the steps do cause (a supplier's example, the shape of the descriptions) is not
 * counted against the shop's plan.
 */
export function TeachGuide({ state }: { state: GuideState }) {
  // Hidden on the server and until the browser says otherwise, so the page never flashes it.
  const hidden = useSyncExternalStore(subscribe, () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } }, () => true);
  const steps = [
    { done: state.exportTaught, title: "Drop in your catalogue export", how: "In Shopify, Products → Export → CSV. Drop the file on the first tile. Snaben learns your product types, tags, titles, variants, margins and the shape of your descriptions from what you already sell.", href: "#export" },
    { done: state.websiteRead, title: "Paste your website address", how: "The second tile reads your site's categories. Tick the ones that are product types; every new listing is filed under one of them and nothing is invented.", href: "#website" },
    { done: state.rulesTouched, title: "Read what Snaben believes, and correct it", how: "Open each area below. Every sentence is a belief: Change fixes it in place, Add a rule adds what no export could show. Start with Titles and Pricing; they decide most of what a listing looks like.", href: "#house" },
    { done: state.supplierTaught, title: "Drop in one invoice from each supplier", how: "The third tile reads it now and shows what it took each column for. Fix anything wrong once and that supplier's layout is remembered.", href: "#suppliers" },
  ];
  const done = steps.filter((s) => s.done).length;
  if (hidden || done === steps.length) return null;
  const hide = () => { try { localStorage.setItem(KEY, "1"); } catch { /* storage off */ } for (const l of listeners) l(); };
  return (
    <section className="mb-6 rounded-[16px] border border-[var(--meta-tint-2)] bg-[var(--meta-tint)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-bold tracking-[-0.01em]">How to teach Snaben</h2>
          <p className="mt-0.5 text-[13.5px] text-[var(--ink-2)]">Four things, about twenty minutes. After them Snaben lists the way you do; everything it learns stays on this computer.</p>
        </div>
        <div className="flex items-center gap-3 text-[12.5px] text-[var(--ink-soft)]">
          <span>{done} of {steps.length} done</span>
          <Button size="sm" variant="ghost" onClick={hide}>Hide this</Button>
        </div>
      </div>
      <ol className="mt-4 grid gap-3 md:grid-cols-2">
        {steps.map((s, i) => (
          <li key={s.title} className={cx("rounded-[12px] border bg-white p-4", s.done ? "border-[var(--line-soft)] opacity-70" : "border-[var(--line)]")}>
            <div className="flex items-start gap-3">
              <span className={cx("mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-bold", s.done ? "bg-[var(--promoter)] text-white" : "bg-[var(--meta)] text-white")} aria-hidden>{s.done ? "✓" : i + 1}</span>
              <div className="min-w-0">
                <div className="text-[14.5px] font-semibold">{s.title}</div>
                <p className="mt-1 text-[13px] leading-relaxed text-[var(--ink-soft)]">{s.how}</p>
                {!s.done && <a href={s.href} className="mt-2 inline-block text-[13px] font-semibold text-[var(--meta)]">Do it now →</a>}
              </div>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[12.5px] text-[var(--ink-soft)]">
        {state.readingIncluded
          ? "Reading done while teaching Snaben, here and in setup, is free: it is not counted against your plan's reading allowance."
          : "Reading done while teaching Snaben is small: a supplier's example and a few descriptions, on the lightest model, billed to your own key."}
      </p>
    </section>
  );
}
