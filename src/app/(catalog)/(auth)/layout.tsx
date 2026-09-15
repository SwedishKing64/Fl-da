import { databaseGate } from "../DatabaseGate";
import { Logo } from "../Logo";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const gate = await databaseGate();
  if (gate) return gate;
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--canvas)] px-4">
      {/* A suggestion of the range behind the sign-in card. */}
      <div className="alp-gradient pointer-events-none absolute inset-x-0 top-0 h-56" aria-hidden />
      <svg className="pointer-events-none absolute inset-x-0 top-24 h-40 w-full text-[var(--canvas)]" viewBox="0 0 1200 160" preserveAspectRatio="none" aria-hidden>
        <path d="M0 160 L240 54 L360 112 L520 20 L700 120 L860 62 L1040 128 L1200 70 L1200 160 Z" fill="currentColor" />
      </svg>
      <div className="rise relative w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo height={56} />
          <div className="mt-3 text-xs font-medium text-white/85">Supplier invoices → Shopify products</div>
        </div>
        {children}
      </div>
    </main>
  );
}
