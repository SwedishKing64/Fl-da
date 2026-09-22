import { Details } from "@/app/(catalog)/ui";

/**
 * What the reader actually got off the document, before anything was done with it.
 *
 * Without this, "the RRP is on the invoice but it did not come through" is unanswerable from the
 * outside: nobody can tell whether the price was never read off the page, or was read and then
 * lost somewhere downstream. Those are different bugs in different files, and guessing between
 * them costs a round trip every time.
 *
 * Empty columns are left out — the reader emits a fixed set of fields and most are blank on any
 * given invoice, so showing all twenty-two would bury the four that matter.
 */
export function ExtractedRows({ filename, headers, rows }: { filename: string; headers: string[]; rows: Array<Record<string, string>> }) {
  if (rows.length === 0) return null;
  const used = headers.filter((h) => rows.some((r) => (r[h] ?? "").trim() !== ""));
  const shown = rows.slice(0, 50);
  // The columns this shop lives or dies by, called out so they are findable at a glance.
  const key = new Set(["title", "rrp", "costPrice", "quantity", "size", "colour", "gender"]);

  return (
    <Details summary={`What was read from ${filename}`} hint={`${rows.length} row${rows.length === 1 ? "" : "s"} · ${used.length} column${used.length === 1 ? "" : "s"} with anything in them`} className="mt-3">
      {used.length === 0 ? (
        <p className="text-sm text-[var(--ink-soft)]">Every column came back empty — the reader found no usable rows in this file.</p>
      ) : (
        <>
          {!used.includes("rrp") && (
            <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              No <strong>rrp</strong> was read from this file. If the document does show a recommended retail column, that is a reading fault worth reporting. If it does not, the prices are looked up on the brand&rsquo;s website from the review page instead.
            </p>
          )}
          <div className="overflow-auto rounded-lg border border-[var(--line)]">
            <table className="w-full text-xs">
              <thead className="bg-[var(--rubin-tint)] text-left">
                <tr>{used.map((h) => <th key={h} className={`whitespace-nowrap px-2.5 py-1.5 font-semibold ${key.has(h) ? "text-[var(--violet)]" : "text-[var(--ink-soft)]"}`}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {shown.map((r, i) => (
                  <tr key={i} className="border-t border-[var(--line-soft)]">
                    {used.map((h) => <td key={h} className={`whitespace-nowrap px-2.5 py-1.5 ${key.has(h) ? "font-medium" : "text-[var(--ink-soft)]"}`}>{(r[h] ?? "").trim() || "—"}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > shown.length && <p className="mt-2 text-xs text-[var(--ink-soft)]">First {shown.length} of {rows.length} rows.</p>}
        </>
      )}
    </Details>
  );
}
