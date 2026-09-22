import Link from "next/link";
import { prisma } from "@/lib/catalog/db";
import { requireUser } from "@/lib/catalog/auth";
import { isEphemeralDb } from "@/lib/catalog/db";
import { databaseGate } from "../DatabaseGate";
import { logoutAction } from "@/app/(catalog)/actions";
import { NavLinks } from "./NavLinks";
import { CommandPalette, type PaletteItem } from "@/app/(catalog)/CommandPalette";
import { Kbd } from "@/app/(catalog)/ui";
import "../catalog.css";

export const dynamic = "force-dynamic";

const PAGES: PaletteItem[] = [
  { id: "p-dash", label: "Dashboard", group: "Pages", href: "/" },
  { id: "p-batches", label: "Import batches", group: "Pages", href: "/batches" },
  { id: "p-new", label: "New import", hint: "start a batch", group: "Pages", href: "/batches/new" },
  { id: "p-bulk", label: "Bulk uploads", hint: "sale and clearance", group: "Pages", href: "/bulk" },
  { id: "p-pricing", label: "Pricing", group: "Pages", href: "/pricing" },
  { id: "p-history", label: "History", group: "Pages", href: "/history" },
  { id: "p-settings", label: "Settings", group: "Pages", href: "/settings" },
];

export default async function CatalogLayout({ children }: { children: React.ReactNode }) {
  const gate = await databaseGate();
  if (gate) return gate;
  const user = await requireUser();

  // The palette's contents come down with the page. There are never many batches, and matching
  // them in the browser means no request per keystroke and nothing to wait for.
  const recent = await prisma.importBatch.findMany({
    orderBy: { updatedAt: "desc" },
    take: 60,
    select: { id: true, name: true, status: true, supplier: { select: { name: true } } },
  });
  const items: PaletteItem[] = [
    ...PAGES,
    ...recent.map((b) => ({
      id: b.id,
      label: b.name,
      hint: [b.supplier?.name, b.status.replace("_", " ").toLowerCase()].filter(Boolean).join(" · "),
      group: "Batches",
      href: `/batches/${b.id}`,
    })),
  ];

  return (
    <div className="flex min-h-screen bg-[var(--canvas)]">
      <aside className="night hidden w-60 shrink-0 flex-col md:flex">
        <Link href="/" className="gem block px-5 py-5">
          <div className="flex items-center gap-2.5">
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
              <path d="M7 3h10l5 6-10 12L2 9Z" fill="var(--rubin-bright)" />
              <path d="M7 3h10l5 6H2Z" fill="var(--gold)" opacity="0.92" />
              <path d="M2 9h20L12 21Z" fill="var(--rubin)" opacity="0.55" />
            </svg>
            <div className="text-[17px] font-bold tracking-tight text-white">Rubin</div>
          </div>
          <div className="mt-1 text-[11px] text-white/55">Shopify catalogue tools</div>
        </Link>
        <NavLinks isAdmin={user.role === "ADMIN"} />
        <div className="mt-auto px-5 py-4 text-xs">
          <div className="mb-3 flex items-center gap-1.5 text-[11px] text-white/45">
            <Kbd>⌘</Kbd><Kbd>K</Kbd> <span>to go anywhere</span>
          </div>
          <div className="font-medium text-white/90">{user.name}</div>
          <div className="text-white/45">{user.role === "ADMIN" ? "Admin" : "Staff"}</div>
          <form action={logoutAction} className="mt-2">
            <button className="text-[var(--gold)] hover:underline">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8">
        <div className="mb-4 flex items-center justify-between md:hidden">
          <Link href="/" className="text-sm font-bold text-[var(--rubin-deep)]">Rubin</Link>
          <NavLinks isAdmin={user.role === "ADMIN"} compact />
        </div>
        {isEphemeralDb() && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            <strong>No database connected.</strong> This deployment is running on a temporary database that resets whenever the server restarts, so batches and accounts will disappear.
            {process.env.VERCEL ? " In Vercel: Storage → Create Database → Neon (Postgres), connect it to this project, then redeploy." : " Set DATABASE_URL and restart."}
          </div>
        )}
        <div className="rise">{children}</div>
      </main>
      <CommandPalette items={items} />
    </div>
  );
}
