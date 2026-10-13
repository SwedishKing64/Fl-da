"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { readBillAction } from "@/app/(catalog)/actions";
import { Alert, Button, Card, Details, INPUT, cx } from "@/app/(catalog)/ui";
import { fitsUpload, shrinkImage, tooBig } from "@/app/(catalog)/shrink";
import { DEFAULT_OPTIONS, billsFileName, checkBill, lineAmount, quickBooksWorkbook, type Bill, type BillLine, type QuickBooksOptions } from "@/lib/catalog/bills/quickbooks";

/**
 * Supplier invoices in, the shop's QuickBooks bill sheet out.
 *
 * Each invoice is read for the books — supplier, number, dates, goods, freight, GST, total — and
 * shown as a bill to check: every figure is a box, what does not add up is said beside it, and
 * the file is written only from what is on the screen, one row per bill in the layout the shop
 * gave. The category the bills go to is set once and remembered in this browser.
 */

const read = (file: File | Blob, name = "that file") => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(",", 2)[1] ?? "");
  r.onerror = () => reject(new Error(`Could not read ${name}`));
  r.readAsDataURL(file);
});

// A new key, so an account remembered for the old layout does not stand in for the category.
const REMEMBERED = "rubin.quickbooks.sheet";

/**
 * The QuickBooks side of it, kept in this browser. Read through a store so the page renders with
 * the defaults on the server and takes the kept values once it is on screen; a private window
 * that keeps nothing still works for the visit, from memory.
 */
let inMemory = "";
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => { listeners.add(cb); window.addEventListener("storage", cb); return () => { listeners.delete(cb); window.removeEventListener("storage", cb); }; };
const snapshot = (): string => { try { return localStorage.getItem(REMEMBERED) ?? inMemory; } catch { return inMemory; } };
const serverSnapshot = (): string => "";
function rememberedOptions(kept: string): QuickBooksOptions {
  try { return kept ? { ...DEFAULT_OPTIONS, ...(JSON.parse(kept) as Partial<QuickBooksOptions>) } : DEFAULT_OPTIONS; } catch { return DEFAULT_OPTIONS; }
}
function remember(next: QuickBooksOptions) {
  inMemory = JSON.stringify(next);
  try { localStorage.setItem(REMEMBERED, inMemory); } catch { /* not kept past this visit */ }
  listeners.forEach((cb) => cb());
}
const SMALL = "rounded border border-[var(--line-soft)] bg-white px-1.5 py-1 text-xs outline-none focus:border-[var(--meta)]";
const money = (n: number | null): string => (n === null || !Number.isFinite(n) ? "" : n.toFixed(2));
const toNumber = (value: string, was: number | null): number | null => {
  if (value.trim() === "") return null;
  const n = Number(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : was;
};
const blankLine = (): BillLine => ({ description: "", quantity: null, unitPrice: null, amount: null, gst: null, kind: "goods" });

type HeadKey = "supplier" | "billNo" | "billDate" | "dueDate" | "terms" | "currency" | "memo";
type TotalKey = "subtotal" | "freight" | "gst" | "total";

export function BillsPanel({ aiEnabled }: { aiEnabled: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [onePerInvoice, setOnePerInvoice] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [bills, setBills] = useState<Bill[]>([]);
  const options = rememberedOptions(useSyncExternalStore(subscribe, snapshot, serverSnapshot));
  const [saved, setSaved] = useState<string | null>(null);
  const setOption = <K extends keyof QuickBooksOptions>(key: K, value: QuickBooksOptions[K]) => remember({ ...options, [key]: value });

  async function readInvoices() {
    if (files.length === 0) return;
    setBusy(true); setError(null); setSaved(null);
    try {
      // One invoice per file, or every file a page of one invoice.
      const groups: File[][] = onePerInvoice ? files.map((f) => [f]) : [files];
      const got: Bill[] = [];
      for (const [i, group] of groups.entries()) {
        const sent: Array<{ name: string; type: string; base64: string }> = [];
        for (const file of group) {
          setProgress(`Preparing ${file.name}…`);
          const small = await shrinkImage(file);
          if (!fitsUpload(small.file.size)) { setError(tooBig(file, small.file.size)); return; }
          sent.push({ name: file.name, type: small.file.type || file.type, base64: await read(small.file, file.name) });
        }
        setProgress(groups.length === 1 ? "Reading the invoice…" : `Reading invoice ${i + 1} of ${groups.length}…`);
        const r = await readBillAction({ files: sent });
        if (!r.ok) { setError(`${group.map((f) => f.name).join(", ")}: ${r.error}`); continue; }
        got.push(r.data!);
      }
      setBills((b) => [...b, ...got]);
      setFiles([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false); setProgress("");
    }
  }

  const edit = (i: number, change: (b: Bill) => Bill) => setBills((all) => all.map((b, k) => (k === i ? change(b) : b)));
  const editLine = (i: number, k: number, change: (l: BillLine) => BillLine) => edit(i, (b) => ({ ...b, lines: b.lines.map((l, n) => (n === k ? change(l) : l)) }));

  async function download() {
    if (bills.length === 0) return;
    setError(null);
    let sheet: ArrayBuffer;
    try { sheet = await quickBooksWorkbook(bills, options); } catch (err) { setError(err instanceof Error ? err.message : String(err)); return; }
    const name = billsFileName(bills);
    const url = URL.createObjectURL(new Blob([sheet], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const link = document.createElement("a");
    link.href = url; link.download = name;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setSaved(name);
  }

  const problems = bills.map(checkBill);

  return (
    <div className="space-y-4">
      {!aiEnabled && <Alert tone="warning">No API key is set, so an invoice cannot be read. Add <strong>ANTHROPIC_API_KEY</strong> in Settings.</Alert>}

      <Card title="The invoices">
        <p className="mb-3 text-xs text-[var(--ink-soft)]">
          A PDF, a photo, an iPhone HEIC, or a spreadsheet. Each is read for the books — the supplier, the invoice number, the dates, the goods, the freight, the GST and the total — and comes up below as a bill to check before it goes in the file.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button icon="🧾" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>{files.length > 0 ? "Choose different files" : "Choose the invoices"}</Button>
          <input ref={fileRef} type="file" multiple accept="image/*,.heic,.heif,.pdf,application/pdf,.csv,.xlsx,.xls" className="hidden" onChange={(e) => { setFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
          {files.length > 0 && <span className="text-sm text-[var(--ink-soft)]">{files.map((f) => f.name).join(", ")}</span>}
        </div>
        {files.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="radio" name="bills-grouping" checked={onePerInvoice} onChange={() => setOnePerInvoice(true)} /> Each file is its own invoice</label>
            <label className="flex items-center gap-2"><input type="radio" name="bills-grouping" checked={!onePerInvoice} onChange={() => setOnePerInvoice(false)} /> These are the pages of one invoice</label>
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button variant="primary" icon="✨" disabled={busy || files.length === 0 || !aiEnabled} onClick={() => void readInvoices()}>{busy ? progress || "Reading…" : files.length > 1 && onePerInvoice ? `Read the ${files.length} invoices` : "Read the invoice"}</Button>
          {busy && <span className="text-xs text-[var(--ink-soft)]">An invoice takes a minute or so.</span>}
        </div>
        {error && <Alert tone="danger" className="mt-3">{error}</Alert>}
      </Card>

      <Details summary="How the bills are written for QuickBooks" hint="One row per bill: Supplier, Bill no., Bill date, Due date, Category, Description, Amount with GST in it, GST. This browser remembers the category.">
        <label className="block max-w-md text-sm">
          <span className="text-xs font-medium text-[var(--ink-soft)]">Category the bills go to</span>
          <input id="qb-category" className={cx(INPUT, "mt-1")} value={options.category} onChange={(e) => setOption("category", e.target.value)} placeholder={DEFAULT_OPTIONS.category} />
        </label>
        <p className="mt-3 text-xs text-[var(--ink-soft)]">The supplier and the category have to exist in QuickBooks under these names; the import matches them by name and lets you map any it cannot find. The amount is the whole invoice, freight and GST in it.</p>
      </Details>

      {bills.map((bill, i) => {
        const wrong = problems[i];
        return (
          <Card
            key={`${bill.source}-${i}`}
            title={<>{bill.supplier || "Bill"}{bill.billNo ? <span className="font-normal text-[var(--ink-soft)]"> · {bill.billNo}</span> : ""}{bill.total !== null ? <span className="font-normal text-[var(--ink-soft)]"> · {bill.currency} {money(bill.total)}</span> : ""}</>}
            actions={<>
              <span className="text-xs text-[var(--ink-soft)]">from {bill.source}</span>
              <Button size="sm" icon="🗑️" onClick={() => setBills((all) => all.filter((_, k) => k !== i))}>Remove</Button>
            </>}
          >
            {wrong.length > 0 && (
              <Alert tone="warning" className="mb-3">
                <ul className="list-disc pl-5">{wrong.map((w, k) => <li key={k}>{w}</li>)}</ul>
              </Alert>
            )}
            <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              {([
                ["supplier", "Supplier, as QuickBooks knows them", "lg:col-span-2"],
                ["billNo", "Bill number", ""],
                ["currency", "Currency", ""],
                ["billDate", "Bill date (YYYY-MM-DD)", ""],
                ["dueDate", "Due date (empty: from the terms)", ""],
                ["terms", "Terms", ""],
                ["memo", "Memo", ""],
              ] as Array<[HeadKey, string, string]>).map(([key, label, span]) => (
                <label key={key} className={cx("block", span)}>
                  <span className="text-xs font-medium text-[var(--ink-soft)]">{label}</span>
                  <input className={cx(INPUT, "mt-1")} value={bill[key]} onChange={(e) => edit(i, (b) => ({ ...b, [key]: e.target.value }))} />
                </label>
              ))}
            </div>
            <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
              {([["subtotal", "Goods before GST"], ["freight", "Freight before GST"], ["gst", "GST"], ["total", "Total payable"]] as Array<[TotalKey, string]>).map(([key, label]) => (
                <label key={key} className="block">
                  <span className="text-xs font-medium text-[var(--ink-soft)]">{label}</span>
                  <input className={cx(INPUT, "mt-1 tabular-nums")} value={money(bill[key])} onChange={(e) => edit(i, (b) => ({ ...b, [key]: toNumber(e.target.value, b[key]) }))} />
                </label>
              ))}
              <label className="block">
                <span className="text-xs font-medium text-[var(--ink-soft)]">GST on the invoice</span>
                <select className={cx(INPUT, "mt-1")} value={bill.gstTreatment} onChange={(e) => edit(i, (b) => ({ ...b, gstTreatment: e.target.value as Bill["gstTreatment"] }))}>
                  <option value="EXCLUSIVE">Added on top of the prices</option>
                  <option value="INCLUSIVE">Included in the prices</option>
                  <option value="NONE">None — overseas, or GST free</option>
                  <option value="UNKNOWN">Not sure</option>
                </select>
              </label>
            </div>
            <Details className="mt-3" summary={`The lines · ${bill.lines.length}`} hint="For checking; the file carries the whole bill as one row.">
              <div className="overflow-auto rounded-lg border border-[var(--line-soft)]">
                <table className="w-full text-xs">
                  <thead className="bg-[var(--meta-tint)] text-left">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">Description</th>
                      <th className="px-2 py-1.5 font-medium">Qty</th>
                      <th className="px-2 py-1.5 font-medium">Unit price</th>
                      <th className="px-2 py-1.5 font-medium">Amount</th>
                      <th className="px-2 py-1.5 font-medium">GST</th>
                      <th className="px-2 py-1.5 font-medium">Kind</th>
                      <th className="px-2 py-1.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {bill.lines.map((l, k) => (
                      <tr key={k} className="border-t border-[var(--line-soft)] align-top">
                        <td className="px-1 py-1"><input className={cx(SMALL, "min-w-[18rem]")} value={l.description} onChange={(e) => editLine(i, k, (x) => ({ ...x, description: e.target.value }))} /></td>
                        <td className="px-1 py-1"><input className={cx(SMALL, "w-14")} value={l.quantity ?? ""} onChange={(e) => editLine(i, k, (x) => ({ ...x, quantity: toNumber(e.target.value, x.quantity) }))} /></td>
                        <td className="px-1 py-1"><input className={cx(SMALL, "w-24")} value={money(l.unitPrice)} onChange={(e) => editLine(i, k, (x) => ({ ...x, unitPrice: toNumber(e.target.value, x.unitPrice) }))} /></td>
                        <td className="px-1 py-1"><input className={cx(SMALL, "w-24")} value={money(lineAmount(l))} onChange={(e) => editLine(i, k, (x) => ({ ...x, amount: toNumber(e.target.value, x.amount) }))} /></td>
                        <td className="px-1 py-1"><input className={cx(SMALL, "w-20")} value={money(l.gst)} onChange={(e) => editLine(i, k, (x) => ({ ...x, gst: toNumber(e.target.value, x.gst) }))} /></td>
                        <td className="px-1 py-1">
                          <select className={SMALL} value={l.kind} onChange={(e) => editLine(i, k, (x) => ({ ...x, kind: e.target.value as BillLine["kind"] }))}>
                            <option value="goods">goods</option><option value="freight">freight</option><option value="other">other</option>
                          </select>
                        </td>
                        <td className="px-1 py-1"><Button size="sm" onClick={() => edit(i, (b) => ({ ...b, lines: b.lines.filter((_, n) => n !== k) }))}>Remove</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button className="mt-2" size="sm" icon="➕" onClick={() => edit(i, (b) => ({ ...b, lines: [...b.lines, blankLine()] }))}>Add a line</Button>
            </Details>
          </Card>
        );
      })}

      {bills.length > 0 && (
        <Card title={<>The file for QuickBooks <span className="font-normal text-[var(--ink-soft)]">· {bills.length} bill{bills.length === 1 ? "" : "s"}</span></>} actions={<Button variant="primary" icon="⬇️" onClick={() => void download()}>Download for QuickBooks</Button>}>
          {problems.some((p) => p.length > 0) && <Alert tone="warning" className="mb-3">{problems.filter((p) => p.length > 0).length} of the bills have something to check, marked above. They are still written; fix them here or in QuickBooks after.</Alert>}
          {saved && <Alert tone="success" className="mb-3">Saved {saved}.</Alert>}
          <p className="text-xs text-[var(--ink-soft)]">
            A spreadsheet in the shop&rsquo;s layout, one row per bill. In QuickBooks Online: <strong>Settings → Import data → Bills</strong>, choose the file, match the columns, and say the amounts are inclusive of tax. QuickBooks takes up to 100 bills in one file, and the suppliers and the category have to exist there first.
          </p>
        </Card>
      )}
    </div>
  );
}
