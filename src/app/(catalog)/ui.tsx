import Link from "next/link";
import type { ReactNode } from "react";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function Card({ children, className, title, actions }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={cx("rounded-xl border border-[var(--line)] bg-white shadow-[var(--shadow-sm)]", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-[var(--line-soft)] px-5 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <div className="flex items-center gap-2">{actions}</div>
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

const BUTTON = {
  primary: "bg-[var(--ink)] text-white hover:bg-black disabled:bg-neutral-400",
  secondary: "border border-[var(--line)] bg-white hover:bg-neutral-50 disabled:text-neutral-400",
  danger: "border border-red-200 bg-white text-red-700 hover:bg-red-50 disabled:text-neutral-400",
  ghost: "hover:bg-neutral-100 disabled:text-neutral-400",
};

export function Button({ variant = "secondary", size = "md", className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BUTTON; size?: "sm" | "md" }) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition disabled:cursor-not-allowed",
        size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-sm",
        BUTTON[variant],
        className,
      )}
    />
  );
}

export function LinkButton({ href, children, variant = "secondary", size = "md", className }: { href: string; children: ReactNode; variant?: keyof typeof BUTTON; size?: "sm" | "md"; className?: string }) {
  return (
    <Link href={href} style={variant === "primary" ? { color: "#fff" } : undefined} className={cx("inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition", size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-sm", BUTTON[variant], className)}>
      {children}
    </Link>
  );
}

const BADGE: Record<string, string> = {
  neutral: "bg-neutral-100 text-neutral-700",
  info: "bg-blue-50 text-blue-700",
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

export const INPUT_INLINE = "rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--violet)] focus:ring-2 focus:ring-[var(--violet-soft)] disabled:bg-neutral-50";
export const INPUT = "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--violet)] focus:ring-2 focus:ring-[var(--violet-soft)] disabled:bg-neutral-50";

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-[var(--ink-soft)]">{subtitle}</p>}
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
