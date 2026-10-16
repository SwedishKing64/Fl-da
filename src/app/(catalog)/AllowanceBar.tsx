/**
 * How much of the fortnight's reading allowance has gone: a bar, the dollars, and when it
 * starts again. Plain markup, so it renders on the website's account page, the copy's sidebar
 * and its Settings alike. `tone` picks the colours for a dark or a light ground.
 */
export function AllowanceBar({ spentCents, capCents, resetsAt, tone = "light", compact = false }: { spentCents: number; capCents: number; resetsAt?: string | Date | null; tone?: "light" | "dark"; compact?: boolean }) {
  if (capCents <= 0) return null;
  const share = Math.min(1, spentCents / capCents);
  const pct = Math.round(share * 100);
  const full = share >= 1;
  const warm = share >= 0.8;
  const dollars = (c: number) => `$${(c / 100).toFixed(c % 100 === 0 ? 0 : 2)}`;
  const when = resetsAt ? new Date(resetsAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "";
  const dark = tone === "dark";
  const track = dark ? "bg-white/15" : "bg-[var(--line-soft)]";
  const fill = full ? "bg-[#e5484d]" : warm ? "bg-[#f5a524]" : dark ? "bg-[var(--sky)]" : "bg-[var(--meta)]";
  const text = dark ? (full || warm ? "text-[#ffd591]" : "text-white/60") : full ? "text-[#b42318]" : warm ? "text-[#9a5b00]" : "text-[var(--ink-soft)]";
  return (
    <div className={compact ? "mt-1.5" : "mt-2"} aria-label={`Reading allowance: ${dollars(spentCents)} of ${dollars(capCents)} used this fortnight`}>
      <div className={`h-1.5 w-full overflow-hidden rounded-full ${track}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
      </div>
      <div className={`mt-1 flex justify-between gap-2 ${compact ? "text-[11px]" : "text-[12.5px]"} ${text}`}>
        <span>{full ? "Fortnightly limit reached" : `${dollars(spentCents)} of ${dollars(capCents)} reading used this fortnight`}</span>
        {when && <span>{full ? "Starts again " : "Resets "}{when}</span>}
      </div>
    </div>
  );
}
