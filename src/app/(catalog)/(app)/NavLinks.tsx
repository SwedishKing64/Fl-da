"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/app/(catalog)/ui";

/** Each page as a picture of what it is for, the way Meta leads a menu item with one. */
const ICONS: Record<string, string> = {
  dashboard: "🏠",
  batches: "📦",
  bulk: "🏷️",
  tidy: "📸",
  pricing: "🧮",
  history: "🕘",
  settings: "⚙️",
};

const LINKS = [
  { href: "/", label: "Home", icon: "dashboard", exact: true },
  { href: "/batches", label: "New products", icon: "batches" },
  { href: "/bulk", label: "Prices and stock", icon: "bulk" },
  { href: "/tidy", label: "Tidy a document", icon: "tidy" },
  { href: "/pricing", label: "Price calculator", icon: "pricing" },
  { href: "/history", label: "History", icon: "history" },
  { href: "/settings", label: "Settings", icon: "settings", admin: true },
];

function Ico({ name }: { name: string }) {
  return <span className="emo" aria-hidden>{ICONS[name]}</span>;
}

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
    <nav className="flex flex-col gap-0.5 px-3 py-3">
      {links.map((l) => {
        const active = l.exact ? pathname === l.href : pathname.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} className={cx("nav-link", active && "on")} aria-current={active ? "page" : undefined}>
            <Ico name={l.icon} />
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
