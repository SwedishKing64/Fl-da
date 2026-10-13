"use client";

import { useState } from "react";
import { cleanProductUrl } from "@/lib/catalog/page-types";
import { Alert } from "@/app/(catalog)/ui";

/**
 * A box for the product's own web page under the name of every product the delivery will build.
 *
 * The links are only held here until the delivery is applied; applying reads the pages and builds
 * the products with what they say. A product with nothing pasted is built exactly as it would have
 * been — it is optional on every one.
 */
export interface LinkProduct { key: number; title: string; /** Why this one is asked, when it is not a new product. */ note?: string }

export function BulkLinks({ products, links, onChange, notes, disabled }: {
  products: LinkProduct[];
  links: Record<number, string>;
  onChange: (key: number, url: string) => void;
  /** What happened to each link on the last apply, by product. */
  notes: Record<number, { tone: "ok" | "warn" | "bad"; text: string }>;
  disabled: boolean;
}) {
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [bad, setBad] = useState<Record<number, string>>({});
  const given = products.filter((p) => (links[p.key] ?? "").trim() !== "").length;

  const commit = (key: number) => {
    const text = (drafts[key] ?? links[key] ?? "").trim();
    const cleaned = cleanProductUrl(text);
    if (text !== "" && "error" in cleaned) { setBad((b) => ({ ...b, [key]: cleaned.error })); return; }
    setBad((b) => { const { [key]: _gone, ...rest } = b; void _gone; return rest; });
    onChange(key, text === "" ? "" : (cleaned as { url: string }).url);
    setDrafts((d) => { const { [key]: _gone, ...rest } = d; void _gone; return rest; });
  };

  if (products.length === 0) return null;
  return (
    <fieldset className="rounded-xl border border-[var(--line-soft)] px-3 py-2.5">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-[var(--ink-soft)]">Product pages · {given} of {products.length} have a link</legend>
      <p className="mb-3 text-xs text-[var(--ink-soft)]">
        Paste a product&rsquo;s own page under its name and its description, details and pictures are taken from it when you apply the delivery. A new colour of a listing you already have takes its pictures the same way. A product with no link is built as it is. <strong>Open the page with the colour you ordered selected before copying the link</strong>: the pictures are taken of that colour, and the read is told the colour on the order so it leaves the other colours&rsquo; pictures alone.
      </p>
      <ul className="max-h-[26rem] space-y-3 overflow-auto pr-1">
        {products.map((p) => {
          const note = notes[p.key];
          return (
            <li key={p.key}>
              <div className="text-sm font-medium">{p.title}{p.note && <span className="ml-2 text-xs font-normal text-[var(--ink-soft)]">{p.note}</span>}</div>
              <input
                id={`bulk-link-${p.key}`}
                type="url"
                inputMode="url"
                value={drafts[p.key] ?? links[p.key] ?? ""}
                disabled={disabled}
                placeholder="Link to this product's page, with the ordered colour selected (optional)"
                onChange={(e) => setDrafts((d) => ({ ...d, [p.key]: e.target.value }))}
                onBlur={() => commit(p.key)}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-sm outline-none focus:border-[var(--violet)] focus:ring-2 focus:ring-[var(--violet-soft)] disabled:bg-neutral-50"
              />
              {bad[p.key] && <div className="mt-1 text-xs text-red-700">{bad[p.key]}</div>}
              {!bad[p.key] && note && <div className={note.tone === "bad" ? "mt-1 text-xs text-red-700" : note.tone === "warn" ? "mt-1 text-xs text-amber-800" : "mt-1 text-xs text-[var(--ink-soft)]"}>{note.text}</div>}
            </li>
          );
        })}
      </ul>
      {given === 0 && <Alert tone="info" className="mt-3">Nothing to read — the products go ahead as they are.</Alert>}
    </fieldset>
  );
}
