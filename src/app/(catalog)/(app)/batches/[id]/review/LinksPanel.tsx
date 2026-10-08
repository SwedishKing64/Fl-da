"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { readProductLinkAction, setProductLinkAction } from "@/app/(catalog)/actions";
import { Alert, Button, Card } from "@/app/(catalog)/ui";
import { flatHandleOf } from "@/lib/catalog/page-types";

/**
 * A box for the product's own web page under every product's name.
 *
 * Paste a link and "Read the pages" takes the description, the details list and the pictures from
 * it. A product with nothing pasted is left exactly as it was, and the rest carry on. A ski's
 * package has no box of its own: it is the same ski, so it is read from the ski's page. Nor has a
 * product the shop already lists: that is a quantity update of a listing with a page of its own,
 * and only the new products are asked.
 */
interface Row { id: string; title: string; handle: string; url: string; status: string; inShop: boolean }

/** Where a product's link stands, on this page as it is now. */
type Stand = "none" | "saved" | "read" | "failed";
const standOf = (status: string, url: string): Stand =>
  !url ? "none" : status === "PAGE" || status === "PAGE_UNSURE" ? "read" : status === "LINK_FAILED" ? "failed" : "saved";

export function LinksPanel({ batchId, products, locked }: { batchId: string; products: Row[]; locked: boolean }) {
  const router = useRouter();
  void batchId;
  // Packages are read from the ski they are made from, so only the ski is asked for a link; and a
  // product the shop already lists keeps the page it has, so only the new products are asked.
  const handles = new Set(products.map((p) => p.handle));
  const fresh = products.filter((p) => !p.inShop);
  const updates = products.length - fresh.length;
  const own = fresh.filter((p) => flatHandleOf(p.handle) === p.handle || !handles.has(flatHandleOf(p.handle)));

  const [urls, setUrls] = useState<Record<string, string>>(() => Object.fromEntries(own.map((p) => [p.id, p.url])));
  const [stand, setStand] = useState<Record<string, Stand>>(() => Object.fromEntries(own.map((p) => [p.id, standOf(p.status, p.url)])));
  const [said, setSaid] = useState<Record<string, { tone: "ok" | "warn" | "bad"; text: string }>>({});
  const [reading, setReading] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; of: number } | null>(null);
  const [open, setOpen] = useState(true);
  const saved = useRef<Record<string, string>>(Object.fromEntries(own.map((p) => [p.id, p.url])));

  const linked = own.filter((p) => (urls[p.id] ?? "").trim() !== "");
  const unread = linked.filter((p) => stand[p.id] === "saved" || stand[p.id] === "failed");

  async function save(id: string): Promise<boolean> {
    const value = (urls[id] ?? "").trim();
    if (value === (saved.current[id] ?? "").trim()) return true;
    const r = await setProductLinkAction(id, value);
    if (!r.ok) { setSaid((s) => ({ ...s, [id]: { tone: "bad", text: r.error } })); return false; }
    saved.current[id] = r.data!.url;
    setUrls((u) => ({ ...u, [id]: r.data!.url }));
    setStand((s) => ({ ...s, [id]: r.data!.url ? "saved" : "none" }));
    setSaid((s) => ({ ...s, [id]: { tone: "ok", text: r.data!.url ? "Link saved — not read yet." : "" } }));
    return true;
  }

  async function readAll() {
    // What is waiting; or, when everything has been read, all of it again.
    const todo = unread.length > 0 ? unread : linked;
    if (todo.length === 0) return;
    setProgress({ done: 0, of: todo.length });
    let done = 0;
    // Two at a time: each is a page fetch and a read by the model, and each is its own request.
    let next = 0;
    const worker = async () => {
      for (let i = next++; i < todo.length; i = next++) {
        const p = todo[i];
        setReading(p.id);
        if (await save(p.id)) {
          const r = await readProductLinkAction(p.id);
          const ok = r.ok && r.data!.ok;
          setStand((s) => ({ ...s, [p.id]: ok ? "read" : "failed" }));
          setSaid((s) => ({ ...s, [p.id]: !r.ok ? { tone: "bad", text: r.error } : { tone: ok ? (/does not clearly match/.test(r.data!.said) ? "warn" : "ok") : "bad", text: r.data!.said } }));
          // The ski's package was read in the same go.
          if (ok) for (const id of r.data!.also) setStand((s) => (id in s ? { ...s, [id]: "read" } : s));
        }
        done++;
        setProgress({ done, of: todo.length });
      }
    };
    await Promise.all([worker(), worker()]);
    setReading(null);
    setProgress(null);
    router.refresh();
  }

  const read = linked.filter((p) => stand[p.id] === "read").length;

  return (
    <Card
      className="mb-4"
      title={<>Product pages <span className="font-normal text-[var(--ink-soft)]">· {linked.length} of {own.length} new product{own.length === 1 ? "" : "s"} have a link{updates > 0 ? ` · ${updates} quantity update${updates === 1 ? "" : "s"} keep the page they have` : ""}</span></>}
      actions={<>
        <Button size="sm" variant="primary" disabled={locked || progress !== null || linked.length === 0} onClick={() => void readAll()}>
          {progress ? `Reading ${progress.done} of ${progress.of}…` : unread.length > 0 ? `Read ${unread.length} page${unread.length === 1 ? "" : "s"}` : "Read the pages again"}
        </Button>
        <Button size="sm" onClick={() => setOpen(!open)}>{open ? "Hide" : "Show"}</Button>
      </>}
    >
      <p className="mb-3 text-xs text-[var(--ink-soft)]">
        {own.length === 0
          ? <>Every product here is one the shop already lists, so each keeps the page it has. Nothing to link.</>
          : <>Paste each new product&rsquo;s own page under its name and its description, details and pictures are taken from it. A product with no link is left exactly as it is. Open the page with the colour you have selected before copying the link: the pictures are taken of that colour, and the read is told the product&rsquo;s colours so it leaves the others&rsquo; pictures alone.</>}
        {read > 0 && <> {read} read so far.</>}
      </p>
      {open && (
        <ul className="max-h-[28rem] space-y-3 overflow-auto pr-1">
          {own.map((p) => {
            const note = said[p.id];
            return (
              <li key={p.id}>
                <div className="text-sm font-medium">{p.title}</div>
                <input
                  id={`link-${p.id}`}
                  type="url"
                  inputMode="url"
                  value={urls[p.id] ?? ""}
                  disabled={locked || reading === p.id}
                  placeholder="Link to this product's page, with your colour selected (optional)"
                  onChange={(e) => setUrls((u) => ({ ...u, [p.id]: e.target.value }))}
                  onBlur={() => void save(p.id)}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-sm outline-none focus:border-[var(--violet)] focus:ring-2 focus:ring-[var(--violet-soft)] disabled:bg-neutral-50"
                />
                {reading === p.id && <div className="mt-1 text-xs text-[var(--ink-soft)]">Reading the page…</div>}
                {reading !== p.id && note?.text && <div className={note.tone === "bad" ? "mt-1 text-xs text-red-700" : note.tone === "warn" ? "mt-1 text-xs text-amber-800" : "mt-1 text-xs text-[var(--ink-soft)]"}>{note.text}</div>}
                {reading !== p.id && !note?.text && stand[p.id] === "failed" && <div className="mt-1 text-xs text-red-700">The link could not be read last time. Check it, or paste the description in by hand.</div>}
                {reading !== p.id && !note?.text && stand[p.id] === "read" && <div className="mt-1 text-xs text-[var(--ink-soft)]">Read.</div>}
              </li>
            );
          })}
        </ul>
      )}
      {linked.length === 0 && <Alert tone="info" className="mt-3">Nothing to read yet — products without a link go ahead as they are.</Alert>}
    </Card>
  );
}
