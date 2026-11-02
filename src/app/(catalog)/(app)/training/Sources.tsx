"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cx } from "@/app/(catalog)/ui";

export interface SourceTile {
  id: "export" | "website" | "suppliers";
  title: string;
  /** What it teaches, in a line. */
  teaches: string;
  /** Where it stands: "2,140 products and 31 types from packs.csv", or "Nothing yet". */
  status: string;
  taught: boolean;
  panel: ReactNode;
}

/**
 * The three things a shop teaches Flöda from: its catalogue export, its website and a supplier's
 * paperwork. Three tiles, each saying what it has taught so far; opening one shows the panel that
 * reads more. Only one is open at a time, so the page stays a page and not a wall of forms.
 */
export function Sources({ tiles }: { tiles: SourceTile[] }) {
  const [open, setOpen] = useState<SourceTile["id"] | null>(() => (tiles.some((t) => t.taught) ? null : "export"));
  // A link into one tile — the home page's "Teach it", a belief's "Read another export" — opens it.
  useEffect(() => {
    const follow = () => {
      const id = window.location.hash.replace("#", "");
      const tile = tiles.find((t) => t.id === id || (id === "store" && t.id === "export"));
      if (tile) setOpen(tile.id);
    };
    follow();
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, [tiles]);
  const current = tiles.find((t) => t.id === open) ?? null;
  return (
    <div className="mb-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <button
            key={t.id}
            id={t.id}
            type="button"
            onClick={() => setOpen((o) => (o === t.id ? null : t.id))}
            aria-expanded={open === t.id}
            className={cx("scroll-mt-6 rounded-[16px] border px-4 py-3.5 text-left transition", open === t.id ? "border-[var(--meta)] bg-[var(--meta-tint)]" : "border-[var(--line)] bg-white hover:border-[var(--meta-bright)]")}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-[15px] font-semibold">{t.title}</span>
              <span className={cx("h-2.5 w-2.5 shrink-0 rounded-full", t.taught ? "bg-[var(--promoter)]" : "bg-[var(--line)]")} aria-label={t.taught ? "taught" : "not yet"} />
            </span>
            <span className="mt-0.5 block text-[12.5px] text-[var(--ink-soft)]">{t.teaches}</span>
            <span className="mt-2 block text-[13px] font-medium text-[var(--ink-2)]">{t.status}</span>
            <span className="mt-1 block text-[12.5px] font-semibold text-[var(--meta)]">{open === t.id ? "Close" : t.taught ? "Teach it more" : "Teach it"} {open === t.id ? "▴" : "▾"}</span>
          </button>
        ))}
      </div>
      {current && (
        <div className="mt-3 rounded-[16px] border border-[var(--line)] bg-white p-5">
          {current.panel}
        </div>
      )}
    </div>
  );
}
