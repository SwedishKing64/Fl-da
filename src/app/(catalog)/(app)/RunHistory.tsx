import { listRuns, RUNS_WITH_FILES, type RunKind } from "@/lib/catalog/work-runs";
import { Card, Empty, fmtDate } from "@/app/(catalog)/ui";
import { readableSize } from "@/lib/catalog/image-size";

const COUNT_NAMES: Record<string, string> = {
  changes: "cells changed",
  products: "products",
  rowsAdded: "rows added",
  bills: "bills",
  total: "total $",
  discrepancies: "with a discrepancy",
};

/**
 * The runs of Prices and stock or of Bills: each download, who made it and when, what it did and
 * from which documents, with its files to download again.
 */
export async function RunHistory({ kind }: { kind: RunKind }) {
  const runs = await listRuns(kind).catch(() => null);
  return (
    <Card title="History">
      <p className="mb-3 text-xs text-[var(--ink-soft)]">
        Each time the {kind === "PRICES" ? "updated files are" : "bills sheet is"} downloaded it is kept here — who, when, what was done and from which documents — with the file{kind === "PRICES" ? "s" : ""} to download again. The newest {RUNS_WITH_FILES} keep their files; older ones keep what they did.
      </p>
      {runs === null ? <Empty>The history could not be read just now.</Empty> : runs.length === 0 ? <Empty>Nothing downloaded yet.</Empty> : (
        <ul className="divide-y divide-[var(--line-soft)]">
          {runs.map((r) => {
            const counts = Object.entries(r.summary.counts).filter(([, v]) => Number.isFinite(v));
            const note = (r.summary as { note?: string }).note;
            return (
              <li key={r.id} className="py-2.5">
                <details>
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="text-sm font-medium">{r.title}</span>
                      <span className="text-xs text-[var(--ink-soft)]">{fmtDate(r.createdAt)} · {r.who}</span>
                    </div>
                    {counts.length > 0 && (
                      <div className="mt-0.5 text-xs text-[var(--ink-soft)]">
                        {counts.map(([k, v]) => (k === "total" ? `$${v.toFixed(2)} in all` : `${v} ${COUNT_NAMES[k] ?? k}`)).join(" · ")}
                      </div>
                    )}
                  </summary>
                  <div className="mt-2 space-y-2 text-xs">
                    {r.summary.documents.length > 0 && <div><span className="font-semibold">From:</span> {r.summary.documents.join(", ")}</div>}
                    {r.summary.lines.length > 0 && (
                      <ul className="list-disc space-y-0.5 pl-5 text-[var(--ink-soft)]">
                        {r.summary.lines.map((l, i) => <li key={i}>{l}</li>)}
                      </ul>
                    )}
                    {note && <div className="text-[var(--ink-soft)]">{note}</div>}
                  </div>
                </details>
                {r.files.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {r.files.map((f) => (
                      <a key={f.id} href={`/api/catalog/runs/${f.id}`} className="rounded-full border border-[var(--line)] px-2.5 py-0.5 text-xs text-[var(--violet)] hover:bg-[var(--meta-tint)]">
                        ⬇️ {f.filename} <span className="text-[var(--ink-soft)]">({readableSize(f.sizeBytes)})</span>
                      </a>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
