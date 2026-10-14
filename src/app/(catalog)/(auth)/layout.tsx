import { databaseGate } from "../DatabaseGate";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const gate = await databaseGate();
  if (gate) return gate;
  return (
    <main className="min-h-screen bg-[var(--canvas)]">
      <header className="rubin-gradient relative overflow-hidden pb-24 pt-12 text-center">
        <div className="rise relative z-10 px-4">
          <h1 className="wordmark text-3xl text-white">Flöda</h1>
          <p className="mt-1 text-xs font-medium tracking-wide text-white/75">Paperwork in, listings out</p>
        </div>
        {/* The range, cut out of the ruby in the colour of the ground below it. */}
        <svg className="pointer-events-none absolute inset-x-0 bottom-0 h-20 w-full text-[var(--canvas)]" viewBox="0 0 1200 120" preserveAspectRatio="none" aria-hidden>
          <path d="M0 120 L190 44 L300 92 L470 18 L640 98 L820 52 L1000 104 L1200 60 L1200 120 Z" fill="currentColor" />
        </svg>
      </header>
      <div className="rise rise-1 mx-auto -mt-12 w-full max-w-sm px-4 pb-16">{children}</div>
    </main>
  );
}
