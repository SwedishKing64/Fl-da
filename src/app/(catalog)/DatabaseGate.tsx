import type { ReactElement } from "react";
import { accelerateEnvName, databaseEnvNamesPresent, databaseStatus, type DatabaseStatus } from "@/lib/catalog/db";

/**
 * Every way the database can be wrong, explained on screen. A deployment with no connection
 * string, a string pointing somewhere unreachable, or a database whose tables were never
 * created would otherwise all surface as an unexplained server error.
 *
 * `databaseGate()` returns the screen to render instead of the app, or null to carry on.
 * Layouts must call it before touching the database.
 */

const TITLES: Record<DatabaseStatus["state"], string> = {
  ok: "",
  ephemeral: "Connect a database to finish setup",
  missing: "No database is configured",
  unreachable: "The database cannot be reached",
  "wrong-provider": "This build was made for the wrong kind of database",
  "no-tables": "The database is connected but empty",
};

function Wrap({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--canvas)] px-4 py-10">
      <div className="w-full max-w-lg rounded-xl border border-[var(--line)] bg-white p-6 shadow-[var(--shadow)]">
        <div className="text-lg font-semibold tracking-tight">{title}</div>
        {children}
      </div>
    </main>
  );
}

function Diagnostics({ status }: { status: DatabaseStatus }) {
  const env = process.env.VERCEL_ENV ?? (process.env.VERCEL ? "unknown" : "local");
  const branch = process.env.VERCEL_GIT_COMMIT_REF ?? "unknown";
  const present = databaseEnvNamesPresent();
  const accelerate = accelerateEnvName();
  const detail = status.state === "unreachable" || status.state === "no-tables" || status.state === "wrong-provider" ? status.detail : null;
  return (
    <div className="mt-4 rounded-lg border border-[var(--line-soft)] bg-[var(--canvas)] p-3 text-xs text-[var(--ink-2)]">
      <div className="font-semibold uppercase tracking-wide text-[var(--ink-soft)]">Diagnostics</div>
      <div className="mt-1">
        Environment <strong>{env}</strong>, branch <code className="rounded bg-white px-1">{branch}</code>.
      </div>
      {status.source && (
        <div className="mt-1">
          Reading from <strong>{status.source}</strong>.
        </div>
      )}
      <div className="mt-1">
        Database-shaped variables visible here: <strong>{present.length ? present.join(", ") : "none"}</strong>.
      </div>
      <div className="mt-1">
        Any variable whose value is a <code className="rounded bg-white px-1">postgres://</code> URL is used, whatever it is named.
      </div>
      {detail && (
        <div className="mt-2 rounded border border-[var(--line)] bg-white px-2 py-1.5 font-mono text-[11px] leading-relaxed break-words">{detail}</div>
      )}
      {accelerate && (
        <div className="mt-2 rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-amber-900">
          <strong>{accelerate}</strong> holds a Prisma Accelerate URL (<code className="rounded bg-white px-1">prisma+postgres://</code>). This app talks to Postgres directly, so that one cannot be used. Copy your database&apos;s <strong>direct</strong> connection string and set it as <code className="rounded bg-white px-1">DATABASE_URL</code> on this project, then redeploy.
        </div>
      )}
    </div>
  );
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-[var(--ink-2)]">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ol>
  );
}

export async function databaseGate(): Promise<ReactElement | null> {
  const status = await databaseStatus();
  if (status.state === "ok") return null;
  // A throwaway SQLite copy is fine locally; on a deployment it silently loses data.
  if (status.state === "ephemeral" && !process.env.VERCEL) return null;

  const title = TITLES[status.state];

  if (status.state === "no-tables") {
    return (
      <Wrap title={title}>
        <p className="mt-2 text-sm text-[var(--ink-2)]">
          The connection works, but the tables this app needs have not been created. That happens when the schema could not be
          synced during the build, usually because the connection string does not allow a direct connection.
        </p>
        <Steps
          items={[
            <>Check that this project&apos;s connection string is a <strong>direct</strong> one, not a pooled or Accelerate URL.</>,
            <>Redeploy. The build creates the tables when it can reach the database directly.</>,
            <>Or create them yourself: <code className="rounded bg-neutral-100 px-1">npx prisma db push</code> with that connection string.</>,
          ]}
        />
        <Diagnostics status={status} />
      </Wrap>
    );
  }

  if (status.state === "wrong-provider") {
    return (
      <Wrap title={title}>
        <p className="mt-2 text-sm text-[var(--ink-2)]">
          The database itself is fine. The build produced a Prisma client for SQLite and then handed it a
          Postgres connection string, so the two do not match. Nothing here is worth changing in your
          database provider — it is the deployment that needs redoing.
        </p>
        <Steps
          items={[
            <>Redeploy this project, so the build runs again against the Postgres URL it can now see.</>,
            <>If it comes back to this screen, open the build log and look for the <code className="rounded bg-neutral-100 px-1">[vercel-build]</code> lines — they say which variable was used and whether the provider was switched.</>,
          ]}
        />
        <Diagnostics status={status} />
      </Wrap>
    );
  }

  if (status.state === "unreachable") {
    return (
      <Wrap title={title}>
        <p className="mt-2 text-sm text-[var(--ink-2)]">
          A connection string is set, but nothing answered on it. The database may be paused, the credentials may have been
          rotated, or the string may point somewhere that no longer exists.
        </p>
        <Steps
          items={[
            <>Open the database in your provider and check it is running, not suspended.</>,
            <>Copy its current direct connection string and set it as <code className="rounded bg-neutral-100 px-1">DATABASE_URL</code> on this project.</>,
            <>Redeploy.</>,
          ]}
        />
        <Diagnostics status={status} />
      </Wrap>
    );
  }

  if (status.state === "missing") {
    return (
      <Wrap title={title}>
        <p className="mt-2 text-sm text-[var(--ink-2)]">
          This deployment has no connection string and no bundled fallback, so it cannot store anything.
        </p>
        <Steps
          items={[
            <>In the Vercel dashboard, open <strong>Storage</strong> and create or connect a Postgres database.</>,
            <>Connect it to <strong>every environment</strong> you use, not just Production.</>,
            <>Redeploy.</>,
          ]}
        />
        <Diagnostics status={status} />
      </Wrap>
    );
  }

  return (
    <Wrap title={title}>
      <p className="mt-2 text-sm text-[var(--ink-2)]">
        The app is deployed, but it is running on a throwaway copy of the database that resets whenever the server restarts, so
        accounts and batches would disappear. This takes about two minutes to fix:
      </p>
      <Steps
        items={[
          <>Open this project in the Vercel dashboard and go to <strong>Storage</strong>.</>,
          <><strong>Create Database → Neon (Postgres)</strong>, then connect it to this project, every environment.</>,
          <>Optionally <strong>Create → Blob</strong> as well, so uploaded photos get public URLs for Shopify.</>,
          <>Go to <strong>Deployments</strong> and <strong>Redeploy</strong> the latest one.</>,
        ]}
      />
      <Diagnostics status={status} />
    </Wrap>
  );
}
