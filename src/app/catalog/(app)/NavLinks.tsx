"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/app/catalog/ui";

const LINKS = [
  { href: "/catalog", label: "Dashboard", exact: true },
  { href: "/catalog/batches", label: "Import batches" },
  { href: "/catalog/suppliers", label: "Suppliers & mappings" },
  { href: "/catalog/pricing", label: "Pricing & categories" },
  { href: "/catalog/images", label: "Image library" },
  { href: "/catalog/shopify", label: "Shopify" },
  { href: "/catalog/history", label: "History" },
  { href: "/catalog/settings", label: "Settings", admin: true },
];

export function NavLinks({ isAdmin, compact }: { isAdmin: boolean; compact?: boolean }) {
  const pathname = usePathname();
  const links = LINKS.filter((l) => !l.admin || isAdmin);
  if (compact) {
    return (
      <select className="rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-sm" value={links.find((l) => (l.exact ? pathname === l.href : pathname.startsWith(l.href)))?.href ?? "/catalog"} onChange={(e) => (window.location.href = e.target.value)}>
        {links.map((l) => <option key={l.href} value={l.href}>{l.label}</option>)}
      </select>
    );
  }
  return (
    <nav className="flex flex-col gap-0.5 p-3">
      {links.map((l) => {
        const active = l.exact ? pathname === l.href : pathname.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} className={cx("rounded-lg px-3 py-2 text-sm", active ? "bg-[var(--violet-soft)] font-medium text-[var(--violet)]" : "text-[var(--ink-2)] hover:bg-neutral-100")}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
