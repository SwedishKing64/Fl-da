"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/app/(catalog)/ui";

const LINKS = [
  { href: "/", label: "Dashboard", exact: true },
  { href: "/batches", label: "Import batches" },
  { href: "/adjust", label: "Price & clearance" },
  { href: "/templates", label: "Templates" },
  { href: "/rules", label: "Rules" },
  { href: "/pricing", label: "Pricing" },
  { href: "/history", label: "History" },
  { href: "/settings", label: "Settings", admin: true },
];

export function NavLinks({ isAdmin, compact }: { isAdmin: boolean; compact?: boolean }) {
  const pathname = usePathname();
  const links = LINKS.filter((l) => !l.admin || isAdmin);
  if (compact) {
    return (
      <select className="rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-sm" value={links.find((l) => (l.exact ? pathname === l.href : pathname.startsWith(l.href)))?.href ?? "/"} onChange={(e) => (window.location.href = e.target.value)}>
        {links.map((l) => <option key={l.href} value={l.href}>{l.label}</option>)}
      </select>
    );
  }
  return (
    <nav className="flex flex-col gap-0.5 p-3">
      {links.map((l) => {
        const active = l.exact ? pathname === l.href : pathname.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} className={cx(
              "relative rounded-lg px-3 py-2 text-sm transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
              active
                ? "bg-[var(--alp-snow)] font-semibold text-[var(--alp-blue)] before:absolute before:inset-y-1.5 before:left-0 before:w-1 before:rounded-full before:bg-[var(--alp-yellow)]"
                : "text-[var(--ink-2)] hover:translate-x-0.5 hover:bg-[var(--alp-snow)] hover:text-[var(--alp-blue)]",
            )}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
