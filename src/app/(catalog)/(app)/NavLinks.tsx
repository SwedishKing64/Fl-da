"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/app/(catalog)/ui";

/** Line icons, drawn here so the nav costs no request and matches its own stroke weight. */
const ICONS: Record<string, React.ReactNode> = {
  dashboard: <><rect x="3" y="3" width="7" height="8" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="11" width="7" height="10" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></>,
  batches: <><path d="M4 7.5 12 3l8 4.5-8 4.5-8-4.5Z" /><path d="m4 12 8 4.5 8-4.5" /><path d="m4 16.5 8 4.5 8-4.5" /></>,
  bulk: <><path d="M12 15V3" /><path d="m7 8 5-5 5 5" /><path d="M4 15v4.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V15" /></>,
  pricing: <><circle cx="12" cy="12" r="9" /><path d="M12 7v10M9.5 9.5h4a1.75 1.75 0 0 1 0 3.5h-3a1.75 1.75 0 0 0 0 3.5h4" /></>,
  tidy: <><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  history: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 14a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V20a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 18.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4 12.6H4a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 5.7 7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 11.4 4V4a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 18.3 5.7l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H20a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>,
};

const LINKS = [
  { href: "/", label: "Dashboard", icon: "dashboard", exact: true },
  { href: "/batches", label: "Import batches", icon: "batches" },
  { href: "/bulk", label: "Bulk uploads", icon: "bulk" },
  { href: "/tidy", label: "Tidy a document", icon: "tidy" },
  { href: "/pricing", label: "Pricing", icon: "pricing" },
  { href: "/history", label: "History", icon: "history" },
  { href: "/settings", label: "Settings", icon: "settings", admin: true },
];

function Ico({ name }: { name: string }) {
  return (
    <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONS[name]}
    </svg>
  );
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
