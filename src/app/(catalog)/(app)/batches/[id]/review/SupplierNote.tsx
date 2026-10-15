import { Badge } from "@/app/(catalog)/ui";
import { describeRecord, FIRST_INVOICE_CHECKS, recordWord, type SupplierRecord } from "@/lib/catalog/supplier-record";

/**
 * What to know about this supplier before checking the grid: on their first invoice, the five
 * things a new layout gets wrong; after that, how their paperwork has read so far.
 */
export function SupplierNote({ record }: { record: SupplierRecord }) {
  if (record.imports === 0) {
    return (
      <section className="mb-4 rounded-[16px] border border-[var(--meta-tint-2)] bg-[var(--meta-tint)] p-5" aria-labelledby="first-invoice">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h2 id="first-invoice" className="text-[16px] font-bold">First invoice from {record.name}</h2>
          <Badge tone="info">new layout</Badge>
        </div>
        <p className="mb-3 text-[13.5px] text-[var(--ink-2)]">Nobody has checked this supplier&rsquo;s paperwork through Flöda before, so this one deserves a closer look. What you fix here is remembered: the next invoice from {record.name} reads the way you left this one.</p>
        <ol className="grid gap-2 md:grid-cols-2">
          {FIRST_INVOICE_CHECKS.map((c, i) => (
            <li key={c.what} className="flex gap-3 rounded-[12px] bg-white/80 p-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--meta)] text-[11px] font-bold text-white" aria-hidden>{i + 1}</span>
              <span className="min-w-0 text-[13.5px]"><span className="font-semibold">{c.what}.</span> <span className="text-[var(--ink-2)]">{c.why}</span></span>
            </li>
          ))}
        </ol>
      </section>
    );
  }
  const { word, tone } = recordWord(record);
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 text-[13.5px] text-[var(--ink-2)]">
      <Badge tone={tone}>{word}</Badge>
      <span>{describeRecord(record)}</span>
    </div>
  );
}
