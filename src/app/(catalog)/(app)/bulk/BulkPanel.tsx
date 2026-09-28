"use client";

import { useRef, useState } from "react";
import { logAdjustmentAction, planAdjustmentAction, readInstructionSheetAction, readInvoiceAction, readReferenceAction, readSheetAgainstFilesAction } from "@/app/(catalog)/actions";
import { applyPlan, describeFile, foldPlans, isWholeFile, whyNoMatch, type AdjustResult, type FoldStep, type Plan } from "@/lib/catalog/adjust";
import { csvFilename } from "@/lib/catalog/csv";
import { reconcile, type InvoiceFields, type Reconciliation } from "@/lib/catalog/reconcile";
import { buildDelivery } from "@/lib/catalog/delivery";
import type { CanonicalLineItem } from "@/lib/catalog/types";
import type { InvoiceRead } from "@/lib/catalog/invoice";
import { fitsUpload, looksLikeImage, shrinkImage, tooBig } from "@/app/(catalog)/shrink";
import { Alert, Button, Card, INPUT, cx } from "@/app/(catalog)/ui";
import { ChangedCells } from "./ChangedCells";

/**
 * Bulk changes to products the shop already sells.
 *
 * Several exports at once, because the catalogue comes out of Shopify in pieces — a file per
 * collection, or per search — and the season's changes cut across them.
 *
 * Instructions arrive two ways: typed, or as the buyer's sheet. A sheet is read against the files
 * that are actually loaded and laid out by product group. A season's sheet covers the whole shop
 * and an export is usually one corner of it, so the rows that cannot touch anything loaded are set
 * aside rather than walked through, and a shelf's worth of rows is approved together — being
 * walked through thirty-nine rows to apply three is most of the work of doing it by hand.
 *
 * Nothing is applied unseen: every row shows what it would change before it runs, and the check
 * that proves nothing moved except what was asked for runs per row however many are approved at
 * once. A group buys one approval and one undo, never a weaker check.
 *
 * Files are read, changed and saved in the browser. A catalogue export runs to megabytes, past
 * what a serverless request will take, and never needs to leave the machine — only the vendors,
 * types and tags go to the server, which is all an instruction needs to be grounded in.
 */
interface Sheet {
  name: string;
  /** The file as it stands, and the state before each applied step so any can be undone. */
  csv: string;
  history: string[];
  products: number;
  variantRows: number;
  vendors: string[];
  types: string[];
  tags: string[];
}

/** One row of the buyer's sheet, as read against the loaded files. */
interface Row {
  id: number;
  instruction: string;
  group: string;
  relevant: boolean;
  why: string;
  plan: Plan | null;
  understood: string;
  unclear: string;
  blocked: string[];
  described: string[];
  failed: string;
  state: "ready" | "applied" | "skipped";
  results: Array<{ name: string; result: AdjustResult }>;
}

interface Applied {
  title: string; lines: string[]; changes: number; matched: number; steps: number;
  /** Cells and rows are counted apart. A row written on the end of the file is not a cell that
   *  moved, and adding the two together made the badge say "20 cells" over a diff showing 17. */
  perFile: Array<{ name: string; changes: number; rowsAdded?: number }>;
}

/** An invoice as read. How it matches is worked out from the files as they stand, never stored. */
interface Invoice extends InvoiceRead {
  filename: string;
  source: string;
}

type Against = Array<{ name: string; reconciliation: Reconciliation }>;

/** A spec sheet or barcode list, to look the order's products up in. */
interface Reference { filename: string; rows: CanonicalLineItem[]; columns: string[]; warnings: string[] }
interface Preview { instruction: string; plan: Plan; understood: string; unclear: string; blocked: string[]; described: string[]; results: Array<{ name: string; result: AdjustResult }> }

const read = (file: File | Blob, name = "that file") => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(",", 2)[1] ?? "");
  r.onerror = () => reject(new Error(`Could not read ${name}`));
  r.readAsDataURL(file);
});

/** What a row would do to the files as they stand right now. */
const measure = (row: Row, csvs: Array<{ name: string; csv: string }>): Array<{ name: string; result: AdjustResult }> =>
  row.plan && row.state === "ready" && row.blocked.length === 0
    ? csvs.map((s) => ({ name: s.name, result: applyPlan(s.csv, row.plan as Plan) }))
    : [];

/**
 * How many of an invoice's lines were placed, counted once each.
 *
 * Summing the per-file matches would count a product twice when two exports both hold it — which
 * they do, because the catalogue comes out of Shopify in overlapping pieces.
 */
const placedLines = (against: Against): number =>
  new Set(against.flatMap((a) => a.reconciliation.matched.map(
    (m) => [m.line.barcode, m.line.sku, m.line.size ?? "", m.line.colour ?? ""].join("\u0000"),
  ))).size;

/** Lines that found their product but a size it does not list — a variant to be added, not a product. */
const sizesMissing = (r: Reconciliation) => r.matched.filter((m) => m.sizeMissing);

/**
 * Why nothing matched, in the terms of the two documents rather than "0 matched".
 *
 * There are only three answers and they need different things done about them, so it says which.
 */
function whyNothing(invoice: Invoice, against: Against): string {
  const keys = against[0]?.reconciliation.keys;
  if (!keys) return "Load an export from Shopify above and the invoice will be matched against it.";
  if (keys.invoiceBarcodes === 0 && keys.invoiceSkus === 0) {
    return `No line on ${invoice.filename} carries a barcode or an item code, so there is nothing to match on. An order form that lists only model names cannot be placed automatically.`;
  }
  if (keys.invoiceBarcodes === 0 && keys.fileSkus === 0) {
    return `${invoice.filename} identifies its lines by item code (${keys.invoiceSkus} of them) and your export carries no SKUs at all — this shop keeps barcodes instead. Ask the supplier for the order with EANs on it, or add the barcodes to the products in Shopify.`;
  }
  if (keys.fileBarcodes === 0 && keys.fileSkus === 0) {
    return "The loaded exports carry neither barcodes nor SKUs, so there is nothing on them to match an invoice against.";
  }
  return `Both documents carry codes — ${keys.invoiceBarcodes} barcodes and ${keys.invoiceSkus} item codes on the invoice, ${keys.fileBarcodes} and ${keys.fileSkus} on the exports — and none of them are the same. This is usually next season's goods, which the shop does not list yet.`;
}

/** The matches made on wording rather than a code — the ones worth a person's eye. */
const byName = (r: Reconciliation) => r.matched.filter((m) => m.key === "name");

const countChanges = (results: Array<{ result: AdjustResult }>) => results.reduce((n, r) => n + r.result.changes.length, 0);
const countMatched = (results: Array<{ result: AdjustResult }>) => results.reduce((n, r) => n + r.result.matched, 0);

export function BulkPanel({ aiEnabled }: { aiEnabled: boolean }) {
  const csvRef = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<HTMLInputElement>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [feed, setFeed] = useState<Applied[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [sheetNote, setSheetNote] = useState<{ source: string; ignored: string[]; unclear: string } | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [confirmedWhole, setConfirmedWhole] = useState<number[]>([]);

  const invoiceRef = useRef<HTMLInputElement>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  /**
   * Which of an invoice's numbers to write.
   *
   * The recommended retail and the count are ticked; the selling price is not, and that is the
   * decision this control exists to put in front of someone. A new season's RRP belongs in Compare
   * At whatever else is true. Writing it into the price as well is right for a product at full
   * price and wrong for one in the middle of a sale — it ends the sale, silently, on every product
   * the invoice touched. So it is a tick someone makes, not a default they discover afterwards.
   */
  const [fields, setFields] = useState<InvoiceFields>({ rrp: true, price: false, quantity: true });
  /**
   * Which season the delivery is for.
   *
   * An order form never says. The catalogue carries three at once — "M7 Mantra" is eight listings,
   * 2025, 2026 and 2027 each as a flat ski and as a package — so without this a line that is
   * perfectly clear to the person who signed the order matches eight products and is refused.
   */
  const [season, setSeason] = useState("");
  /**
   * How a count on the invoice is meant: stock arriving, or the number there now.
   *
   * Arriving, by default, because that is what the documents this page reads ARE. Writing an
   * invoice's 3 into a cell that holds 2 does not record a delivery — it tells Shopify the shop has
   * three, and the two already on the shelf stop existing without anybody being told.
   */
  const [stock, setStock] = useState<"add" | "set">("add");
  /** The brand, for the products that have to be built. An order form seldom repeats it per line. */
  const [vendor, setVendor] = useState("");
  /** Whether the lines that are not in the shop yet get built onto the end of the file. */
  const [buildNew, setBuildNew] = useState(true);
  const referenceRef = useRef<HTMLInputElement>(null);
  const [references, setReferences] = useState<Reference[]>([]);

  const [instruction, setInstruction] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<"files" | "sheet" | "invoice" | "reference" | "planning" | "applying" | null>(null);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [confirmWholeFile, setConfirmWholeFile] = useState(false);
  /** Which file's changes are open. One at a time: two diffs side by side is two files to read. */
  const [opened, setOpened] = useState<string | null>(null);

  async function takeCsvs(files: FileList | File[]) {
    setBusy("files"); setError(null); setPreview(null); setSaved(null);
    const added: Sheet[] = [];
    const rejected: string[] = [];
    try {
      /**
       * A file that is plainly not a Shopify export is not "no products found".
       *
       * This is the first box on the page and the obvious place to drop anything, so it used to
       * filter every other kind out of the picker — which is how a PNG, a JPEG and an XLSX all
       * came to be unselectable. It now takes whatever it is given and hands the rest to the
       * reader that wants it, rather than making somebody find the right box first.
       */
      const misplaced: File[] = [];
      for (const file of Array.from(files)) {
        if (looksLikeImage(file) || /\.(pdf|xlsx?)$/i.test(file.name)) { misplaced.push(file); continue; }
        const csv = await file.text();
        const f = describeFile(csv);
        if (f.products === 0) { rejected.push(file.name); continue; }
        added.push({ name: file.name, csv, history: [], ...f });
      }
      if (added.length === 0 && misplaced.length === 0) {
        setError(`No products found in ${rejected.join(", ") || "that file"}. These should be Shopify product exports — Products → Export in Shopify admin.`);
        return;
      }
      if (rejected.length) setError(`Skipped ${rejected.join(", ")} — no products in ${rejected.length === 1 ? "it" : "them"}.`);
      // Replacing a file already loaded rather than holding two copies of it.
      if (added.length > 0) {
        setSheets((s) => [...s.filter((x) => !added.some((a) => a.name === x.name)), ...added]);
        setFeed([]);
        // The sheet was matched against the files that were loaded then, so it no longer holds.
        setRows([]); setSheetNote(null);
      }
      // Anything that is not an export goes to the reader that wants it, rather than being
      // refused for being in the wrong box.
      if (misplaced.length > 0) await routeToInvoice(misplaced);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  /**
   * Send a file dropped on the exports box to the reader it belongs to.
   *
   * Only one at a time is read — an invoice is one document, and two dropped together is almost
   * always a mistake worth naming rather than a batch worth running.
   */
  async function routeToInvoice(files: File[]) {
    if (files.length > 1) {
      setError(`${files.map((f) => f.name).join(", ")} — one invoice at a time. ${files[0].name} was read; add the others after it.`);
    }
    await takeInvoice(files[0]);
  }

  /**
   * Plan a sheet's rows a few at a time, one request per chunk.
   *
   * The whole sheet used to go in ONE request, and this page gives a request sixty seconds. A
   * seventy-row sheet is seventy calls to the reading service; on a busy day, with the retries that
   * rides out, that ran past the minute and the request was killed — taking every row still waiting
   * with it, which is how a sheet came back with rows simply missing. Eight rows fit comfortably
   * inside the minute, a chunk that fails costs only its own eight rows, and the rest carry on.
   *
   * Sequential on purpose: Next runs one action at a time per page anyway, and sending them one
   * after another is gentler on a service that has just said it is overloaded.
   */
  async function planInChunks(instructions: string[], ids?: number[]): Promise<Row[]> {
    const CHUNK = 8;
    const merge = (pick: (s: Sheet) => string[]) => [...new Set(sheets.flatMap(pick))].sort();
    const file = {
      products: sheets.reduce((n, s) => n + s.products, 0),
      vendors: merge((s) => s.vendors), types: merge((s) => s.types), tags: merge((s) => s.tags),
    };
    const out: Row[] = [];
    for (let start = 0; start < instructions.length; start += CHUNK) {
      const part = instructions.slice(start, start + CHUNK);
      const end = Math.min(start + CHUNK, instructions.length);
      setProgress(`Reading rows ${start + 1}–${end} of ${instructions.length} against your ${sheets.length === 1 ? "file" : `${sheets.length} files`}…`);
      const idOf = (i: number) => ids?.[start + i] ?? start + i;
      const lost = (why: string): Row[] => part.map((instruction, i) => ({
        id: idOf(i), instruction, group: "", relevant: true, why: "", plan: null, understood: "", unclear: "",
        blocked: [], described: [], failed: why, state: "ready", results: [],
      }));
      try {
        const m = await readSheetAgainstFilesAction(part, file);
        if (!m.ok) { out.push(...lost(m.error)); continue; }
        out.push(...m.data!.rows.map((row, i) => ({ ...row, id: idOf(i), state: "ready" as const, results: [] })));
      } catch (err) {
        // The request itself died — timed out, or the connection dropped. Its rows are marked, not lost.
        out.push(...lost(`This group of rows did not come back from the server (${err instanceof Error ? err.message : String(err)}). Nothing was changed for them.`));
      }
    }
    return out;
  }

  /** Read again only the rows that failed, keeping every row that worked exactly where it was. */
  async function retryFailedRows() {
    const failed = rows.filter((r) => r.failed && r.state === "ready");
    if (failed.length === 0) return;
    setBusy("sheet"); setError(null);
    try {
      const again = await planInChunks(failed.map((r) => r.instruction), failed.map((r) => r.id));
      const byId = new Map(again.map((r) => [r.id, r]));
      setRows((current) => current.map((r) => {
        const fresh = byId.get(r.id);
        return fresh ? { ...fresh, results: measure(fresh, sheets) } : r;
      }));
      const still = again.filter((r) => r.failed).length;
      if (still > 0) setError(`${still} row${still === 1 ? "" : "s"} still could not be read. Nothing was changed for ${still === 1 ? "it" : "them"}.`);
    } finally {
      setBusy(null); setProgress("");
    }
  }

  /**
   * Read the buyer's sheet and lay it out against the loaded files.
   *
   * Two round trips, not forty. The sheet is split into its rows, then the whole lot is matched
   * and planned inside one server action — Next dispatches server actions one at a time per
   * client, so planning a row at a time from here would be a queue of round trips however quick
   * each one is.
   */
  async function takeSheet(file: File) {
    setBusy("sheet"); setError(null); setPreview(null); setRows([]); setSheetNote(null); setOpen(null); setConfirmedWhole([]);
    try {
      const sent = await shrinkImage(file);
      if (!fitsUpload(sent.file.size)) { setError(tooBig(file, sent.file.size)); return; }
      setProgress(sent.note ? `Reading the sheet — ${sent.note}` : "Reading the sheet…");
      const r = await readInstructionSheetAction({ name: file.name, type: sent.file.type, base64: await read(sent.file, file.name) });
      if (!r.ok) { setError(r.error); return; }
      const instructions = r.data!.instructions;
      setSheetNote({ source: `${file.name} · ${r.data!.source}`, ignored: r.data!.ignored, unclear: r.data!.unclear });
      if (instructions.length === 0) return;

      const built = await planInChunks(instructions);
      setProgress("Working out what each one would change…");
      setRows(built.map((row) => ({ ...row, results: measure(row, sheets) })));
      const lost = built.filter((r) => r.failed).length;
      if (lost > 0) setError(`${lost} of ${instructions.length} rows could not be read this time — they are marked below and nothing was changed for them. Use "Read those rows again" once the service has settled.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null); setProgress("");
    }
  }

  /**
   * Take a supplier's invoice and match it against every loaded file.
   *
   * The matching runs here, in the browser, against the files as they stand — the same as every
   * other change on this page, and for the same reason: an export runs to megabytes and never
   * needs to leave the machine. Only the invoice itself goes to the server, and only to be read.
   */
  async function takeInvoice(file: File) {
    setBusy("invoice"); setError(null); setPreview(null); setSaved(null);
    try {
      const sent = await shrinkImage(file);
      if (!fitsUpload(sent.file.size)) { setError(tooBig(file, sent.file.size)); return; }
      setProgress(sent.note ? `Reading ${file.name} — ${sent.note}` : `Reading ${file.name}…`);
      const r = await readInvoiceAction({ name: file.name, type: sent.file.type, base64: await read(sent.file, file.name) });
      if (!r.ok) { setError(r.error); setInvoice(null); return; }
      const data = r.data!;
      setInvoice({ ...data, filename: file.name });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null); setProgress("");
    }
  }

  /**
   * Take a spec sheet or a barcode list, to look the order's products up in.
   *
   * Loaded after the order, and it is searched rather than read as a delivery: it carries no
   * quantities, so nothing in it is arriving. Several can be added, because the three files Volkl
   * sends are the order, the specs and the barcodes, and Burton's delivery is the same shape.
   */
  async function takeReference(file: File) {
    setBusy("reference"); setError(null); setSaved(null);
    try {
      setProgress(`Reading ${file.name}…`);
      const r = await readReferenceAction({ name: file.name, type: file.type, base64: await read(file, file.name) });
      if (!r.ok) { setError(r.error); return; }
      const data = r.data!;
      setReferences((current) => [...current.filter((x) => x.filename !== file.name), { filename: file.name, rows: data.rows, columns: data.columns, warnings: data.warnings }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null); setProgress("");
    }
  }

  /**
   * Apply the delivery: the reorder onto the files, and what they have no room for onto the end.
   *
   * One pass per loaded file, because the catalogue comes out of Shopify in pieces and a delivery
   * cuts across them. A product only ever exists in one of those pieces, so a line either matches
   * a file or is new to all of them — and a product is only built onto a file that the delivery
   * actually touched, so a Volkl order never appends skis to the goggles export.
   */
  function applyDeliveryNow() {
    if (!invoice) return;
    if (!fields.rrp && !fields.price && !fields.quantity && !buildNew) {
      setError("Nothing was applied — tick at least one of the numbers to write, or let it build the products that are not in the shop yet.");
      return;
    }
    setBusy("applying"); setError(null); setSaved(null);

    const specs = references.flatMap((r) => r.rows);
    /**
     * Which file the new products go on: the one this delivery has the most to do with.
     *
     * Appending them to every loaded export would import the same product several times over, and
     * appending them to the first would put skis on the end of the goggles file. The file with the
     * most carry-overs in it is the one that already holds this supplier's other products.
     */
    const home = buildNew
      ? [...against].sort((a, b) => b.reconciliation.matched.length - a.reconciliation.matched.length)[0]?.name ?? null
      : null;

    const results = sheets.map((s) => ({
      name: s.name,
      result: buildDelivery(s.csv, invoice.lines, {
        season, vendor, specs,
        fields: { ...fields, stock },
        reorderOnly: s.name !== home,
      }),
    }));
    if (results.every((r) => r.result.refused)) {
      setBusy(null);
      setError("Nothing was applied. The check that nothing moves except what was asked for did not pass, which is a fault in this tool rather than anything you did.");
      return;
    }
    const nextSheets = sheets.map((s, i) => {
      const hit = results[i];
      const touched = !hit.result.refused && (hit.result.changes.length > 0 || hit.result.appended > 0);
      return { ...s, history: [...s.history, s.csv], csv: touched ? hit.result.csv : s.csv };
    });
    setSheets(nextSheets);

    const cells = results.reduce((n, r) => n + (r.result.refused ? 0 : r.result.changes.length), 0);
    const rowsAdded = results.reduce((n, r) => n + r.result.appended, 0);
    const builtProducts = results.flatMap((r) => r.result.fresh);
    const builtSizes = results.flatMap((r) => r.result.freshSizes);
    const matchedLines = placedLines(against);
    const wrote = [
      fields.rrp ? "the recommended retail into Compare At" : "",
      fields.price ? "the selling price" : "",
      fields.quantity ? (stock === "add" ? "the arriving stock onto the counts already there" : "the stock count, set to the invoice's own number") : "",
    ].filter(Boolean);
    setFeed((f) => [...f, {
      title: `${invoice.filename} — ${cells} cell${cells === 1 ? "" : "s"} changed${rowsAdded > 0 ? ` and ${rowsAdded} row${rowsAdded === 1 ? "" : "s"} added` : ""}`,
      lines: [
        `Matched ${matchedLines} of ${invoice.lines.length} line${invoice.lines.length === 1 ? "" : "s"} to products already in the shop${wrote.length ? `, and wrote ${wrote.join(", ")}` : ""}.`,
        ...builtSizes.map((x) => `Added ${x.option} to ${x.title || x.handle} — a size it has not stocked before.`),
        ...builtProducts.map((x) => `Built ${x.title} as a draft: ${x.variants.length} variant${x.variants.length === 1 ? "" : "s"}, ${x.type || "no Type"}${x.described ? ", described from the spec sheet" : ", with no description yet"}.`),
        ...results.flatMap((r) => r.result.heldBack.map((h) => `Left alone: ${h.line.title || h.line.sku} — ${h.reason}.`)),
        ...[...new Set(results.flatMap((r) => r.result.warnings))],
      ],
      changes: cells + rowsAdded,
      matched: matchedLines,
      steps: 1,
      perFile: results.map((r) => ({ name: r.name, changes: r.result.refused ? 0 : r.result.changes.length, rowsAdded: r.result.appended })),
    }]);
    setRows((current) => current.map((r) => ({ ...r, results: measure(r, nextSheets) })));
    setBusy(null);
  }

  async function workOut(text = instruction) {
    if (sheets.length === 0 || !text.trim()) return;
    setBusy("planning"); setError(null); setPreview(null); setSaved(null); setConfirmWholeFile(false);
    try {
      // One reading, grounded in everything across all the loaded files.
      const merge = (pick: (s: Sheet) => string[]) => [...new Set(sheets.flatMap(pick))].sort();
      const r = await planAdjustmentAction(text, {
        products: sheets.reduce((n, s) => n + s.products, 0),
        vendors: merge((s) => s.vendors), types: merge((s) => s.types), tags: merge((s) => s.tags),
      });
      if (!r.ok) { setError(r.error); return; }
      setPreview({
        instruction: text,
        ...r.data!,
        results: sheets.map((s) => ({ name: s.name, result: applyPlan(s.csv, r.data!.plan) })),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  /**
   * Apply a set of rows as one step.
   *
   * Each row still runs on its own and is still checked on its own — the guard that proves nothing
   * moved except what was asked for runs per row, and a row that fails it is left out and named
   * rather than quietly taking the rest down with it. What the group buys is one approval and one
   * undo, not a weaker check.
   */
  function applyRows(ids: number[], title: string) {
    const wanted = rows.filter((r) => ids.includes(r.id) && r.state === "ready" && r.plan && r.blocked.length === 0
      && (!isWholeFile((r.plan as Plan).scope) || confirmedWhole.includes(r.id)));
    if (wanted.length === 0) {
      setError("Nothing was applied — every change in that group still needs its own confirmation.");
      return;
    }

    setBusy("applying"); setError(null); setSaved(null);
    const steps: FoldStep[] = wanted.map((r) => ({ id: r.id, plan: r.plan as Plan, label: r.understood || r.instruction }));
    const out = foldPlans(sheets.map((s) => ({ name: s.name, csv: s.csv })), steps);

    if (out.applied.length === 0) {
      setBusy(null);
      setError(`Nothing was applied. ${out.refused.length} change${out.refused.length === 1 ? "" : "s"} failed the check that nothing moves except what was asked for.`);
      return;
    }

    const nextSheets = sheets.map((s, i) => ({ ...s, history: [...s.history, s.csv], csv: out.files[i].csv }));
    setSheets(nextSheets);
    setFeed((f) => [...f, {
      title, lines: out.lines, changes: out.changes, matched: out.matched, steps: out.applied.length,
      perFile: out.files.map((f2) => ({ name: f2.name, changes: f2.changes })),
    }]);
    // Everything still to come is re-measured against the files as they now stand, so a later row
    // sees what an earlier one did and a row made redundant by it reports nothing left to change.
    setRows((current) => {
      const marked = current.map((r) => (out.applied.includes(r.id) ? { ...r, state: "applied" as const, results: [] } : r));
      return marked.map((r) => ({ ...r, results: measure(r, nextSheets) }));
    });
    if (out.refused.length) {
      setError(`${out.refused.length} change${out.refused.length === 1 ? " was" : "s were"} left out — ${out.refused.length === 1 ? "it" : "they"} failed the check that nothing moves except what was asked for. Everything else in the group was applied.`);
    }
    setBusy(null);
    setPreview(null);
  }

  function apply() {
    if (!preview || preview.results.some((r) => r.result.refused) || preview.blocked.length > 0) return;
    if (isWholeFile(preview.plan.scope) && !confirmWholeFile) return;
    const before = sheets.map((s) => s.csv);
    const nextSheets = sheets.map((s, i) => {
      const hit = preview.results.find((r) => r.name === s.name);
      // Same rule as a group apply: a file this change did not touch keeps the bytes it arrived
      // with, so re-importing a file nobody changed is a true no-op.
      const touched = hit !== undefined && (hit.result.changes.length > 0 || (hit.result.preambleRemoved ?? 0) > 0);
      // Every file gets a history entry whether it moved or not, so one undo is one step back for
      // all of them. Let the lengths drift and undo starts taking files back to different moments.
      return { ...s, history: [...s.history, before[i]], csv: touched ? hit.result.csv : s.csv };
    });
    setSheets(nextSheets);
    setFeed((f) => [...f, {
      title: preview.instruction,
      lines: preview.described,
      changes: countChanges(preview.results),
      matched: countMatched(preview.results),
      steps: 1,
      perFile: preview.results.map((r) => ({ name: r.name, changes: r.result.changes.length })),
    }]);
    setRows((current) => current.map((r) => ({ ...r, results: measure(r, nextSheets) })));
    setInstruction("");
    setPreview(null);
    setConfirmWholeFile(false);
    setSaved(null);
  }

  function setRowState(id: number, state: Row["state"]) {
    setRows((current) => current.map((r) => (r.id === id ? { ...r, state, results: measure({ ...r, state }, sheets) } : r)));
  }

  function undo() {
    if (feed.length === 0) return;
    const nextSheets = sheets.map((s) => (s.history.length ? { ...s, csv: s.history[s.history.length - 1], history: s.history.slice(0, -1) } : s));
    setSheets(nextSheets);
    setFeed((f) => f.slice(0, -1));
    // The files are what was undone. Rows already marked applied stay marked — reading the sheet
    // again is the clean way to start it over.
    setRows((current) => current.map((r) => ({ ...r, results: measure(r, nextSheets) })));
    setPreview(null);
    setSaved(null);
  }

  /**
   * Hand over one file.
   *
   * The name tells the truth about the contents. A file nothing was applied to keeps its own name:
   * calling it "-updated" when it is the file that went in is how someone re-imports an afternoon
   * of work that is not in there and only finds out from the shop.
   */
  function download(sheet: Sheet) {
    const out = csvFilename(sheet.name, appliedTo(sheet.name) > 0 ? "-updated" : "");
    const url = URL.createObjectURL(new Blob([sheet.csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = out;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return out;
  }

  function downloadAll() {
    const names = sheets.filter((s) => appliedTo(s.name) > 0).map(download);
    if (names.length === 0) {
      setError("Nothing has been applied yet, so there is no updated file to download. Every file here is still the one you loaded.");
      return;
    }
    setSaved(names.join(", "));
    void logAdjustmentAction({
      instruction: feed.map((f) => f.title).join(" | "),
      described: feed.flatMap((f) => f.lines),
      matched: feed.reduce((n, f) => Math.max(n, f.matched), 0),
      products: sheets.reduce((n, s) => n + s.products, 0),
      changes: feed.reduce((n, f) => n + f.changes, 0),
      filename: names.join(", "),
    });
  }

  // How many cells have actually been written into each file. Derived from the feed rather than
  // held alongside it, so undo takes it back without a second thing to keep in step.
  const appliedTo = (name: string) => feed.reduce((n, f) => n + (f.perFile.find((p) => p.name === name)?.changes ?? 0), 0);
  /**
   * Whether a file is actually different from the one that was loaded.
   *
   * Read off the bytes rather than off the running total, because the total is bookkeeping and the
   * file is the truth. They can disagree: an undo puts the file back without unwinding the tally.
   */
  const touched = (s: Sheet) => s.history.length > 0 && s.history[0] !== s.csv;
  const rowsAddedTo = (name: string) => feed.reduce((n, f) => n + (f.perFile.find((p) => p.name === name)?.rowsAdded ?? 0), 0);
  const edited = sheets.filter(touched);

  const wholeFile = preview ? isWholeFile(preview.plan.scope) : false;
  const refused = preview?.results.some((r) => r.result.refused) === true;
  const totalChanges = countChanges(preview?.results ?? []);
  const totalMatched = countMatched(preview?.results ?? []);
  const blocked = preview !== null && preview.blocked.length > 0;
  const nothingToDo = preview !== null && !refused && !blocked && totalChanges === 0;
  const noOperations = preview !== null && preview.plan.operations.length === 0;
  const cellsSoFar = feed.reduce((n, f) => n + f.perFile.reduce((m, p) => m + p.changes, 0), 0);
  const rowsSoFar = feed.reduce((n, f) => n + f.perFile.reduce((m, p) => m + (p.rowsAdded ?? 0), 0), 0);
  const changesSoFar = cellsSoFar + rowsSoFar;
  /** "17 cells and 3 rows", or just one of them — a count is only reassuring if it is the truth. */
  const sizeOfIt = [
    cellsSoFar > 0 ? `${cellsSoFar} cell${cellsSoFar === 1 ? "" : "s"} changed` : "",
    rowsSoFar > 0 ? `${rowsSoFar} row${rowsSoFar === 1 ? "" : "s"} added` : "",
  ].filter(Boolean).join(" and ");

  // Worked out from the invoice and the files as they stand, rather than kept alongside them. Held
  // in state it would have to be put back in step after every load, removal, apply and undo, and
  // the one time it was missed it would show yesterday's match count over today's file.
  // No useMemo: the compiler memoizes this, and writing it by hand only stops it doing so.
  const against: Against = invoice
    ? sheets.map((s) => ({ name: s.name, reconciliation: reconcile(s.csv, invoice.lines, { season }) }))
    : [];
  const placed = placedLines(against);
  // What the delivery would build, counted once across the loaded files: a line is new only if no
  // file has it. Worked out from the same reconciliation the summary shows, not from a second pass.
  const toBuild = new Set(
    against.length === 0 ? [] :
      against[0].reconciliation.unmatched
        .filter((line) => against.every((a) => a.reconciliation.unmatched.includes(line)))
        .map((line) => `${line.sku}\u0000${line.title}`),
  ).size;

  // The sheet, laid out by product group. A row that cannot touch anything loaded is set aside
  // rather than queued, which is the difference between thirty-nine to go through and three.
  const relevant = rows.filter((r) => r.relevant);
  const setAside = rows.filter((r) => !r.relevant);
  const groupNames = [...new Set(relevant.map((r) => r.group || "Everything else"))];
  const groups = groupNames
    .map((name) => ({ name, rows: relevant.filter((r) => (r.group || "Everything else") === name) }))
    .sort((a, b) => b.rows.length - a.rows.length);
  const readyIn = (rs: Row[]) => rs.filter((r) => r.state === "ready" && r.plan && r.blocked.length === 0
    && countChanges(r.results) > 0
    && (!isWholeFile(r.plan.scope) || confirmedWhole.includes(r.id)));
  const allReady = readyIn(relevant);
  const stillToDo = relevant.filter((r) => r.state === "ready");

  return (
    <div className="space-y-6">
      {!aiEnabled && <Alert tone="warning">No API key is set, so instructions cannot be read. Add <strong>ANTHROPIC_API_KEY</strong> in Settings.</Alert>}

      <Card
        title="The files from Shopify"
        actions={edited.length > 0
          ? <Button size="sm" variant="primary" onClick={downloadAll}>Download the {edited.length === 1 ? "updated file" : `${edited.length} updated files`}</Button>
          : undefined}
      >
        <p className="mb-3 text-sm text-[var(--ink-soft)]">
          In Shopify: <strong>Products → Export</strong>. Add as many exports as you like — the sheet is matched against whatever is loaded, and only the changes that can touch these products are put in front of you.
        </p>
        <div className="dropzone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) void takeCsvs(e.dataTransfer.files); }}>
          <div className="text-sm font-medium text-[var(--ink)]">{busy === "files" ? "Reading…" : "Drop exports here, or choose files"}</div>
          <div className="mt-1 text-xs text-[var(--ink-soft)]">Shopify export CSVs. An invoice dropped here — a spreadsheet, a PDF or a photo — is sent to the invoice reader below rather than refused.</div>
          <div className="mt-3">
            <Button size="sm" onClick={() => csvRef.current?.click()} disabled={busy !== null}>Choose files</Button>
            <input ref={csvRef} type="file" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) void takeCsvs(e.target.files); e.target.value = ""; }} />
          </div>
        </div>
        {sheets.length > 0 && (
          <ul className="mt-3 divide-y divide-[var(--line-soft)] text-sm">
            {sheets.map((s) => (
              <li key={s.name} className="py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-medium">{s.name}</span>
                    {touched(s) ? (
                      <>
                        {appliedTo(s.name) > 0 && <span className="ml-2 rounded-full bg-[var(--violet)] px-2 py-0.5 text-[11px] font-semibold text-white tabular-nums">{appliedTo(s.name)} cells changed</span>}
                        {rowsAddedTo(s.name) > 0 && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900 tabular-nums">{rowsAddedTo(s.name)} rows added</span>}
                      </>
                    ) : <span className="ml-2 text-[11px] text-[var(--ink-soft)]">unchanged</span>}
                    <span className="ml-2 text-xs text-[var(--ink-soft)]">{s.products} products · {s.variantRows} rows · {s.types.slice(0, 4).join(", ") || s.vendors.slice(0, 4).join(", ")}{s.types.length > 4 ? ` +${s.types.length - 4}` : ""}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Before the download, not after it. Whatever is wrong with a file is cheap to
                        fix here and expensive to fix once it is in Shopify. */}
                    {touched(s) && (
                      <Button size="sm" onClick={() => setOpened((o) => (o === s.name ? null : s.name))}>
                        {opened === s.name ? "Hide the changes" : "See what changed"}
                      </Button>
                    )}
                    <Button size="sm" variant={touched(s) ? "primary" : undefined} onClick={() => setSaved(download(s))}>Download</Button>
                    <Button size="sm" variant="danger" onClick={() => { setSheets((x) => x.filter((y) => y.name !== s.name)); setPreview(null); setRows([]); setSheetNote(null); setOpened(null); }}>Remove</Button>
                  </div>
                </div>
                {opened === s.name && touched(s) && (
                  <div className="mt-3 rounded-xl border border-[var(--line-soft)] bg-[var(--canvas)] p-3">
                    <ChangedCells before={s.history[0]} after={s.csv} filename={s.name} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {error && <Alert tone="danger">{error}</Alert>}
      {saved && <Alert tone="success">Saved {saved}. Import each in Shopify admin → Products → Import, and tick <strong>Overwrite existing products</strong> so the changes apply.</Alert>}

      {sheets.length === 0 && (
        <Card title="The buyer's sheet">
          <p className="text-sm text-[var(--ink-soft)]">
            The sale sheet is read <em>against</em> the products in your exports — that is what tells a row about ski bindings from a row about goggles — so load the exports above first and this opens up.
          </p>
        </Card>
      )}

      {sheets.length > 0 && (
        <Card
          title="The buyer's sheet"
          actions={allReady.length > 0
            ? <Button size="sm" variant="primary" disabled={busy !== null} onClick={() => applyRows(allReady.map((r) => r.id), `Everything that matched — ${allReady.length} change${allReady.length === 1 ? "" : "s"}`)}>Apply all {allReady.length}</Button>
            : undefined}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm">
              <span className="font-medium">Have the changes written down?</span>
              <span className="ml-2 text-xs text-[var(--ink-soft)]">The shop&rsquo;s sale template as a spreadsheet, or a PDF or photo of a written page. A template is read column by column and exactly — no interpreting. Either way it is matched against the files above, grouped by shelf, and you approve a shelf at a time.</span>
            </div>
            <Button size="sm" disabled={busy !== null} onClick={() => sheetRef.current?.click()}>{busy === "sheet" ? "Reading…" : rows.length > 0 ? "Use a different sheet" : "Add the sale sheet"}</Button>
            <input ref={sheetRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void takeSheet(f); e.target.value = ""; }} />
          </div>

          {busy === "sheet" && progress && (
            <div className="mt-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--line-soft)]"><div className="h-full w-1/3 animate-pulse rounded-full bg-[var(--violet)]" /></div>
              <p className="mt-1.5 text-xs text-[var(--ink-soft)]">{progress}</p>
            </div>
          )}

          {rows.some((r) => r.failed && r.state === "ready") && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
              <span>
                <strong className="tabular-nums">{rows.filter((r) => r.failed && r.state === "ready").length}</strong> row{rows.filter((r) => r.failed && r.state === "ready").length === 1 ? "" : "s"} could not be read — nothing was changed for {rows.filter((r) => r.failed && r.state === "ready").length === 1 ? "it" : "them"}. The rest of the sheet is unaffected.
              </span>
              <Button size="sm" disabled={busy !== null} onClick={() => void retryFailedRows()}>{busy === "sheet" ? "Reading…" : "Read those rows again"}</Button>
            </div>
          )}
          {sheetNote && (
            <div className="mt-3 rounded-lg border border-[var(--line-soft)] bg-[var(--rubin-tint)] px-3 py-2 text-xs text-[var(--ink-soft)]">
              <strong>{sheetNote.source}</strong>
              {rows.length > 0 && (
                <span> — {relevant.length} of {rows.length} change{rows.length === 1 ? "" : "s"} can touch the loaded files, across {groups.length} group{groups.length === 1 ? "" : "s"}. {stillToDo.length} still to do.</span>
              )}
              {sheetNote.ignored.length > 0 && (
                <div className="mt-1.5">
                  <strong>Left alone ({sheetNote.ignored.length})</strong> — a heading, or a row with no year tag stated. Nothing here was changed:
                  <ul className="mt-1 list-disc pl-5">{sheetNote.ignored.map((line) => <li key={line}>{line}</li>)}</ul>
                </div>
              )}
              {sheetNote.unclear && <span className="mt-1 block text-amber-800">Could not turn into a change: {sheetNote.unclear}</span>}
            </div>
          )}

          {groups.map((g) => {
            const ready = readyIn(g.rows);
            const groupChanges = ready.reduce((n, r) => n + countChanges(r.results), 0);
            return (
              <div key={g.name} className="mt-4 rounded-xl border border-[var(--line)]">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line-soft)] px-3 py-2">
                  <div>
                    <span className="font-semibold">{g.name}</span>
                    <span className="ml-2 text-xs text-[var(--ink-soft)]">
                      {g.rows.length} change{g.rows.length === 1 ? "" : "s"}
                      {groupChanges > 0 && <> · <strong className="tabular-nums">{groupChanges}</strong> cell{groupChanges === 1 ? "" : "s"} would change</>}
                    </span>
                  </div>
                  <Button size="sm" variant="primary" disabled={busy !== null || ready.length === 0} onClick={() => applyRows(ready.map((r) => r.id), g.name)}>
                    {ready.length === 0 ? "Nothing to apply" : `Apply ${ready.length === g.rows.length ? "this group" : `${ready.length} of ${g.rows.length}`}`}
                  </Button>
                </div>
                <ul className="divide-y divide-[var(--line-soft)]">
                  {g.rows.map((r) => {
                    const changes = countChanges(r.results);
                    const matched = countMatched(r.results);
                    const whole = r.plan !== null && isWholeFile(r.plan.scope);
                    const didRefuse = r.results.some((x) => x.result.refused);
                    return (
                      <li key={r.id} className="px-3 py-2 text-sm">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <button type="button" className="flex-1 text-left" onClick={() => setOpen(open === r.id ? null : r.id)}>
                            <span className={cx("font-medium", r.state !== "ready" && "text-[var(--ink-soft)] line-through")}>{r.instruction}</span>
                            <span className="ml-2 text-xs text-[var(--ink-soft)]">
                              {r.state === "applied" ? "applied"
                                : r.state === "skipped" ? "skipped"
                                : r.failed ? r.failed
                                : r.blocked.length ? "not applied — would change more than it asks"
                                : didRefuse ? "stopped by the safety check"
                                : changes > 0 ? `${matched} product${matched === 1 ? "" : "s"} · ${changes} cell${changes === 1 ? "" : "s"}`
                                : "already done"}
                            </span>
                          </button>
                          {r.state === "ready" && <Button size="sm" onClick={() => setRowState(r.id, "skipped")}>Skip</Button>}
                          {r.state === "skipped" && <Button size="sm" onClick={() => setRowState(r.id, "ready")}>Put back</Button>}
                        </div>

                        {r.blocked.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs text-red-700">{r.blocked.map((b, i) => <li key={i}>{b}</li>)}</ul>}
                        {whole && r.state === "ready" && r.blocked.length === 0 && (
                          <label className="mt-1 flex items-center gap-2 text-xs font-medium text-red-700">
                            <input type="checkbox" checked={confirmedWhole.includes(r.id)} onChange={(e) => setConfirmedWhole((c) => (e.target.checked ? [...c, r.id] : c.filter((x) => x !== r.id)))} />
                            Nothing narrows this one — it would change every product in every file. Tick to include it.
                          </label>
                        )}
                        {open === r.id && (
                          <div className="mt-2 rounded-lg bg-[var(--rubin-tint)] px-3 py-2 text-xs">
                            {r.understood && <div className="font-medium">{r.understood}</div>}
                            <ul className="mt-1 list-disc pl-5 text-[var(--ink-soft)]">{r.described.map((line, i) => <li key={i}>{line}</li>)}</ul>
                            {r.unclear && <div className="mt-1 text-amber-800">Not sure about: {r.unclear}</div>}
                            {changes > 0 && (
                              <ul className="mt-1.5 space-y-0.5 font-mono text-[11px] text-[var(--ink-soft)]">
                                {r.results.flatMap((x) => x.result.changes.slice(0, 5).map((c, i) => (
                                  <li key={`${x.name}-${i}`}>{c.handle} · {c.column}: {c.before || "—"} → <span className="text-[var(--ink)]">{c.after || "—"}</span></li>
                                ))).slice(0, 8)}
                                {changes > 8 && <li>…and {changes - 8} more</li>}
                              </ul>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}

          {changesSoFar > 0 && (
            <div className="mt-4 rounded-xl border-2 border-[var(--violet)] bg-[var(--rubin-tint)] px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm">
                  <div className="font-semibold">Ready to import — {sizeOfIt} across {edited.length} file{edited.length === 1 ? "" : "s"}.</div>
                  <div className="mt-0.5 text-xs text-[var(--ink-soft)]">Only the files something was written into are listed. The rest are still the ones you loaded, so there is nothing to re-import for them.</div>
                </div>
                <Button variant="primary" onClick={downloadAll}>Download {edited.length === 1 ? "it" : `all ${edited.length}`}</Button>
              </div>
              <ul className="mt-2 divide-y divide-[var(--line-soft)] text-sm">
                {edited.map((s) => (
                  <li key={s.name} className="py-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        {s.name.replace(/\.csv$/i, "")}
                        <span className="ml-2 text-xs text-[var(--ink-soft)] tabular-nums">
                          {appliedTo(s.name)} cells{rowsAddedTo(s.name) > 0 ? ` · ${rowsAddedTo(s.name)} rows added` : ""}
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        {/* The same preview as the files list above, here too — this is where the
                            page leaves you after a sheet has run, a long scroll from the top. */}
                        <Button size="sm" onClick={() => setOpened((o) => (o === s.name ? null : s.name))}>
                          {opened === s.name ? "Hide the changes" : "See what changed"}
                        </Button>
                        <Button size="sm" onClick={() => setSaved(download(s))}>Download this one</Button>
                      </span>
                    </div>
                    {opened === s.name && (
                      <div className="mt-3 rounded-xl border border-[var(--line-soft)] bg-white p-3">
                        <ChangedCells before={s.history[0]} after={s.csv} filename={s.name} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {setAside.length > 0 && (
            <div className="mt-4 rounded-xl border border-dashed border-[var(--line)] px-3 py-2.5 text-xs text-[var(--ink-soft)]">
              <strong>Not for these files ({setAside.length})</strong> — nothing loaded could match {setAside.length === 1 ? "it" : "them"}. Load the export {setAside.length === 1 ? "it is" : "they are"} about and read the sheet again to bring {setAside.length === 1 ? "it" : "them"} back.
              <ul className="mt-1 list-disc pl-5">
                {setAside.map((r) => <li key={r.id}>{r.instruction}{r.why ? <span className="italic"> — {r.why}</span> : null}</li>)}
              </ul>
            </div>
          )}
        </Card>
      )}

      {/*
        * Always here, not only once an export is loaded.
        *
        * Gated, there was nowhere on a fresh page to put a PNG, a JPEG or a spreadsheet at all:
        * the only box was the exports one, which took CSVs. An invoice reads perfectly well on its
        * own — what needs the exports is the matching, and the count says so itself.
        */}
      <Card
          title="A delivery, or a supplier's invoice"
          actions={invoice ? <Button size="sm" onClick={() => { setInvoice(null); setError(null); }}>Remove it</Button> : undefined}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm">
              <span className="font-medium">A delivery arriving, or prices that have changed?</span>
              <span className="ml-2 text-xs text-[var(--ink-soft)]">Add the order form and each line is matched by barcode, then by item code, then by the product&rsquo;s name — so a line that says SX-2M finds the SX-2M. A line that fits two products is never guessed at. What it matches has its stock put up; a size the product does not list arrives as a variant of it, and a product the shop does not have is built onto the end of the same file. A spreadsheet or CSV is read by its columns; a PDF or a photo of one goes to the API to be read.</span>
            </div>
            <Button size="sm" disabled={busy !== null} onClick={() => invoiceRef.current?.click()}>{busy === "invoice" ? "Reading…" : invoice ? "Use a different invoice" : "Add the invoice"}</Button>
            <input ref={invoiceRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void takeInvoice(f); e.target.value = ""; }} />
          </div>

          {busy === "invoice" && progress && (
            <div className="mt-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--line-soft)]"><div className="h-full w-1/3 animate-pulse rounded-full bg-[var(--violet)]" /></div>
              <p className="mt-1.5 text-xs text-[var(--ink-soft)]">{progress}</p>
            </div>
          )}

          {invoice && (
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-[var(--line-soft)] px-3 py-2.5 text-sm">
                <div className="font-medium">{invoice.filename}</div>
                <div className="mt-0.5 text-xs text-[var(--ink-soft)]">
                  {invoice.lines.length} line{invoice.lines.length === 1 ? "" : "s"}, {invoice.source}.
                  {invoice.columns.rrp || invoice.columns.quantity
                    ? <> Prices from <strong>{invoice.columns.rrp || "nowhere"}</strong>, counts from <strong>{invoice.columns.quantity || "nowhere"}</strong>, matched on <strong>{invoice.columns.barcode || invoice.columns.sku || "barcode"}</strong>.</>
                    : null}
                </div>
                {invoice.warnings.map((w, i) => <p key={i} className="mt-1.5 text-xs text-[var(--ink-soft)]">{w}</p>)}
              </div>

              <ul className="divide-y divide-[var(--line-soft)] text-sm">
                {against.map((a) => {
                  const r = a.reconciliation;
                  return (
                    <li key={a.name} className="py-2">
                      <span className="font-medium">{a.name}</span>
                      <span className="ml-2 tabular-nums text-xs text-[var(--ink-soft)]">
                        {r.matched.length} matched · {r.unmatched.length} not in this file · {r.ambiguous.length} too ambiguous to place
                      </span>
                      {sizesMissing(r).length > 0 && (
                        <div className="mt-1 text-xs text-[var(--ink-soft)]">
                          <strong>{sizesMissing(r).length} {sizesMissing(r).length === 1 ? "size is" : "sizes are"} new to a product you already sell</strong> — {sizesMissing(r).length === 1 ? "it arrives" : "they arrive"} as {sizesMissing(r).length === 1 ? "a variant" : "variants"} of it, copying the settings of the sizes it already has.
                          <ul className="mt-1 list-disc pl-5">
                            {sizesMissing(r).slice(0, 4).map((m, i) => <li key={i}>{m.line.size} of {m.handle}</li>)}
                            {sizesMissing(r).length > 4 && <li>…and {sizesMissing(r).length - 4} more</li>}
                          </ul>
                        </div>
                      )}
                      {r.unmatched.length > 0 && (
                        <div className="mt-1 text-xs text-[var(--ink-soft)]">
                          <strong>{r.unmatched.length} {r.unmatched.length === 1 ? "line is" : "lines are"} not in this file</strong> — {buildNew
                            ? <>so {r.unmatched.length === 1 ? "it is built" : "they are built"} as {r.unmatched.length === 1 ? "a draft product" : "draft products"} on the end of whichever export this delivery has the most to do with.</>
                            : <>and nothing will be built, because that box is unticked. Tick it, or build {r.unmatched.length === 1 ? "it" : "them"} in <strong>Import batches</strong>.</>}
                          <ul className="mt-1 list-disc pl-5">
                            {r.unmatched.slice(0, 4).map((u, i) => <li key={i}>{u.title || u.sku}{u.size ? ` — ${u.size}` : ""}</li>)}
                            {r.unmatched.length > 4 && <li>…and {r.unmatched.length - 4} more</li>}
                          </ul>
                        </div>
                      )}
                      {byName(r).length > 0 && (
                        <div className="mt-1 rounded-lg border border-dashed border-[var(--line)] px-2.5 py-2 text-xs text-[var(--ink-soft)]">
                          <strong>{byName(r).length} matched on the name</strong>, not a barcode — worth a look, since a name is the one key that can be read two ways. A price goes on every size; a count needs a barcode or a size per line.
                          <ul className="mt-1 list-disc pl-5">
                            {byName(r).slice(0, 4).map((m, i) => (
                              <li key={i}>
                                &ldquo;{m.on}&rdquo;{m.line.size ? ` ${m.line.size}` : ""} → {m.handle}
                                {m.rows.length > 1 ? ` (all ${m.rows.length} sizes)` : ""}
                              </li>
                            ))}
                            {byName(r).length > 4 && <li>…and {byName(r).length - 4} more</li>}
                          </ul>
                        </div>
                      )}
                      {r.ambiguous.length > 0 && (
                        <ul className="mt-1 list-disc pl-5 text-xs text-[var(--ink-soft)]">
                          {[...new Map(r.ambiguous.map((x) => [x.reason, x])).values()].slice(0, 3).map((x, i) => (
                            <li key={i}>{x.line.title || x.line.sku || x.line.barcode} — {x.reason}, so it is left alone</li>
                          ))}
                          {r.ambiguous.length > 3 && <li>…and {r.ambiguous.length - 3} more</li>}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>

              <label className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--line-soft)] px-3 py-2.5 text-sm">
                <span className="font-medium">Season this delivery is for</span>
                <input
                  id="invoice-season" value={season} onChange={(e) => setSeason(e.target.value.trim())}
                  placeholder="2027" inputMode="numeric" className={cx(INPUT, "w-24 tabular-nums")}
                />
                <span className="text-xs text-[var(--ink-soft)]">An order form never says which, and the shop lists three at once — without it, &ldquo;M7 Mantra&rdquo; is eight products and gets refused.</span>
              </label>

              <label className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--line-soft)] px-3 py-2.5 text-sm">
                <span className="font-medium">Whose delivery this is</span>
                <input
                  id="invoice-vendor" value={vendor} onChange={(e) => setVendor(e.target.value)}
                  placeholder="Burton" className={cx(INPUT, "w-40")}
                />
                <span className="text-xs text-[var(--ink-soft)]">The brand, for anything that has to be built. An order form seldom repeats it on every line, and a product with no Vendor is one nobody can find by brand.</span>
              </label>

              {/* The spec sheet and the barcode list, after the order. They are searched for what
                  the order named, never read as a delivery of their own — see readReferenceAction. */}
              <div className="rounded-xl border border-[var(--line-soft)] px-3 py-2.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-medium">Spec sheets and barcode lists</span>
                    <span className="ml-2 text-xs text-[var(--ink-soft)]">Optional, and only for the products that have to be built. Burton&rsquo;s spec sheet is where their descriptions come from; a barcode list is where the EAN for each size is. Add the order first, then these &mdash; they are searched for what it named.</span>
                  </div>
                  <Button size="sm" disabled={busy !== null} onClick={() => referenceRef.current?.click()}>{busy === "reference" ? "Reading…" : references.length > 0 ? "Add another" : "Add a spec sheet"}</Button>
                  <input ref={referenceRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void takeReference(f); e.target.value = ""; }} />
                </div>
                {references.length > 0 && (
                  <ul className="mt-2 divide-y divide-[var(--line-soft)] text-xs">
                    {references.map((ref) => (
                      <li key={ref.filename} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                        <span>
                          <strong>{ref.filename}</strong> — {ref.rows.length} row{ref.rows.length === 1 ? "" : "s"}
                          {ref.columns.length > 0 && <span className="text-[var(--ink-soft)]">, read as {ref.columns.join(", ")}</span>}
                        </span>
                        <Button size="sm" onClick={() => setReferences((c) => c.filter((x) => x.filename !== ref.filename))}>Remove</Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <fieldset className="rounded-xl border border-[var(--line-soft)] px-3 py-2.5">
                <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-[var(--ink-soft)]">What to write</legend>
                <label className="flex items-start gap-2 py-1 text-sm">
                  <input type="checkbox" id="invoice-rrp" className="mt-1" checked={fields.rrp === true} onChange={(e) => setFields((f) => ({ ...f, rrp: e.target.checked }))} />
                  <span>The recommended retail, into <strong>Compare At</strong>.<span className="block text-xs text-[var(--ink-soft)]">Where this shop keeps it. Nothing a customer pays changes.</span></span>
                </label>
                <label className="flex items-start gap-2 py-1 text-sm">
                  <input type="checkbox" id="invoice-price" className="mt-1" checked={fields.price === true} onChange={(e) => setFields((f) => ({ ...f, price: e.target.checked }))} />
                  <span>The selling price too.<span className="block text-xs text-[var(--ink-soft)]">Prices the products at the new recommended retail — which <strong>ends any sale</strong> the matched products are on. Right for a straight reorder at new-season pricing; wrong in the middle of a clearance.</span></span>
                </label>
                <label className="flex items-start gap-2 py-1 text-sm">
                  <input type="checkbox" id="invoice-qty" className="mt-1" checked={fields.quantity === true} onChange={(e) => setFields((f) => ({ ...f, quantity: e.target.checked }))} />
                  <span>The stock.<span className="block text-xs text-[var(--ink-soft)]">Which of the two things below a count on this document means.</span></span>
                </label>
                {fields.quantity && (
                  <div className="ml-6 mt-1 space-y-1 rounded-lg border border-dashed border-[var(--line)] px-2.5 py-2">
                    <label className="flex items-start gap-2 text-sm">
                      <input type="radio" id="invoice-stock-add" name="invoice-stock" className="mt-1" checked={stock === "add"} onChange={() => setStock("add")} />
                      <span>Stock <strong>arriving</strong> — add it to what is there.<span className="block text-xs text-[var(--ink-soft)]">Three arriving on two already on the shelf is five. This is what a delivery or an order form is, so it is the default. Applying the same document twice would add it twice.</span></span>
                    </label>
                    <label className="flex items-start gap-2 text-sm">
                      <input type="radio" id="invoice-stock-set" name="invoice-stock" className="mt-1" checked={stock === "set"} onChange={() => setStock("set")} />
                      <span>The count <strong>as it stands now</strong> — set it to this number.<span className="block text-xs text-[var(--ink-soft)]">A stocktake, not a delivery. Anything already on the shelf that this document does not mention is replaced by its number.</span></span>
                    </label>
                  </div>
                )}
              </fieldset>

              <fieldset className="rounded-xl border border-[var(--line-soft)] px-3 py-2.5">
                <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-[var(--ink-soft)]">The lines that are not in the shop yet</legend>
                <label className="flex items-start gap-2 py-1 text-sm">
                  <input type="checkbox" id="invoice-build" className="mt-1" checked={buildNew} onChange={(e) => setBuildNew(e.target.checked)} />
                  <span>Build them onto the end of the same file, as drafts.<span className="block text-xs text-[var(--ink-soft)]">So one delivery is one file: the carry-overs have their counts put up and the new products are written after them, priced at the invoice&rsquo;s recommended retail and unpublished until somebody looks at them. A product whose URL the file already uses is never written &mdash; that would edit the product that has it &mdash; and is named instead.</span></span>
                </label>
                <p className="py-1 text-xs text-[var(--ink-soft)]">A size that is new to a product you already sell is always added, whether this is ticked or not: it is a variant of that product, not a product.</p>
              </fieldset>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="primary" disabled={busy !== null || (placed === 0 && !(buildNew && toBuild > 0))} onClick={applyDeliveryNow}>
                  {busy === "applying" ? "Working…" : `Apply the delivery — ${placed} carry-over${placed === 1 ? "" : "s"}${buildNew && toBuild > 0 ? `, ${toBuild} to build` : ""}`}
                </Button>
                {placed === 0 && !buildNew && <span className="text-xs text-[var(--ink-soft)]">{whyNothing(invoice, against)}</span>}
                {placed === 0 && buildNew && toBuild > 0 && <span className="text-xs text-[var(--ink-soft)]">Nothing on this invoice is in the loaded exports, so all of it is built. {whyNothing(invoice, against)}</span>}
              </div>
            </div>
          )}
      </Card>

      {sheets.length > 0 && (
        <Card title="One change, in your own words" actions={feed.length > 0 ? <Button size="sm" onClick={undo}>Undo last</Button> : undefined}>
          {feed.length > 0 && (
            <ol className="mb-4 space-y-2">
              {feed.map((f, i) => (
                <li key={i} className="rounded-lg border border-[var(--line-soft)] bg-[var(--rubin-tint)] px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{i + 1}. {f.title}</span>
                    <span className="text-xs text-[var(--ink-soft)]">{f.steps} change{f.steps === 1 ? "" : "s"} · {f.changes} cell{f.changes === 1 ? "" : "s"}</span>
                  </div>
                  <ul className="mt-1 list-disc pl-5 text-xs text-[var(--ink-soft)]">
                    {f.lines.slice(0, 6).map((line, j) => <li key={j}>{line}</li>)}
                    {f.lines.length > 6 && <li>…and {f.lines.length - 6} more</li>}
                  </ul>
                  {sheets.length > 1 && <div className="mt-1 text-[11px] text-[var(--ink-soft)]">{f.perFile.filter((p) => p.changes > 0).map((p) => `${p.name}: ${p.changes}`).join(" · ") || "no file changed"}</div>}
                </li>
              ))}
            </ol>
          )}

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-[var(--ink-2)]">{feed.length > 0 ? "And then…" : "Say it the way you would say it to someone"}</span>
            <textarea rows={2} value={instruction} onChange={(e) => { setInstruction(e.target.value); setPreview(null); }} className={INPUT} placeholder="Put all the Karbon jackets 30% off and into clearance" />
            <span className="mt-1 block text-xs text-[var(--ink-soft)]">Each one applies on top of the last, across every file, and any of them can be undone. Prices and tags, and also titles ({"\u201c"}make the Volkl skis 2027{"\u201d"}) and stock on hand. A title change never moves the product{"\u2019"}s URL.</span>
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" disabled={!aiEnabled || busy !== null || !instruction.trim()} onClick={() => void workOut()}>
              {busy === "planning" ? "Working it out…" : "Work out what would change"}
            </Button>
          </div>

          {feed.length > 0 && (
            <p className="mt-3 text-xs text-[var(--ink-soft)]">
              <strong>{sizeOfIt}</strong> so far across {sheets.length} file{sheets.length === 1 ? "" : "s"}. The download buttons above give you the files as they stand.
            </p>
          )}
        </Card>
      )}

      {preview && (
        <Card title="Check this before it is applied">
          <Alert tone={wholeFile || nothingToDo ? "warning" : "info"}>
            <div className="font-semibold">{preview.understood}</div>
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm">{preview.described.map((line, i) => <li key={i}>{line}</li>)}</ul>
            {preview.unclear && <div className="mt-2 text-xs"><strong>Not sure about:</strong> {preview.unclear}</div>}
          </Alert>

          {refused && (
            <Alert tone="danger" className="mt-3">
              <div className="font-semibold">Stopped, and nothing was changed.</div>
              <p className="mt-1 text-sm">Before changing anything this page proves that nothing would move except what you asked for. That check failed, so the files have been left exactly as they were. This is a fault in the app — please send this to whoever maintains it.</p>
              <ul className="mt-2 list-disc space-y-0.5 pl-5 font-mono text-[11px]">{preview.results.flatMap((r) => r.result.warnings.slice(1)).map((w, i) => <li key={i}>{w}</li>)}</ul>
            </Alert>
          )}
          {blocked && !refused && (
            <Alert tone="danger" className="mt-3">
              <div className="font-semibold">Not applied — this would have changed more than it asked for.</div>
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm">{preview.blocked.map((b, i) => <li key={i}>{b}</li>)}</ul>
              <p className="mt-2 text-sm">Either the products it names are in an export that is not loaded, or the shop spells that brand or category differently. Load the missing export, or do this one by hand.</p>
            </Alert>
          )}
          {!refused && !blocked && wholeFile && (
            <Alert tone="danger" className="mt-3">
              <div className="font-semibold">This would change every product in {sheets.length === 1 ? "the file" : "all the files"}.</div>
              <p className="mt-1 text-sm">Nothing in it narrows to a brand, a type or a tag. That is occasionally what someone means, and it is also the shape a misread instruction takes — so it asks first.</p>
              <label className="mt-2 flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={confirmWholeFile} onChange={(e) => setConfirmWholeFile(e.target.checked)} /> Yes, every product
              </label>
            </Alert>
          )}
          {!refused && !blocked && preview.results.flatMap((r) => r.result.warnings).map((w, i) => <Alert key={i} tone="warning" className="mt-3">{w}</Alert>)}

          {!refused && !blocked && (
            <>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                <span><strong className="tabular-nums">{totalMatched}</strong> products match</span>
                <span><strong className="tabular-nums">{totalChanges}</strong> cell{totalChanges === 1 ? "" : "s"} would change</span>
              </div>
              {sheets.length > 1 && (
                <ul className="mt-2 text-xs text-[var(--ink-soft)]">
                  {preview.results.map((r) => <li key={r.name}>{r.name}: {r.result.matched} matched, {r.result.changes.length} cell{r.result.changes.length === 1 ? "" : "s"}</li>)}
                </ul>
              )}

              {nothingToDo ? (
                <Alert tone="warning" className="mt-3">
                  {noOperations ? (
                    <>
                      <div className="font-semibold">No change was worked out from that.</div>
                      <p className="mt-1 text-sm">The products were found, but nothing was understood as something to <em>do</em> to them. Try naming the change plainly.{preview.unclear ? ` It said: ${preview.unclear}` : ""}</p>
                    </>
                  ) : totalMatched === 0 ? (
                    <>
                      <div className="font-semibold">No product in {sheets.length === 1 ? "this file" : "any of these files"} matches.</div>
                      <p className="mt-1 text-sm">The change was understood; nothing loaded fits the description above.</p>
                      {sheets.flatMap((sheet) => whyNoMatch(sheet.csv, preview.plan.scope).map((why) => `${sheets.length > 1 ? `${sheet.name}: ` : ""}${why}`)).map((why, i) => (
                        <p key={i} className="mt-1 text-sm">{why}</p>
                      ))}
                    </>
                  ) : (
                    <>
                      <div className="font-semibold">All {totalMatched} matching products are already like this.</div>
                      <p className="mt-1 text-sm">Every one of them already carries what you asked for, so there is nothing to change.</p>
                    </>
                  )}
                  <div className="mt-3"><Button onClick={() => setPreview(null)}>Discard</Button></div>
                </Alert>
              ) : (
                <>
                  <div className="mt-3 max-h-80 overflow-auto rounded-lg border border-[var(--line-soft)]">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-[var(--rubin-tint)] text-left">
                        <tr>
                          {sheets.length > 1 && <th className="px-2.5 py-1.5 font-medium">File</th>}
                          <th className="px-2.5 py-1.5 font-medium">Product</th>
                          <th className="px-2.5 py-1.5 font-medium">Column</th>
                          <th className="px-2.5 py-1.5 font-medium">Now</th>
                          <th className="px-2.5 py-1.5 font-medium">After</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.results.flatMap((r) => r.result.changes.map((c) => ({ file: r.name, c }))).slice(0, 200).map((row, i) => (
                          <tr key={i} className="border-t border-[var(--line-soft)] align-top">
                            {sheets.length > 1 && <td className="whitespace-nowrap px-2.5 py-1.5 text-[var(--ink-soft)]">{row.file}</td>}
                            <td className="px-2.5 py-1.5"><div className="font-medium">{row.c.title || row.c.handle}</div><div className="font-mono text-[10px] text-[var(--ink-soft)]">{row.c.handle}</div></td>
                            <td className="whitespace-nowrap px-2.5 py-1.5 text-[var(--ink-soft)]">{row.c.column}</td>
                            <td className="px-2.5 py-1.5"><span className="line-clamp-2 text-[var(--ink-soft)]">{row.c.before || "—"}</span></td>
                            <td className={cx("px-2.5 py-1.5 font-medium", row.c.column === "Variant Price" && "text-[var(--violet)]")}><span className="line-clamp-2">{row.c.after || "—"}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {totalChanges > 200 && <p className="mt-2 text-xs text-[var(--ink-soft)]">Showing the first 200 of {totalChanges}.</p>}
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Button variant="primary" disabled={wholeFile && !confirmWholeFile} onClick={apply}>Apply this</Button>
                    <Button onClick={() => setPreview(null)}>Discard</Button>
                  </div>
                </>
              )}
            </>
          )}
        </Card>
      )}
    </div>
  );
}
