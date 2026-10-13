"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Go anywhere, from anywhere, with ⌘K.
 *
 * This app is six pages and a growing pile of batches, and every route to a batch went through the
 * list page: back out, find the row, click in. That is three navigations and a read, several times
 * an hour, for something a person already knows the name of.
 *
 * So the batches come down with the page — there are never many, and they are already being read
 * for the sidebar's sake — and the whole thing is matched in the browser. No request per keystroke,
 * which means no spinner and no debounce to get wrong.
 */
export interface PaletteItem {
  id: string;
  label: string;
  hint?: string;
  group: string;
  href: string;
}

/** Subsequence match, so "bgog" finds "Burton goggles" without anyone learning a syntax. */
function score(needle: string, hay: string): number {
  if (!needle) return 1;
  const n = needle.toLowerCase();
  const h = hay.toLowerCase();
  const direct = h.indexOf(n);
  if (direct === 0) return 1000;
  if (direct > 0) return 800 - direct;
  let i = 0;
  let gaps = 0;
  let last = -1;
  for (const ch of n) {
    const at = h.indexOf(ch, i);
    if (at === -1) return 0;
    if (last >= 0) gaps += at - last - 1;
    last = at;
    i = at + 1;
  }
  return Math.max(1, 400 - gaps);
}

export function CommandPalette({ items }: { items: PaletteItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Whether a row starts a new group is worked out here, with the ranking, rather than by keeping
  // a running variable while rendering — that reads the same and is a different value on a re-render.
  const hits = useMemo(() => {
    const ranked = items
      .map((it) => ({ it, s: Math.max(score(q, it.label), score(q, it.hint ?? "") * 0.6) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 40)
      .map((r) => r.it);
    return ranked.map((it, i) => ({ it, head: i === 0 || ranked[i - 1].group !== it.group ? it.group : null }));
  }, [items, q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        // Cleared here rather than in an effect on `open`: the reset belongs to the event that
        // opens it, and doing it in an effect makes React render twice to reach the same place.
        setQ("");
        setCursor(0);
        setOpen((v) => !v);
        return;
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Keep the highlighted row in view when it is driven from the keyboard rather than the mouse.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(".palette-item.on")?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (!open) return null;

  const go = (item?: PaletteItem) => {
    if (!item) return;
    setOpen(false);
    router.push(item.href);
  };
  return (
    <div className="palette-back" role="dialog" aria-modal="true" aria-label="Go to" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="palette">
        <input
          autoFocus
          value={q}
          placeholder="Go to a page, or a batch by name…"
          aria-label="Search pages and batches"
          onChange={(e) => { setQ(e.target.value); setCursor(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, hits.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
            if (e.key === "Enter") { e.preventDefault(); go(hits[cursor]?.it); }
          }}
        />
        <div className="palette-list" ref={listRef}>
          {hits.length === 0 && <div className="px-3 py-6 text-center text-sm text-[var(--ink-soft)]">Nothing matches that.</div>}
          {hits.map(({ it, head }, i) => {
            return (
              <div key={it.id}>
                {head && <div className="palette-group">{head}</div>}
                <button
                  type="button"
                  className={`palette-item${i === cursor ? " on" : ""}`}
                  onMouseMove={() => setCursor(i)}
                  onClick={() => go(it)}
                >
                  <span>{it.label}</span>
                  {it.hint && <span className="hint">{it.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-3 border-t border-[var(--line-soft)] px-4 py-2 text-[11px] text-[var(--ink-soft)]">
          <span><kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd> move</span>
          <span><kbd className="kbd">↵</kbd> open</span>
          <span><kbd className="kbd">esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
