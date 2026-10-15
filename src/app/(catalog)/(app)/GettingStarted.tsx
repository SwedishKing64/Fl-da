import Link from "next/link";
import type { ShopProfile } from "@/lib/catalog/shop";

/**
 * The checklist a new shop works down. It sits at the top of Home until everything on it is done,
 * then goes away; the parts of setup that were skipped keep it there, so nothing is forgotten.
 */
export function GettingStarted({ profile, learned, houseDone, aiReady, suppliersDone, staff, imports }: { profile: ShopProfile; learned: boolean; houseDone: boolean; aiReady: boolean; suppliersDone: boolean; staff: number; imports: number }) {
  const items: Array<{ done: boolean; title: string; text: string; href: string; go: string }> = [
    { done: Boolean(profile.name), title: "Say who the shop is", text: "Name, country, what you sell, and the rules to start from.", href: "/setup?step=shop", go: "Set up the shop" },
    { done: learned, title: "Teach Flöda your catalogue", text: "Your Shopify export shows it how you file, tag and name products. Without it, Flöda has only the supplier's paperwork to go on.", href: "/setup?step=learn", go: "Upload the export" },
    { done: houseDone, title: "Say how you write a listing", text: "The brand in the title or not, SKUs and barcodes, weights, and the tags certain products always get.", href: "/setup?step=house", go: "Set the conventions" },
    { done: aiReady, title: "Add the key that reads documents", text: "PDFs, photos and brand pages need it. Spreadsheets do not.", href: "/setup?step=ai", go: "Add the key" },
    { done: suppliersDone, title: "Show Flöda your suppliers' paperwork", text: "One example from each supplier, read now, with every column checked. What you fix is remembered for them.", href: "/setup?step=suppliers", go: "Add examples" },
    { done: staff > 1, title: "Add your staff", text: "Each person signs in as themselves; the marker tag says who built what.", href: "/settings", go: "Add accounts" },
    { done: imports > 0, title: "Run your first invoice through", text: "Start an import, drop in a supplier's invoice, and see what it makes of it.", href: "/batches/new", go: "Start an import" },
  ];
  const left = items.filter((i) => !i.done);
  if (left.length === 0) return null;
  const done = items.length - left.length;
  return (
    <section className="onboard mb-8" aria-labelledby="getting-started">
      <div className="onboard-head">
        <h2 id="getting-started">Getting started</h2>
        <span className="onboard-meter">
          <span className="bar-track" aria-hidden><span className="bar-fill" style={{ width: `${(done / items.length) * 100}%` }} /></span>
          <span>{done} of {items.length} done{!profile.setupDone && <> · <Link href="/setup" className="font-semibold text-[var(--meta)]">Carry on with setup</Link></>}</span>
        </span>
      </div>
      <ol className="grid gap-2.5 p-4 md:grid-cols-2">
        {items.map((i, n) => (
          <li key={i.title} className={`onboard-item ${i.done ? "done" : ""}`}>
            <span className="onboard-n" aria-hidden>{i.done ? "✓" : n + 1}</span>
            <div className="min-w-0">
              <div className="font-semibold">{i.title}</div>
              <div className="text-[13px] text-[var(--ink-soft)]">{i.text}</div>
              {!i.done && <Link href={i.href} className="mt-1.5 inline-block text-[13px] font-semibold text-[var(--meta)]">{i.go} →</Link>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
