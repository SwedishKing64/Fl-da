"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { skipSetupStepAction, startFirstInvoiceAction, syncStoreAction } from "@/app/(catalog)/actions";
import { Alert, Button, Card } from "@/app/(catalog)/ui";
import { ShopifyConnect } from "@/app/(catalog)/(app)/settings/ShopifyConnect";
import { WebsiteForm } from "@/app/(catalog)/(app)/training/WebsiteForm";
import type { WebsiteCategories } from "@/lib/catalog/website";
import type { KindRule } from "@/lib/catalog/house";
import { KindsEditor } from "./KindsEditor";

/** A step's way on when the shop would rather do it later. */
function Later({ step, next, text }: { step: "store" | "learn" | "menu" | "first"; next: string; text: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="mt-5 flex items-center justify-between gap-3 border-t border-[var(--line-soft)] pt-4 text-[13px] text-[var(--ink-soft)]">
      <span>{text}</span>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => { await skipSetupStepAction(step); router.push(next); })}>Skip for now</Button>
    </div>
  );
}

/** Screen 1: connect the store, so Flöda reads what the shop already sells instead of being told. */
export function StoreStep({ connected, canInstall, outcome }: { connected: { domain: string; by: "oauth" | "token" } | null; canInstall: boolean; outcome?: string }) {
  const router = useRouter();
  return (
    <Card title="Connect your store">
      <p className="mb-4 text-[14px] text-[var(--ink-soft)]">
        Flöda reads your Shopify store to learn how you already sell: your kinds of product, your tags and how you spell them, your brands and how each is listed, and your prices. It reads, and later puts new products into your store as drafts for you to check. It never publishes or changes a listing on its own.
      </p>
      <ShopifyConnect connected={connected} canInstall={canInstall} outcome={outcome} next="/setup?step=store" intro={false} />
      {connected && (
        <div className="mt-4">
          <Button variant="primary" onClick={() => router.push("/setup?step=shop")}>Continue →</Button>
        </div>
      )}
      {!connected && <Later step="store" next="/setup?step=shop" text="No store to connect yet? Your Shopify export does the same job, one file at a time." />}
    </Card>
  );
}

/**
 * Screen 3: what the store showed, for a thumbs-up rather than typing. The kinds are laid out to
 * say what each is called, its tags and how its titles read; anything left as found is used as
 * found, and asked again the first time it matters on an invoice.
 */
export function FoundStep({ summary, kinds, read }: { summary: string[]; kinds: KindRule[]; read: boolean }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const router = useRouter();
  const readNow = () => start(async () => {
    setNote(null);
    const r = await syncStoreAction();
    if (!r.ok) { setNote(r.error); return; }
    router.refresh();
  });
  return (
    <Card title="Here's what we found in your store">
      {read ? (
        <ul className="mb-4 list-disc space-y-1 pl-5 text-[14px]">{summary.map((line) => <li key={line}>{line}</li>)}</ul>
      ) : (
        <div className="mb-4 space-y-3">
          <p className="text-[14px] text-[var(--ink-soft)]">Your store is connected and is being read. It takes a minute or two on a large store.</p>
          <Button variant="primary" disabled={pending} onClick={readNow}>{pending ? "Reading your store…" : "Read it now"}</Button>
          {note && <Alert tone="warning">{note}</Alert>}
        </div>
      )}
      {read && kinds.length > 0 && (
        <KindsEditor kinds={kinds} title="Your kinds of product" blurb="Check each one: what you call it, the tags every one of them gets, and how their titles read. Leave any you are happy with as they are." onSaved={() => router.push("/setup?step=house")} />
      )}
      {read && (
        <div className="mt-4">
          <Button variant={kinds.length ? "ghost" : "primary"} onClick={() => router.push("/setup?step=house")}>{kinds.length ? "These are right, continue →" : "Continue →"}</Button>
        </div>
      )}
    </Card>
  );
}

/** Screen 5: the shop's website menu, so the kinds of product are filed where its shoppers look. */
export function MenuStep({ saved }: { saved: WebsiteCategories | null }) {
  const router = useRouter();
  return (
    <Card title="Your menu, roughly">
      <p className="mb-4 text-[14px] text-[var(--ink-soft)]">
        Your website&rsquo;s menu is where your shoppers look for things, so it is where Flöda files new products. Paste your shop&rsquo;s address and Flöda reads the menu; fix anything it reads wrongly.
      </p>
      <WebsiteForm saved={saved} />
      {saved && <div className="mt-4"><Button variant="primary" onClick={() => router.push("/setup?step=ai")}>Continue →</Button></div>}
      <Later step="menu" next="/setup?step=ai" text="Flöda can file products by the kinds of product in your store instead." />
    </Card>
  );
}

/**
 * Screen 6: the first real invoice, read and checked together. It starts an ordinary batch; the
 * batch pages say, while it is the shop's first, that every fix made there is kept.
 */
export function FirstStep() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <Card title="Your first invoice, together">
      <p className="mb-3 text-[14px] text-[var(--ink-soft)]">
        Drop in one real invoice or order form from a supplier. Flöda reads it, builds the products, and shows you each one: its name, its sizes and colours, its price, its kind of product and its picture.
      </p>
      <p className="mb-4 rounded-[12px] bg-[var(--meta-tint)] px-3 py-2.5 text-[13.5px]">
        <strong>Every fix you make is kept.</strong> Rename an option, change a kind of product or correct a line, and Flöda does it that way from then on, for that supplier and that kind of product. The second invoice needs fewer fixes than the first, and the third fewer again.
      </p>
      <Button variant="primary" icon="📄" disabled={pending} onClick={() => start(async () => {
        setError(null);
        const r = await startFirstInvoiceAction();
        if (!r.ok) { setError(r.error); return; }
        router.push(`/batches/${r.data!.id}`);
      })}>{pending ? "Starting…" : "Start my first invoice"}</Button>
      {error && <div className="mt-3"><Alert tone="danger">{error}</Alert></div>}
      <p className="mt-4 text-[13px] text-[var(--ink-soft)]">A supplier whose spreadsheet columns you would rather map by hand first? <Link href="/setup?step=suppliers" className="font-semibold text-[var(--meta)]">Teach a supplier&rsquo;s layout</Link>.</p>
      <Later step="first" next="/setup?step=done" text="You can start your first invoice from Home at any time." />
    </Card>
  );
}
