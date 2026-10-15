import Link from "next/link";
import type { ReactNode } from "react";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function Card({ children, className, title, actions }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={cx("card", className)}>
      {(title || actions) && (
        <header className="card-head">
          <h2>{title}</h2>
          <div className="flex items-center gap-2">{actions}</div>
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

const BUTTON = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  danger: "btn-danger",
  ghost: "btn-ghost",
};

/**
 * A button. `icon` is accepted for the pages that still pass one and draws nothing: the emoji
 * chips went when the buttons were redrawn, and a word on a button is enough.
 */
export function Button({ variant = "secondary", size = "md", className, icon: _icon, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BUTTON; size?: "sm" | "md"; icon?: string }) {
  void _icon;
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-[12px] font-semibold transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100",
        size === "sm" ? "px-3 py-1.5 text-[13px] rounded-[10px]" : "px-4 py-2.5 text-[15px]",
        BUTTON[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function LinkButton({ href, children, variant = "secondary", size = "md", className, icon: _icon }: { href: string; children: ReactNode; variant?: keyof typeof BUTTON; size?: "sm" | "md"; className?: string; icon?: string }) {
  void _icon;
  return (
    <Link href={href} style={variant === "primary" ? { color: "#fff" } : undefined} className={cx("inline-flex items-center justify-center gap-1.5 rounded-[12px] font-semibold transition-all duration-200", size === "sm" ? "px-3 py-1.5 text-[13px] rounded-[10px]" : "px-4 py-2.5 text-[15px]", BUTTON[variant], className)}>
      {children}
    </Link>
  );
}

const BADGE: Record<string, string> = {
  neutral: "bg-[var(--canvas-2)] text-[var(--ink-2)]",
  info: "bg-[var(--meta-tint)] text-[var(--meta-ink)]",
  success: "bg-[var(--promoter-tint)] text-[var(--promoter)]",
  warning: "bg-[var(--passive-tint)] text-[#8a5a0b]",
  danger: "bg-[var(--detractor-tint)] text-[#b42318]",
};

export function Badge({ tone = "neutral", children, className }: { tone?: keyof typeof BADGE; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide", BADGE[tone], className)}>{children}</span>;
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
  const tones = {
    info: "border-[var(--meta-tint-2)] bg-[var(--meta-tint)] text-[var(--meta-ink)] shadow-[inset_4px_0_0_var(--meta)]",
    success: "border-[#bfe8d6] bg-[var(--promoter-tint)] text-[#0b5e43] shadow-[inset_4px_0_0_var(--promoter)]",
    warning: "border-[#f1dcb0] bg-[var(--passive-tint)] text-[#7a4e06] shadow-[inset_4px_0_0_var(--passive)]",
    danger: "border-[#f3c3bd] bg-[var(--detractor-tint)] text-[#8f2318] shadow-[inset_4px_0_0_var(--detractor)]",
  };
  return <div className={cx("rounded-[12px] border px-4 py-3 text-sm", tones[tone], className)}>{children}</div>;
}

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block text-sm", className)}>
      <span className="mb-1.5 block text-[13.5px] font-semibold text-[var(--ink-2)]">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs leading-relaxed text-[var(--ink-soft)]">{hint}</span>}
    </label>
  );
}

export const INPUT_INLINE = "input input-inline";
export const INPUT = "input";

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[30px] font-extrabold leading-tight tracking-[-0.03em] text-[var(--ink)]">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-3xl text-[15px] text-[var(--ink-2)]">{subtitle}</p>}
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
  return <div className="rounded-[14px] border border-dashed border-[var(--line)] bg-[var(--canvas)] px-6 py-10 text-center text-sm text-[var(--ink-soft)]">{children}</div>;
}

/**
 * Something a page needs but almost nobody opens — batch currency, an audit trail, a long list of
 * defaults. Folding it away is the difference between a page you scan and a page you wade through.
 */
export function Details({ summary, hint, children, className }: { summary: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <details className={cx("group card", className)}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-[18px] px-5 py-4 text-[15px] font-semibold transition hover:bg-[var(--meta-tint)]">
        <span>
          {summary}
          {hint && <span className="ml-2 text-xs font-normal text-[var(--ink-soft)]">{hint}</span>}
        </span>
        <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--canvas-2)] text-[var(--ink-soft)] transition-transform group-open:rotate-90" aria-hidden>›</span>
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
