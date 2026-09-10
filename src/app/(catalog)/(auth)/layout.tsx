import { DatabaseGate } from "../DatabaseGate";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <DatabaseGate>
    <main className="flex min-h-screen items-center justify-center bg-[var(--canvas)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-lg font-semibold tracking-tight">Product Importer</div>
          <div className="text-xs text-[var(--ink-soft)]">Supplier invoices → Shopify products</div>
        </div>
        {children}
      </div>
    </main>
    </DatabaseGate>
  );
}
