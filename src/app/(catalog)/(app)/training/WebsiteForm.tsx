"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { forgetWebsiteAction, readWebsiteAction, saveWebsiteAction } from "@/app/(catalog)/actions";
import { Alert, Badge, Button, INPUT } from "@/app/(catalog)/ui";
import type { WebsiteCategories, WebsiteCategory } from "@/lib/catalog/website";

/**
 * The shop's website, read for its categories. What comes back is shown with a tick beside each
 * entry; the ticked ones are kept as the shop's kinds of product. A category can be added by hand
 * for a menu the reader could not see, and the whole list can be read again after the site changes.
 */
export function WebsiteForm({ saved }: { saved: WebsiteCategories | null }) {
  const router = useRouter();
  const [url, setUrl] = useState(saved?.url ?? "");
  const [found, setFound] = useState<WebsiteCategories | null>(null);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [extra, setExtra] = useState("");
  const [note, setNote] = useState<{ tone: "success" | "danger" | "info"; text: string } | null>(null);
  const [pending, start] = useTransition();

  const read = () =>
    start(async () => {
      setNote(null); setFound(null);
      const r = await readWebsiteAction(url);
      if (!r.ok) return setNote({ tone: "danger", text: r.error });
      const data = r.data;
      if (!data) return setNote({ tone: "danger", text: "Nothing came back from the site." });
      setFound(data);
      setTicked(Object.fromEntries(data.categories.map((c) => [c.title, true])));
      setNote({ tone: "info", text: `${data.categories.length} categor${data.categories.length === 1 ? "y" : "ies"} found${data.source === "shopify" ? " (a Shopify store: its collections)" : " (from the site's menus)"}. Untick any that are not a kind of product, add any that are missing, then keep the list.` });
    });

  const addExtra = () => {
    const title = extra.trim();
    if (!title || !found) return;
    if (!found.categories.some((c) => c.title.toLowerCase() === title.toLowerCase())) setFound({ ...found, categories: [...found.categories, { title, path: "" }] });
    setTicked((t) => ({ ...t, [title]: true }));
    setExtra("");
  };

  const keep = () =>
    start(async () => {
      if (!found) return;
      const categories: WebsiteCategory[] = found.categories.filter((c) => ticked[c.title]);
      const r = await saveWebsiteAction({ url: found.url, source: found.source, categories });
      if (!r.ok) return setNote({ tone: "danger", text: r.error });
      const kinds = r.data?.kinds ?? categories.length;
      setFound(null);
      setNote({ tone: "success", text: `Kept. ${kinds} kind${kinds === 1 ? "" : "s"} of product: the Type on every listing is picked from this list, and a Type outside it stops the export until it is fixed.` });
      router.refresh();
    });

  const forget = () =>
    start(async () => {
      const r = await forgetWebsiteAction();
      setNote(r.ok ? { tone: "info", text: "Forgotten. Kinds of product now come from your Shopify export alone." } : { tone: "danger", text: r.error });
      router.refresh();
    });

  const count = found ? found.categories.filter((c) => ticked[c.title]).length : 0;

  return (
    <div className="space-y-4 text-[14px]">
      <p className="text-[var(--ink-soft)]">
        Every product has a place it must appear on your site, and that place is a category the site already has. Flöda reads the categories off your website and uses them, and nothing else, as the kinds of product it may write in the Type column. A reader that proposes a kind you do not have is stopped on the review grid, so nothing is invented.
      </p>

      {saved && !found && (
        <div className="rounded-[12px] border border-[var(--line)] bg-white p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge tone="success">{saved.categories.length} kind{saved.categories.length === 1 ? "" : "s"} of product</Badge>
            <span className="text-[13px] text-[var(--ink-soft)]">from <strong>{saved.url.replace(/^https?:\/\//, "")}</strong>, read {new Date(saved.readAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {saved.categories.map((c) => <span key={c.title} className="rounded-full bg-[var(--canvas)] px-2.5 py-1 text-[12.5px] ring-1 ring-inset ring-[var(--line)]">{c.title}</span>)}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex-1 min-w-[16rem]">
          <span className="mb-1 block text-[13px] font-semibold">Your website</span>
          <input className={INPUT} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="aussieskier.com.au" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); read(); } }} />
        </label>
        <Button variant="primary" disabled={pending || !url.trim()} onClick={read}>{pending && !found ? "Reading…" : saved ? "Read it again" : "Read the website"}</Button>
        {saved && <Button variant="ghost" disabled={pending} onClick={forget}>Forget the website</Button>}
      </div>

      {note && <Alert tone={note.tone}>{note.text}</Alert>}

      {found && (
        <div className="rounded-[12px] border border-[var(--line)] bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <span className="text-[13px] font-semibold">{count} of {found.categories.length} ticked</span>
            <button type="button" className="text-[12.5px] text-[var(--meta)] underline" onClick={() => setTicked(Object.fromEntries(found.categories.map((c) => [c.title, true])))}>Tick all</button>
            <button type="button" className="text-[12.5px] text-[var(--meta)] underline" onClick={() => setTicked({})}>Untick all</button>
          </div>
          <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {found.categories.map((c) => (
              <li key={c.title}>
                <label className={`flex cursor-pointer items-start gap-2 rounded-[10px] border px-2.5 py-1.5 ${ticked[c.title] ? "border-[var(--meta)] bg-[var(--meta-tint)]" : "border-[var(--line-soft)]"}`}>
                  <input type="checkbox" className="mt-1" checked={Boolean(ticked[c.title])} onChange={(e) => setTicked((t) => ({ ...t, [c.title]: e.target.checked }))} />
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-medium">{c.title}</span>
                    {c.path && <span className="block truncate text-[11.5px] text-[var(--ink-soft)]">{c.path}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="flex-1 min-w-[14rem]">
              <span className="mb-1 block text-[12.5px] font-semibold">A category the reader missed</span>
              <input className={INPUT} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Ski Poles" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addExtra(); } }} />
            </label>
            <Button variant="secondary" size="sm" disabled={!extra.trim()} onClick={addExtra}>Add it</Button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[var(--line-soft)] pt-3">
            <Button variant="primary" disabled={pending || count === 0} onClick={keep}>{pending ? "Keeping…" : `Keep these ${count} as my kinds of product`}</Button>
            <Button variant="ghost" disabled={pending} onClick={() => { setFound(null); setNote(null); }}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
