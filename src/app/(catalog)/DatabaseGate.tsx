import { isEphemeralDb } from "@/lib/catalog/db";

/**
 * On Vercel without a database, every server instance has its own throwaway copy of the
 * data, so logins and batches disappear between requests. Rather than pretend, explain how
 * to connect one. Returns null when a real database is configured.
 */
export function DatabaseGate({ children }: { children: React.ReactNode }) {
  if (!process.env.VERCEL || !isEphemeralDb()) return <>{children}</>;
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--canvas)] px-4">
      <div className="w-full max-w-lg rounded-xl border border-[var(--line)] bg-white p-6 shadow-[var(--shadow)]">
        <div className="text-lg font-semibold tracking-tight">Connect a database to finish setup</div>
        <p className="mt-2 text-sm text-[var(--ink-2)]">The app is deployed, but Vercel has no persistent storage of its own, so nothing you enter can be kept yet. This takes about two minutes:</p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-[var(--ink-2)]">
          <li>Open this project in the Vercel dashboard and go to <strong>Storage</strong>.</li>
          <li><strong>Create Database → Neon (Postgres)</strong>, then connect it to this project (all environments).</li>
          <li>Optionally <strong>Create → Blob</strong> and connect it, so uploaded photos get public URLs for Shopify.</li>
          <li>Go to <strong>Deployments</strong> and <strong>Redeploy</strong> the latest one.</li>
        </ol>
        <p className="mt-3 text-xs text-[var(--ink-soft)]">The build detects the Postgres connection string, switches the schema over and creates the tables automatically. Then come back here to create your admin account.</p>
      </div>
    </main>
  );
}
