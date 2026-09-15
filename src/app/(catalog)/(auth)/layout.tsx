import { databaseGate } from "../DatabaseGate";
import { Logo } from "../Logo";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const gate = await databaseGate();
  if (gate) return gate;
  return (
    <main className="min-h-screen bg-[var(--canvas)]">
      <header className="alp-gradient relative overflow-hidden pb-24 pt-12 text-center">
        <div className="rise relative z-10 flex flex-col items-center px-4">
          <Logo height={64} />
          <p className="mt-3 text-xs font-medium tracking-wide text-white/85">Supplier invoices → Shopify products</p>
        </div>
        {/* The range, cut out of the blue in the colour of the ground below it. */}
        <svg className="pointer-events-none absolute inset-x-0 bottom-0 h-20 w-full text-[var(--canvas)]" viewBox="0 0 1200 120" preserveAspectRatio="none" aria-hidden>
          <path d="M0 120 L190 44 L300 92 L470 18 L640 98 L820 52 L1000 104 L1200 60 L1200 120 Z" fill="currentColor" />
        </svg>
      </header>
      <div className="rise rise-1 mx-auto -mt-12 w-full max-w-sm px-4 pb-16">{children}</div>
    </main>
  );
}
