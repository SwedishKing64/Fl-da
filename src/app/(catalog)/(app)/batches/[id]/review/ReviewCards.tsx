"use client";

import { useState } from "react";
import Link from "next/link";
import { BAR, type ConfidenceField } from "@/lib/catalog/confidence";
import { readyToPush } from "@/lib/catalog/autopilot-rules";
import { Badge, Button, INPUT_INLINE, cx, money, pct } from "@/app/(catalog)/ui";
import type { ReviewProduct } from "@/lib/catalog/review-types";

/**
 * The quick look: only what needs a person, one card each, worst first.
 *
 * Seventeen columns for every product is the right tool for a person who wants to see
 * everything; it is the wrong first screen for a person with a delivery to get on the shelf.
 * This view shows the products under the bar, says in one sentence which field pulled each
 * down, and puts that one field's fix on the card: the title to retype, the tags to fix, the
 * pictures to open, the retail to set. "Looks right" is the other answer: the person has looked,
 * it is fine, and the product stops asking. What is ready is counted, and listed on request.
 */

const FIELD_WORD: Record<ConfidenceField, string> = { title: "Title", tags: "Tags", image: "Picture", price: "Price" };

export interface ReviewCardsProps {
  products: ReviewProduct[];
  /** Find and read a product's page, so its pictures and copy arrive without a link being pasted. */
  findPage: (productId: string) => void;
  /** The store, when one is connected: the one press that sends what has earned it. */
  store: { push: () => void } | null;
  kinds: string[];
  locked: boolean;
  busy: boolean;
  exportHref: string;
  commitProduct: (productId: string, field: "title" | "tags" | "productType", value: string) => void;
  commitVariant: (variantId: string, field: "retailOverride", raw: string) => void;
  openDrawer: (productId: string) => void;
  confirm: (productId: string, field: ConfidenceField) => void;
}

export function ReviewCards({ products, kinds, locked, busy, exportHref, commitProduct, commitVariant, openDrawer, confirm, findPage, store }: ReviewCardsProps) {
  const needLook = products.filter((p) => p.confidence.product < BAR).sort((a, b) => a.confidence.product - b.confidence.product || a.title.localeCompare(b.title));
  const ready = products.filter((p) => p.confidence.product >= BAR);
  const [showReady, setShowReady] = useState(false);
  const pushable = readyToPush(products);
  const inStore = products.filter((p) => p.shopifyProductId).length;

  return (
    <div className="space-y-3">
      {store && (pushable.length > 0 || inStore > 0) && (
        <div className="flex flex-wrap items-center gap-3 rounded-[12px] border border-[var(--line)] bg-white px-4 py-3">
          {pushable.length > 0 && <Button variant="primary" disabled={busy} onClick={store.push} title="Every product with every field above the bar and nothing wrong on it goes to the store as a draft; the rest wait here">Push {pushable.length} ready product{pushable.length === 1 ? "" : "s"} to Shopify as drafts →</Button>}
          <span className="text-[13px] text-[var(--ink-soft)]">
            {inStore > 0 ? `${inStore} already in the store as draft${inStore === 1 ? "" : "s"}. ` : ""}
            {pushable.length > 0 ? "Drafts only: nothing reaches a customer until it is published in the store. A push can be rolled back from the export page." : needLook.length > 0 ? "The rest go once the cards below are settled." : ""}
          </span>
        </div>
      )}
      {needLook.length === 0 ? (
        <div className="rounded-[12px] border border-[var(--line)] bg-white px-5 py-6 text-center">
          <div className="text-[17px] font-semibold">Every product is ready to import.</div>
          <p className="mt-1 text-[13.5px] text-[var(--ink-soft)]">Nothing here needs a person. Switch to the full table if you want to see everything anyway.</p>
          <Link href={exportHref} className="btn-primary mt-3 inline-flex items-center rounded-[12px] px-4 py-2 text-[14px] font-semibold">Next: Export →</Link>
        </div>
      ) : (
        <ol className="space-y-3" data-cards>
          {needLook.map((p) => <ProductCard key={p.id} p={p} kinds={kinds} locked={locked} busy={busy} commitProduct={commitProduct} commitVariant={commitVariant} openDrawer={openDrawer} confirm={confirm} findPage={findPage} />)}
        </ol>
      )}
      {ready.length > 0 && (
        <div className="rounded-[12px] border border-[var(--line)] bg-white px-4 py-3 text-[13.5px]">
          <button type="button" className="font-semibold text-[var(--meta)]" onClick={() => setShowReady((s) => !s)} aria-expanded={showReady}>
            {ready.length} ready to import {showReady ? "▾" : "▸"}
          </button>
          <span className="ml-2 text-[var(--ink-soft)]">Title, tags, picture and price all well founded; nobody needs to look at these.</span>
          {showReady && (
            <ul className="mt-2 grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2 lg:grid-cols-3">
              {ready.map((p) => (
                <li key={p.id} className="flex items-center gap-2 truncate">
                  <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--promoter-tint)] px-1 text-[10px] font-bold text-[var(--promoter)]">✓</span>
                  <button type="button" className="truncate text-left hover:underline" onClick={() => openDrawer(p.id)} title="Open its pictures and details">{p.title}</button>
                  {p.shopifyProductId && <span className="shrink-0 text-[11px] text-[var(--ink-soft)]">in the store</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ProductCard({ p, kinds, locked, busy, commitProduct, commitVariant, openDrawer, confirm, findPage }: { p: ReviewProduct } & Omit<ReviewCardsProps, "products" | "exportHref" | "store">) {
  const c = p.confidence;
  const weakest: ConfidenceField = c.weakest ?? "title";
  const others = (["title", "tags", "image", "price"] as ConfidenceField[]).filter((f) => f !== weakest && c[f] < BAR);
  const typeUnknown = kinds.length > 0 && !kinds.includes(p.productType);
  const errors = [...p.flags, ...p.variants.flatMap((v) => v.flags)].filter((f) => f.severity === "error");
  const seen = new Set<string>();
  const errorLines = errors.filter((f) => (seen.has(f.message) ? false : (seen.add(f.message), true)));

  return (
    <li className="rounded-[12px] border border-[var(--line)] bg-white">
      <div className="flex flex-wrap items-start gap-4 px-4 py-3">
        <button type="button" onClick={() => openDrawer(p.id)} className="shrink-0" title="Pictures and details">
          {/* eslint-disable-next-line @next/next/no-img-element -- supplier CDN hosts are arbitrary */}
          {p.images[0] ? <img src={p.images[0].url} alt="" className="h-16 w-16 rounded-[8px] object-cover" /> : <span className="flex h-16 w-16 items-center justify-center rounded-[8px] border border-dashed border-[var(--line)] text-[11px] text-[var(--ink-soft)]">no picture</span>}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cx("inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold", "bg-[var(--passive-tint)] text-[#8a5a0b]")} title={`How sure Flöda is of the weakest field: ${c.product} of 100`}>{c.product}</span>
            <span className="text-[15px] font-semibold">{p.title || <em className="text-[var(--ink-soft)]">No title</em>}</span>
            <span className="text-[12px] text-[var(--ink-soft)]">{[p.vendor, p.productType].filter(Boolean).join(" · ")}{p.variants.length ? ` · ${p.variants.length} variant${p.variants.length === 1 ? "" : "s"}` : ""}</span>
          </div>
          <p className="mt-1 text-[13.5px]"><Badge tone="warning">{FIELD_WORD[weakest]}</Badge> <span className="ml-1">{c.reasons[weakest] ?? "Needs a look."}</span></p>
          {errorLines.length > 0 && (
            <ul className="mt-1 text-[12.5px] text-[#b42318]">
              {errorLines.slice(0, 4).map((f) => <li key={f.message}>{f.message}</li>)}
            </ul>
          )}
          <div className="mt-2 space-y-2">
            <Fix p={p} field={weakest} locked={locked} busy={busy} commitProduct={commitProduct} commitVariant={commitVariant} openDrawer={openDrawer} confirm={confirm} findPage={findPage} />
            {typeUnknown && !locked && (
              <label className="flex flex-wrap items-center gap-2 text-[12.5px]">
                <span className="text-[var(--ink-soft)]">Kind of product</span>
                <select className={`${INPUT_INLINE} w-56`} value={kinds.includes(p.productType) ? p.productType : ""} disabled={busy} onChange={(e) => e.target.value && commitProduct(p.id, "productType", e.target.value)}>
                  <option value="">{p.productType ? `"${p.productType}" is not one of yours: pick one…` : "Pick one…"}</option>
                  {kinds.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </label>
            )}
          </div>
          {others.length > 0 && (
            <p className="mt-2 text-[12px] text-[var(--ink-soft)]">
              Also under the bar: {others.map((f) => `${FIELD_WORD[f].toLowerCase()} (${c[f]})`).join(", ")}. Each comes up in turn once this one is settled.
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

/** The one field's fix, on the card. */
function Fix({ p, field, locked, busy, commitProduct, commitVariant, openDrawer, confirm, findPage }: { p: ReviewProduct; field: ConfidenceField; locked: boolean; busy: boolean } & Pick<ReviewCardsProps, "commitProduct" | "commitVariant" | "openDrawer" | "confirm" | "findPage">) {
  const [title, setTitle] = useState(p.title);
  const [tags, setTags] = useState(p.tags);
  const looksRight = <Button size="sm" variant="ghost" disabled={busy} title="You have looked, and it is right: the product stops asking." onClick={() => confirm(p.id, field)}>Looks right</Button>;
  if (locked) return <p className="text-[12.5px] text-[var(--ink-soft)]">This batch has gone out; nothing here can change now.</p>;

  switch (field) {
    case "title":
      return (
        <div className="flex flex-wrap items-center gap-2">
          <input className={`${INPUT_INLINE} w-96 max-w-full`} value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && title.trim() !== p.title) commitProduct(p.id, "title", title.trim()); }} placeholder="The product's name" />
          <Button size="sm" variant="primary" disabled={busy || title.trim() === p.title || !title.trim()} onClick={() => commitProduct(p.id, "title", title.trim())}>Save</Button>
          {looksRight}
        </div>
      );
    case "tags":
      return (
        <div className="flex flex-wrap items-center gap-2">
          <input className={`${INPUT_INLINE} w-96 max-w-full`} value={tags} onChange={(e) => setTags(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && tags.trim() !== p.tags) commitProduct(p.id, "tags", tags.trim()); }} placeholder="Tags, separated by commas" />
          <Button size="sm" variant="primary" disabled={busy || tags.trim() === p.tags} onClick={() => commitProduct(p.id, "tags", tags.trim())}>Save</Button>
          {looksRight}
        </div>
      );
    case "image":
      return (
        <div className="flex flex-wrap items-center gap-2">
          {p.images.length === 0 && <Button size="sm" variant="primary" disabled={busy} title="Flöda finds the product's own page (the brand's usual address first, then a search) and takes its pictures and copy" onClick={() => findPage(p.id)}>Find its page</Button>}
          <Button size="sm" variant={p.images.length ? "primary" : "secondary"} disabled={busy} onClick={() => openDrawer(p.id)}>{p.images.length ? "See the pictures" : "Add pictures"}</Button>
          {p.images.length > 0 && looksRight}
        </div>
      );
    case "price":
      return (
        <div className="space-y-1.5">
          <table className="text-[12.5px]">
            <tbody>
              {p.variants.map((v) => <PriceRow key={v.id} v={v} busy={busy} commitVariant={commitVariant} />)}
            </tbody>
          </table>
          <div className="flex items-center gap-2">{looksRight}<span className="text-[12px] text-[var(--ink-soft)]">Retail includes GST. Leave a cell and it is saved.</span></div>
        </div>
      );
  }
}

function PriceRow({ v, busy, commitVariant }: { v: ReviewProduct["variants"][number]; busy: boolean; commitVariant: ReviewCardsProps["commitVariant"] }) {
  const [retail, setRetail] = useState(v.retailOverride === null ? "" : String(v.retailOverride));
  const save = () => { const now = v.retailOverride === null ? "" : String(v.retailOverride); if (retail.trim() !== now) commitVariant(v.id, "retailOverride", retail.trim()); };
  return (
    <tr>
      <td className="pr-3 py-0.5">{[v.option1Value, v.option2Value, v.option3Value].filter(Boolean).join(" / ") || v.sku}</td>
      <td className="pr-3 py-0.5 text-[var(--ink-soft)]">landed {money(v.landedCostAud)}</td>
      <td className="pr-3 py-0.5">
        <input type="number" step="any" className={`${INPUT_INLINE} w-28 text-right`} value={retail} disabled={busy} onChange={(e) => setRetail(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} placeholder={v.retailPrice > 0 ? money(v.retailPrice) : "retail"} title="The retail, including GST; empty lets the pricing rule decide" />
      </td>
      <td className={cx("py-0.5", v.profitPerUnit < 0 ? "text-[#b42318] font-semibold" : "text-[var(--ink-soft)]")}>{v.retailPrice > 0 ? `${pct(v.marginPct)} margin` : "no price"}</td>
    </tr>
  );
}
