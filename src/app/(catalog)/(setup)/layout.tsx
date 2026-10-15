import { databaseGate } from "../DatabaseGate";
import { Logo } from "@/app/Logo";
import "../catalog.css";

/** The setup walk-through: the mark on the aurora, over a page wide enough for a form. */
export default async function SetupLayout({ children }: { children: React.ReactNode }) {
  const gate = await databaseGate();
  if (gate) return gate;
  return (
    <main className="min-h-screen bg-[var(--canvas)]">
      <header className="aurora relative overflow-hidden pb-20 pt-12 text-center">
        <div className="rise relative z-10 flex flex-col items-center px-4">
          <Logo size={30} tone="light" />
          <p className="mt-3 text-[13px] font-medium tracking-wide text-white/70">Setting up</p>
        </div>
      </header>
      <div className="rise rise-1 mx-auto -mt-10 w-full max-w-2xl px-4 pb-16">{children}</div>
    </main>
  );
}
