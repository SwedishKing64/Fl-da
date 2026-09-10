import Link from "next/link";
import { requireUser } from "@/lib/catalog/auth";
import { isEphemeralDb } from "@/lib/catalog/db";
import { DatabaseGate } from "../DatabaseGate";
import { logoutAction } from "@/app/(catalog)/actions";
import { NavLinks } from "./NavLinks";
import "../catalog.css";

export const dynamic = "force-dynamic";

export default async function CatalogLayout({ children }: { children: React.ReactNode }) {
  if (process.env.VERCEL && isEphemeralDb()) return <DatabaseGate>{children}</DatabaseGate>;
  const user = await requireUser();
  return (
    <div className="flex min-h-screen bg-[var(--canvas)]">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-[var(--line)] bg-white md:flex">
        <Link href="/" className="border-b border-[var(--line-soft)] px-5 py-4">
          <div className="text-sm font-semibold tracking-tight">Product Importer</div>
          <div className="text-[11px] text-[var(--ink-soft)]">Invoices → Shopify CSV</div>
        </Link>
        <NavLinks isAdmin={user.role === "ADMIN"} />
        <div className="mt-auto border-t border-[var(--line-soft)] px-5 py-4 text-xs">
          <div className="font-medium">{user.name}</div>
          <div className="text-[var(--ink-soft)]">{user.role === "ADMIN" ? "Admin" : "Staff"}</div>
          <form action={logoutAction} className="mt-2">
            <button className="text-[var(--violet)] hover:underline">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8">
        <div className="mb-4 flex items-center justify-between md:hidden">
          <Link href="/" className="text-sm font-semibold">Product Importer</Link>
          <NavLinks isAdmin={user.role === "ADMIN"} compact />
        </div>
        {isEphemeralDb() && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            <strong>No database connected.</strong> This deployment is running on a temporary database that resets whenever the server restarts, so batches and accounts will disappear.
            {process.env.VERCEL ? " In Vercel: Storage → Create Database → Neon (Postgres), connect it to this project, then redeploy." : " Set DATABASE_URL and restart."}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
