import { databaseGate } from "../DatabaseGate";
import "../catalog.css";

/** The setup walk-through: the blue header the sign-in page has, over a page wide enough for a form. */
export default async function SetupLayout({ children }: { children: React.ReactNode }) {
  const gate = await databaseGate();
  if (gate) return gate;
  return (
    <main className="min-h-screen bg-[var(--canvas)]">
      <header className="rubin-gradient relative overflow-hidden pb-20 pt-10 text-center">
        <div className="rise relative z-10 px-4">
          <div className="wordmark text-3xl text-white">Flöda</div>
          <p className="mt-1 text-xs font-medium tracking-wide text-white/75">Setting up</p>
        </div>
        <svg className="pointer-events-none absolute inset-x-0 bottom-0 h-16 w-full text-[var(--canvas)]" viewBox="0 0 1200 120" preserveAspectRatio="none" aria-hidden>
          <path d="M0 120 L190 44 L300 92 L470 18 L640 98 L820 52 L1000 104 L1200 60 L1200 120 Z" fill="currentColor" />
        </svg>
      </header>
      <div className="rise rise-1 mx-auto -mt-10 w-full max-w-2xl px-4 pb-16">{children}</div>
    </main>
  );
}
