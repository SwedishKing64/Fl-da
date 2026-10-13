"use client";

import { useMemo, useState } from "react";
import { diffCsv, type RowDiff } from "@/lib/catalog/diff";
import { Button, cx } from "@/app/(catalog)/ui";

/**
 * The file that will be imported, with every cell that moved marked.
 *
 * The rest of this page describes changes before they run — "20% off these 96 products" — and that
 * is a description of an intention. This is the file itself, which is the thing somebody actually
 * wants to see before pressing import on a live catalogue: the old value beside the new one, cell by
 * cell, and the rows that were written on the end shown as written on the end.
 *
 * Laid out as the file is, not as a list of edits. Rows keep their numbers so a cell can be found in
 * a spreadsheet, variants sit under their product because a price that moved on five lengths is one
 * decision and not five, and only the columns that moved get a column here — a Shopify export has
 * forty-eight and a season's change touches two of them.
 */
export function ChangedCells({ before, after, filename }: { before: string; after: string; filename: string }) {
  const diff = useMemo(() => diffCsv(before, after), [before, after]);
  const [showAll, setShowAll] = useState(false);
  const [only, setOnly] = useState<string>("");

  if (diff.problem) {
    return <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{diff.problem}</p>;
  }
  if (diff.rows.length === 0) {
    return <p className="text-xs text-[var(--ink-soft)]">Nothing in {filename} is different from the file you loaded.</p>;
  }

  const shown = only ? diff.rows.filter((r) => r.kind === "added" || r.cells.some((c) => c.column === only)) : diff.rows;
  // A season across a whole catalogue runs to thousands of rows, and nobody reads the four
  // thousandth. Enough to see the shape of it, and the rest on asking.
  const LIMIT = 120;
  const visible = showAll ? shown : shown.slice(0, LIMIT);
  const hidden = shown.length - visible.length;

  // Variants under their product, in the order the file has them.
  const groups: Array<{ handle: string; title: string; rows: RowDiff[] }> = [];
  for (const row of visible) {
    const last = groups[groups.length - 1];
    if (last && last.handle === row.handle) last.rows.push(row);
    else groups.push({ handle: row.handle, title: row.title, rows: [row] });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
        <span className="font-semibold text-[var(--ink)]">
          <span className="tabular-nums">{diff.changedCells}</span> cell{diff.changedCells === 1 ? "" : "s"} moved on <span className="tabular-nums">{diff.changedRows}</span> row{diff.changedRows === 1 ? "" : "s"}
        </span>
        {diff.addedRows > 0 && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-900 tabular-nums">{diff.addedRows} row{diff.addedRows === 1 ? "" : "s"} added</span>
        )}
        <span className="text-[var(--ink-soft)]"><span className="tabular-nums">{diff.untouched}</span> rows came through untouched</span>
        {diff.columns.length > 1 && (
          <span className="ml-auto flex items-center gap-1.5">
            <span className="text-[var(--ink-soft)]">Show</span>
            <select
              value={only} onChange={(e) => setOnly(e.target.value)}
              className="rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-xs outline-none focus:border-[var(--violet)]"
            >
              <option value="">every column that moved</option>
              {diff.columns.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </span>
        )}
      </div>

      <ul className="divide-y divide-[var(--line-soft)] overflow-hidden rounded-xl border border-[var(--line-soft)]">
        {groups.map((group, gi) => (
          <li key={`${group.handle}-${gi}`} className="px-3 py-2">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-sm font-medium">{group.title || group.handle}</span>
              <span className="font-mono text-[11px] text-[var(--ink-soft)]">{group.handle}</span>
            </div>
            <ul className="mt-1.5 space-y-1.5">
              {group.rows.map((row) => (
                <li key={row.row} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
                  <span className="w-20 shrink-0 text-[var(--ink-soft)] tabular-nums" title={`Row ${row.row} of the file`}>
                    row {row.row}
                  </span>
                  <span className="w-28 shrink-0 font-medium">{row.option || <span className="text-[var(--ink-soft)]">the product</span>}</span>
                  {row.kind === "added" ? (
                    <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-900">new row</span>
                      {(row.added ?? []).map((cell) => (
                        <span key={cell.column} className="rounded bg-emerald-50 px-1.5 py-0.5">
                          <span className="text-[var(--ink-soft)]">{cell.column}</span>{" "}
                          <span className="font-medium text-emerald-900">{cell.value}</span>
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                      {row.cells.filter((c) => !only || c.column === only).map((cell) => (
                        <span key={cell.column} className="rounded bg-[var(--rubin-tint)] px-1.5 py-0.5">
                          <span className="text-[var(--ink-soft)]">{cell.column}</span>{" "}
                          <span className="text-[var(--ink-soft)] line-through decoration-[var(--ink-soft)]">{cell.before || "empty"}</span>
                          <span className="mx-1 text-[var(--ink-soft)]">→</span>
                          <span className={cx("font-semibold", cell.after === "" ? "italic text-[var(--ink-soft)]" : "text-[var(--violet)]")}>{cell.after || "cleared"}</span>
                        </span>
                      ))}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      {hidden > 0 && (
        <div className="flex items-center gap-2 text-xs text-[var(--ink-soft)]">
          <Button size="sm" onClick={() => setShowAll(true)}>Show the other {hidden}</Button>
          <span>{visible.length} of {shown.length} changed rows shown.</span>
        </div>
      )}
      {showAll && shown.length > LIMIT && (
        <div className="text-xs text-[var(--ink-soft)]"><Button size="sm" onClick={() => setShowAll(false)}>Back to the first {LIMIT}</Button></div>
      )}
    </div>
  );
}
