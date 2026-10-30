"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/app/(catalog)/ui";

/** Each page as a line drawing of what it is for: one stroke, 1.75 wide, on a 24-unit grid. */
const ICONS: Record<string, React.ReactNode> = {
  dashboard: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  batches: <><path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z" /><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" /></>,
  bulk: <><path d="M3 12V4.5A1.5 1.5 0 0 1 4.5 3H12l9 9-7.5 7.5z" /><circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" /></>,
  tidy: <><path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.5-2.5h5L16 7h2.5A1.5 1.5 0 0 1 20 8.5V18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18z" /><circle cx="12" cy="13" r="3.2" /></>,
  pricing: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8.5 7h7M8.5 11.5h2M13.5 11.5h2M8.5 15h2M13.5 15h2M8.5 18.5h7" /></>,
  history: <><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" /><path d="M3.5 4.5v4.2h4.2M12 7.5V12l3 2" /></>,
  settings: <><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  training: <><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H20v13H6.5A2.5 2.5 0 0 0 4 19.5z" /><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M8.5 8.5h7M8.5 12h4.5" /></>,
  clients: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M21.5 20a6.5 6.5 0 0 0-4.5-6.2" /></>,
};

const LINKS = [
  { href: "/", label: "Home", icon: "dashboard", exact: true },
  { href: "/batches", label: "New products", icon: "batches" },
  { href: "/bulk", label: "Prices and stock", icon: "bulk" },
  { href: "/tidy", label: "Tidy a document", icon: "tidy" },
  { href: "/pricing", label: "Price calculator", icon: "pricing" },
  { href: "/history", label: "History", icon: "history" },
  { href: "/training", label: "Teach Flöda", icon: "training", admin: true },
  { href: "/settings", label: "Settings", icon: "settings", admin: true },
  { href: "/clients", label: "Clients", icon: "clients", admin: true, vendor: true },
];

export function NavIcon({ name, className }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cx("ico", className)} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      {ICONS[name]}
    </svg>
  );
}

export function NavLinks({ isAdmin, vendor, compact }: { isAdmin: boolean; vendor?: boolean; compact?: boolean }) {
  const pathname = usePathname();
  const links = LINKS.filter((l) => (!l.admin || isAdmin) && (!("vendor" in l) || !l.vendor || vendor));
  if (compact) {
    return (
      <select className="rounded-[10px] border border-[var(--line)] bg-white px-2.5 py-1.5 text-sm font-medium" value={links.find((l) => (l.exact ? pathname === l.href : pathname.startsWith(l.href)))?.href ?? "/"} onChange={(e) => (window.location.href = e.target.value)}>
        {links.map((l) => <option key={l.href} value={l.href}>{l.label}</option>)}
      </select>
    );
  }
  return (
    <nav className="flex flex-col gap-1 px-3 py-2">
      {links.map((l) => {
        const active = l.exact ? pathname === l.href : pathname.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} className={cx("nav-link", active && "on")} aria-current={active ? "page" : undefined}>
            <span className="nav-ico"><NavIcon name={l.icon} /></span>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
