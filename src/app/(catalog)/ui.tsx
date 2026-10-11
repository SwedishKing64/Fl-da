import Link from "next/link";
import type { ReactNode } from "react";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function Card({ children, className, title, actions }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={cx("rounded-2xl border border-[var(--line)] bg-white shadow-[var(--shadow-sm)]", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-[var(--line-soft)] px-5 py-3.5">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <div className="flex items-center gap-2">{actions}</div>
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

const BUTTON = {
  primary: "bg-[var(--meta)] text-white shadow-[var(--shadow-sm)] hover:bg-[var(--meta-deep)] active:bg-[var(--meta-deep)] disabled:bg-neutral-400",
  secondary: "border border-[var(--line)] bg-white text-[var(--ink)] hover:bg-[var(--meta-tint)] hover:border-[var(--meta-bright)] disabled:text-neutral-400 disabled:hover:bg-white",
  danger: "border border-red-200 bg-white text-red-700 hover:bg-red-50 disabled:text-neutral-400",
  ghost: "hover:bg-neutral-100 disabled:text-neutral-400",
};

export function Button({ variant = "secondary", size = "md", className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BUTTON; size?: "sm" | "md" }) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-[10px] font-semibold transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100",
        size === "sm" ? "px-3 py-1.5 text-[13px]" : "px-4 py-2.5 text-[15px]",
        BUTTON[variant],
        className,
      )}
    />
  );
}

export function LinkButton({ href, children, variant = "secondary", size = "md", className }: { href: string; children: ReactNode; variant?: keyof typeof BUTTON; size?: "sm" | "md"; className?: string }) {
  return (
    <Link href={href} style={variant === "primary" ? { color: "#fff" } : undefined} className={cx("inline-flex items-center justify-center gap-1.5 rounded-[10px] font-semibold transition-all duration-200", size === "sm" ? "px-3 py-1.5 text-[13px]" : "px-4 py-2.5 text-[15px]", BUTTON[variant], className)}>
      {children}
    </Link>
  );
}

const BADGE: Record<string, string> = {
  neutral: "bg-neutral-100 text-neutral-700",
  info: "bg-[var(--meta-tint)] text-[var(--meta-ink)]",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-800",
  danger: "bg-red-50 text-red-700",
};

export function Badge({ tone = "neutral", children, className }: { tone?: keyof typeof BADGE; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide", BADGE[tone], className)}>{children}</span>;
}

export function statusTone(status: string): keyof typeof BADGE {
  switch (status) {
    case "REVIEW": return "info";
    case "EXPORTED":
    case "PUSHED": return "success";
    case "ROLLED_BACK": return "warning";
    default: return "neutral";
  }
}

export function Alert({ tone = "info", children, className }: { tone?: "info" | "success" | "warning" | "danger"; children: ReactNode; className?: string }) {
  const tones = { info: "border-blue-200 bg-blue-50 text-blue-900", success: "border-emerald-200 bg-emerald-50 text-emerald-900", warning: "border-amber-200 bg-amber-50 text-amber-900", danger: "border-red-200 bg-red-50 text-red-900" };
  return <div className={cx("rounded-lg border px-4 py-3 text-sm", tones[tone], className)}>{children}</div>;
}

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block text-sm", className)}>
      <span className="mb-1 block font-medium text-[var(--ink-2)]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-[var(--ink-soft)]">{hint}</span>}
    </label>
  );
}

export const INPUT_INLINE = "rounded-[10px] border border-[var(--line)] bg-white px-3.5 py-2.5 text-[15px] outline-none focus:border-[var(--meta)] focus:ring-[3px] focus:ring-[var(--meta-tint-2)] disabled:bg-neutral-50";
export const INPUT = "w-full rounded-[10px] border border-[var(--line)] bg-white px-3.5 py-2.5 text-[15px] outline-none focus:border-[var(--meta)] focus:ring-[3px] focus:ring-[var(--meta-tint-2)] disabled:bg-neutral-50";

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-[var(--line)] pb-4">
      <div>
        <h1 className="text-[28px] font-bold tracking-tight text-[var(--ink)]">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-[15px] text-[var(--ink-2)]">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function money(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "–";
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}

export function pct(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "–";
  return `${n.toFixed(1)}%`;
}

export function fmtDate(d: Date | string): string {
  return new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(d));
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-[var(--line)] px-6 py-10 text-center text-sm text-[var(--ink-soft)]">{children}</div>;
}

/**
 * Something a page needs but almost nobody opens — batch currency, an audit trail, a long list of
 * defaults. Folding it away is the difference between a page you scan and a page you wade through.
 */
export function Details({ summary, hint, children, className }: { summary: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <details className={cx("group rounded-2xl border border-[var(--line)] bg-white shadow-[var(--shadow-sm)]", className)}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3.5 text-[15px] font-semibold transition hover:bg-[var(--meta-tint)]">
        <span>
          {summary}
          {hint && <span className="ml-2 font-normal text-xs text-[var(--ink-soft)]">{hint}</span>}
        </span>
        <span className="text-[var(--ink-soft)] transition-transform group-open:rotate-90" aria-hidden>›</span>
      </summary>
      <div className="border-t border-[var(--line-soft)] p-5">{children}</div>
    </details>
  );
}

/** A headline number. The label is above it because that is the order you read them in. */
export function Stat({ label, value, sub, tone }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: "gold" }) {
  return (
    <div className={cx("stat", tone)}>
      <div className="k">{label}</div>
      <div className="v">{value}</div>
      {sub && <div className="s">{sub}</div>}
    </div>
  );
}

/** A key on the keyboard, written down, so a shortcut can be shown rather than described. */
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}
