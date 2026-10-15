import { databaseGate } from "../DatabaseGate";
import { Logo } from "@/app/Logo";

/** The sign-in page: the mark on the aurora, the card pulled up over it. */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const gate = await databaseGate();
  if (gate) return gate;
  return (
    <main className="min-h-screen bg-[var(--canvas)]">
      <header className="aurora relative overflow-hidden pb-24 pt-14 text-center">
        <div className="rise relative z-10 flex flex-col items-center px-4">
          <Logo size={30} tone="light" />
          <p className="mt-3 text-[13px] font-medium tracking-wide text-white/70">Paperwork in, listings out</p>
        </div>
      </header>
      <div className="rise rise-1 mx-auto -mt-12 w-full max-w-sm px-4 pb-16">{children}</div>
    </main>
  );
}
