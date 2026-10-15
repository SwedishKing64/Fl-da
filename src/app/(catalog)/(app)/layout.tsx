import Link from "next/link";
import { after } from "next/server";
import { nightlyIfDue } from "@/lib/catalog/backup";
import { prisma } from "@/lib/catalog/db";
import { requireUser } from "@/lib/catalog/auth";
import { isEphemeralDb } from "@/lib/catalog/db";
import { databaseGate } from "../DatabaseGate";
import { logoutAction } from "@/app/(catalog)/actions";
import { NavLinks } from "./NavLinks";
import { FeedbackButton } from "./FeedbackButton";
import { Paywall } from "./Paywall";
import { CommandPalette, type PaletteItem } from "@/app/(catalog)/CommandPalette";
import { Kbd } from "@/app/(catalog)/ui";
import { Logo } from "@/app/Logo";
import { vendorMode } from "@/lib/catalog/licence";
import { currentLicence, monthUse } from "@/lib/catalog/licence-store";
import { describeMonthUse, overPlan, planOf } from "@/lib/catalog/plans";
import "../catalog.css";

export const dynamic = "force-dynamic";

const PAGES: PaletteItem[] = [
  { id: "p-dash", label: "Home", group: "Pages", href: "/" },
  { id: "p-batches", label: "New products", hint: "invoices in, listings out", group: "Pages", href: "/batches" },
  { id: "p-new", label: "Start a new import", hint: "an invoice or order", group: "Pages", href: "/batches/new" },
  { id: "p-bulk", label: "Prices and stock", hint: "sales, clearance, deliveries", group: "Pages", href: "/bulk" },
  { id: "p-tidy", label: "Tidy a document", hint: "a photo into a table", group: "Pages", href: "/tidy" },
  { id: "p-pricing", label: "Price calculator", group: "Pages", href: "/pricing" },
  { id: "p-history", label: "History", group: "Pages", href: "/history" },
  { id: "p-settings", label: "Settings", group: "Pages", href: "/settings" },
  { id: "p-setup", label: "Setup", hint: "the shop, its catalogue, the key", group: "Pages", href: "/setup" },
];

export default async function CatalogLayout({ children }: { children: React.ReactNode }) {
  const gate = await databaseGate();
  if (gate) return gate;
  const user = await requireUser();
  const vendor = vendorMode();
  // A copy on a file is backed up once a night while it is open: after this page, if it is due.
  after(() => nightlyIfDue());
  const licence = await currentLicence();
  // A copy that may not run shows the paywall instead of the app, data untouched behind it.
  if (licence.kind === "none" || licence.kind === "lapsed") return <Paywall state={licence} isAdmin={user.role === "ADMIN"} name={user.name.trim().split(/\s+/)[0] || user.name} />;
  const pastPlan = licence.kind === "ok" && user.role === "ADMIN" ? await monthUse().then((use) => (overPlan(planOf(licence.licence.plan), use) ? { plan: planOf(licence.licence.plan), use } : null)).catch(() => null) : null;

  // The palette's contents come down with the page. There are never many batches, and matching
  // them in the browser means no request per keystroke and nothing to wait for.
  const recent = await prisma.importBatch.findMany({
    orderBy: { updatedAt: "desc" },
    take: 60,
    select: { id: true, name: true, status: true, supplier: { select: { name: true } } },
  });
  const items: PaletteItem[] = [
    ...PAGES,
    ...(vendor ? [{ id: "p-clients", label: "Clients", hint: "who runs Flöda, and their keys", group: "Pages", href: "/clients" }] : []),
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
      <aside className="night hidden w-64 shrink-0 flex-col md:flex">
        <Link href="/" className="block px-5 pb-4 pt-5">
          <Logo size={22} tone="light" />
          <div className="mt-2 text-[12px] text-white/60">Paperwork in, listings out</div>
        </Link>
        <NavLinks isAdmin={user.role === "ADMIN"} vendor={vendor} />
        <div className="mt-auto px-4 pb-4 text-xs">
          <div className="mb-3 flex items-center gap-1.5 px-1 text-[11px] text-white/55">
            <Kbd>⌘</Kbd><Kbd>K</Kbd> <span>to go anywhere</span>
          </div>
          <div className="flex items-center gap-3 rounded-[14px] bg-white/[0.07] p-3 ring-1 ring-inset ring-white/10">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[var(--sky)] to-[var(--meta)] text-[13px] font-bold text-white shadow-[0_6px_14px_-6px_rgba(0,0,0,0.6)]" aria-hidden>{user.name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-white">{user.name}</div>
              <div className="text-white/55">{user.role === "ADMIN" ? "Admin" : "Staff"}</div>
            </div>
            <form action={logoutAction}>
              <button className="rounded-[8px] px-2 py-1 text-[12px] font-medium text-white/75 transition hover:bg-white/10 hover:text-white">Sign out</button>
            </form>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-9 md:py-8">
        <div className="mb-4 flex items-center justify-between md:hidden">
          <Link href="/"><Logo size={18} /></Link>
          <NavLinks isAdmin={user.role === "ADMIN"} vendor={vendor} compact />
        </div>
        {pastPlan && (
          <div className="mb-4 rounded-[12px] border border-[#f5c87a] bg-[#fff7e6] px-4 py-3 text-[13.5px] text-[#7a4b00]">
            <strong>This month has gone past the {pastPlan.plan.name} plan</strong> ({describeMonthUse(pastPlan.plan, pastPlan.use)}). Nothing stops. Write to hello@floda.ai to move up a plan.
          </div>
        )}
        {isEphemeralDb() && (
          <div className="mb-4 rounded-[12px] border border-[#f3c3bd] bg-[var(--detractor-tint)] px-4 py-3 text-sm text-[#8f2318] shadow-[inset_4px_0_0_var(--detractor)]">
            <strong>No database connected.</strong> This deployment is running on a temporary database that resets whenever the server restarts, so batches and accounts will disappear.
            {process.env.VERCEL ? " In Vercel: Storage → Create Database → Neon (Postgres), connect it to this project, then redeploy." : " Set DATABASE_URL and restart."}
          </div>
        )}
        <div className="rise">{children}</div>
      </main>
      <CommandPalette items={items} />
      <FeedbackButton />
    </div>
  );
}
