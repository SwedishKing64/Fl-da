import Link from "next/link";
import type { ShopProfile } from "@/lib/catalog/shop";

/**
 * The checklist a new shop works down. It sits at the top of Home until everything on it is done,
 * then goes away; the parts of setup that were skipped keep it there, so nothing is forgotten.
 */
export function GettingStarted({ profile, learned, aiReady, staff, imports }: { profile: ShopProfile; learned: boolean; aiReady: boolean; staff: number; imports: number }) {
  const items: Array<{ done: boolean; title: string; text: string; href: string; go: string }> = [
    { done: Boolean(profile.name), title: "Say who the shop is", text: "Name, country, what you sell, and the rules to start from.", href: "/setup?step=shop", go: "Set up the shop" },
    { done: learned, title: "Teach Flöda your catalogue", text: "Your Shopify export shows it how you file, tag and name products. Without it, Flöda has only the supplier's paperwork to go on.", href: "/setup?step=learn", go: "Upload the export" },
    { done: aiReady, title: "Add the key that reads documents", text: "PDFs, photos and brand pages need it. Spreadsheets do not.", href: "/setup?step=ai", go: "Add the key" },
    { done: staff > 1, title: "Add your staff", text: "Each person signs in as themselves; the marker tag says who built what.", href: "/settings", go: "Add accounts" },
    { done: imports > 0, title: "Run your first invoice through", text: "Start an import, drop in a supplier's invoice, and see what it makes of it.", href: "/batches/new", go: "Start an import" },
  ];
  const left = items.filter((i) => !i.done);
  if (left.length === 0) return null;
  const done = items.length - left.length;
  return (
    <section className="mb-8 rounded-[14px] border border-[var(--meta-tint-2)] bg-[var(--meta-tint)] p-5" aria-labelledby="getting-started">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="getting-started" className="text-[17px] font-bold tracking-tight">Getting started</h2>
        <span className="text-[13px] text-[var(--ink-soft)]">{done} of {items.length} done{!profile.setupDone && <> · <Link href="/setup" className="font-semibold text-[var(--meta)]">Carry on with setup</Link></>}</span>
      </div>
      <ol className="grid gap-2 md:grid-cols-2">
        {items.map((i, n) => (
          <li key={i.title} className={`flex items-start gap-3 rounded-[12px] bg-white p-3 ${i.done ? "opacity-60" : ""}`}>
            <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${i.done ? "bg-[var(--promoter)] text-white" : "border-2 border-[var(--meta)] text-[var(--meta)]"}`} aria-hidden>{i.done ? "✓" : n + 1}</span>
            <div className="min-w-0">
              <div className="font-semibold">{i.title}</div>
              <div className="text-[13px] text-[var(--ink-soft)]">{i.text}</div>
              {!i.done && <Link href={i.href} className="mt-1 inline-block text-[13px] font-semibold text-[var(--meta)]">{i.go} →</Link>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
