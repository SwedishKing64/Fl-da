import Link from "next/link";

/**
 * The way on, bottom right of every batch page: upload → review and price → export → the next
 * batch. Fixed to the window so it is in the same place however long the page is, and never a
 * guess about where the work goes next. Disabled, with the reason, when there is nothing to go on
 * to yet.
 */
export function NextStep({ href, label, disabledWhy }: { href: string; label: string; disabledWhy?: string }) {
  const cls = "inline-flex items-center gap-2 rounded-full px-5 py-3 text-[15px] font-semibold shadow-[0_8px_24px_rgba(0,0,0,0.18)]";
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-30 print:hidden">
      {disabledWhy ? (
        <span className={`${cls} pointer-events-auto cursor-not-allowed bg-[var(--line)] text-[var(--ink-soft)]`} title={disabledWhy} aria-disabled="true">{label} <span aria-hidden>→</span></span>
      ) : (
        <Link href={href} className={`${cls} pointer-events-auto bg-[var(--meta)] text-white hover:brightness-110`}>{label} <span aria-hidden>→</span></Link>
      )}
    </div>
  );
}
