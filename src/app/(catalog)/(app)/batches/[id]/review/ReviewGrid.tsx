"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  addImageUrlAction,
  applyRulesAction,
  lookupProductsAction,
  attachPhotoAction,
  autoAttachPhotosAction,
  bulkUpdateAction,
  deletePhotoAction,
  deleteProductAction,
  deleteVariantAction,
  dismissWarningAction,
  enrichSeoAction,
  getReviewAction,
  moveImageAction,
  reconcileAction,
  removeImageAction,
  saveImagesToLibraryAction,
  setImageVariantAction,
  updateProductAction,
  updateVariantAction,
  verifyImagesAction,
} from "@/app/(catalog)/actions";
import { Alert, Badge, Button, INPUT, INPUT_INLINE, cx, money, pct } from "@/app/(catalog)/ui";
import type { ReviewData } from "@/lib/catalog/pipeline";
import type { ReviewProduct, ReviewVariant } from "@/lib/catalog/review-types";
import { priceVariant } from "@/lib/catalog/pricing";
import { CATEGORIES, type GstTreatment, type RowFlag } from "@/lib/catalog/types";

type VariantField = "sku" | "barcode" | "option1Value" | "option2Value" | "option3Value" | "quantity" | "costPrice" | "gstTreatment" | "freightPerUnitAud" | "retailOverride" | "compareAtPrice" | "grams" | "pricingRuleId";
type ProductField = "title" | "handle" | "vendor" | "productType" | "category" | "tags" | "collections" | "status";

interface Col {
  key: VariantField | "landedCostAud" | "exGstRevenue" | "gstComponent" | "profitPerUnit" | "marginPct" | "markupPct";
  label: string;
  editable?: boolean;
  num?: boolean;
  width?: number;
  kind?: "text" | "number" | "select";
}

const VARIANT_COLS: Col[] = [
  { key: "sku", label: "SKU", editable: true, width: 120 },
  { key: "barcode", label: "Barcode", editable: true, width: 110 },
  { key: "option1Value", label: "Option 1", editable: true, width: 80 },
  { key: "option2Value", label: "Option 2", editable: true, width: 80 },
  { key: "option3Value", label: "Option 3", editable: true, width: 80 },
  { key: "quantity", label: "Qty", editable: true, num: true, kind: "number", width: 60 },
  { key: "grams", label: "Grams", editable: true, num: true, kind: "number", width: 70 },
  { key: "costPrice", label: "Cost", editable: true, num: true, kind: "number", width: 85 },
  { key: "gstTreatment", label: "Cost GST", editable: true, kind: "select", width: 90 },
  { key: "freightPerUnitAud", label: "Freight/u", editable: true, num: true, kind: "number", width: 80 },
  { key: "landedCostAud", label: "Landed", num: true, width: 85 },
  { key: "retailOverride", label: "Retail (inc GST)", editable: true, num: true, kind: "number", width: 110 },
  { key: "compareAtPrice", label: "Compare at", editable: true, num: true, kind: "number", width: 90 },
  { key: "exGstRevenue", label: "Ex-GST", num: true, width: 80 },
  { key: "gstComponent", label: "GST", num: true, width: 70 },
  { key: "profitPerUnit", label: "Profit/u", num: true, width: 80 },
  { key: "marginPct", label: "Margin", num: true, width: 70 },
];

const FLAG_LABELS: Record<string, string> = {
  MISSING_TITLE: "Missing title", MISSING_PRICE: "Missing price", MISSING_COST: "Missing cost", MISSING_SKU: "Missing SKU",
  DUPLICATE_SKU_BATCH: "Duplicate SKU (batch)", DUPLICATE_SKU_SHOPIFY: "SKU exists in Shopify", DUPLICATE_HANDLE: "Duplicate handle",
  INVALID_HANDLE: "Invalid handle", DUPLICATE_OPTIONS: "Duplicate option values", MISSING_OPTION_VALUE: "Missing option value",
  NO_IMAGE: "No image", INVALID_IMAGE_URL: "Bad image URL", LOW_MARGIN: "Low margin", NEGATIVE_PROFIT: "Negative profit",
  MISSING_VENDOR: "No vendor", MISSING_TYPE: "No product type", UPDATE_EXISTING: "Updates existing Shopify product",
};

function fmt(v: ReviewVariant, key: Col["key"]): string {
  const val = v[key as keyof ReviewVariant];
  switch (key) {
    case "retailOverride": return v.retailPrice ? v.retailPrice.toFixed(2) : "";
    case "costPrice": case "freightPerUnitAud": case "landedCostAud": case "exGstRevenue": case "gstComponent": case "profitPerUnit":
      return typeof val === "number" ? val.toFixed(2) : "";
    case "compareAtPrice": return typeof val === "number" && val > 0 ? val.toFixed(2) : "";
    case "marginPct": case "markupPct": return typeof val === "number" ? `${val.toFixed(1)}%` : "";
    case "gstTreatment": return val === "INCLUSIVE" ? "Inc" : val === "NONE" ? "None" : "Ex";
    case "pricingRuleId": return v.pricingRuleName ?? "";
    default: return val === null || val === undefined ? "" : String(val);
  }
}

function rawValue(v: ReviewVariant, key: VariantField): string {
  const val = v[key as keyof ReviewVariant];
  if (key === "retailOverride") return v.retailOverride !== null ? String(v.retailOverride) : v.retailPrice ? v.retailPrice.toFixed(2) : "";
  return val === null || val === undefined ? "" : String(val);
}

function worst(flags: RowFlag[]): "error" | "warning" | null {
  if (flags.some((f) => f.severity === "error")) return "error";
  if (flags.length) return "warning";
  return null;
}

export function ReviewGrid({ initial, batchId }: { initial: ReviewData; batchId: string }) {
  const [data, setData] = useState<ReviewData>(initial);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(initial.products.map((p) => p.id)));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState({ q: "", brand: "", category: "", flags: "", reconcile: "" });
  const [groupBy, setGroupBy] = useState<"none" | "brand" | "type">("brand");
  const [focus, setFocus] = useState<{ variantId: string; col: number } | null>(null);
  const [editing, setEditing] = useState<{ variantId: string; col: number; value: string } | null>(null);
  const [productEdit, setProductEdit] = useState<{ productId: string; field: ProductField; value: string } | null>(null);
  const [drawer, setDrawer] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "info" | "success" | "warning" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const locked = ["EXPORTED", "PUSHED"].includes(data.batch.status);
  const tableRef = useRef<HTMLTableElement>(null);

  const refresh = useCallback(async () => {
    const fresh = await getReviewAction(batchId);
    setData(fresh);
  }, [batchId]);


  const brands = useMemo(() => Array.from(new Set(data.products.map((p) => p.vendor).filter(Boolean))).sort(), [data.products]);

  const visible = useMemo(() => {
    const q = filter.q.trim().toLowerCase();
    return data.products.filter((p) => {
      if (filter.brand && p.vendor !== filter.brand) return false;
      if (filter.category && p.category !== filter.category) return false;
      if (filter.reconcile && p.reconcileStatus !== filter.reconcile) return false;
      if (filter.flags) {
        const all = [...p.flags, ...p.variants.flatMap((v) => v.flags)];
        if (filter.flags === "errors" && !all.some((f) => f.severity === "error")) return false;
        if (filter.flags === "warnings" && !all.some((f) => f.severity === "warning")) return false;
        if (filter.flags === "any" && all.length === 0) return false;
        if (!["errors", "warnings", "any"].includes(filter.flags) && !all.some((f) => f.code === filter.flags)) return false;
      }
      if (q) {
        const hay = [p.title, p.handle, p.vendor, p.productType, p.tags, ...p.variants.map((v) => `${v.sku} ${v.barcode} ${v.option1Value} ${v.option2Value}`)].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data.products, filter]);

  const groupKey = useCallback((p: ReviewProduct) => (groupBy === "brand" ? p.vendor || "No brand" : groupBy === "type" ? p.productType || "No type" : ""), [groupBy]);
  const ordered = useMemo(() => (groupBy === "none" ? visible : [...visible].sort((a, b) => groupKey(a).localeCompare(groupKey(b)) || a.title.localeCompare(b.title))), [visible, groupBy, groupKey]);
  const visibleVariants = useMemo(() => ordered.flatMap((p) => (expanded.has(p.id) ? p.variants.map((v) => ({ v, p })) : [])), [ordered, expanded]);

  // ---- local optimistic pricing -------------------------------------------------------
  const applyLocalVariant = (variantId: string, patch: Partial<ReviewVariant>) => {
    setData((d) => ({
      ...d,
      products: d.products.map((p) => ({
        ...p,
        variants: p.variants.map((v) => {
          if (v.id !== variantId) return v;
          const next = { ...v, ...patch };
          const r = priceVariant(
            { costPrice: next.costPrice, gstTreatment: next.gstTreatment as GstTreatment, fxRateToAud: next.fxRateToAud, freightPerUnitAud: next.freightPerUnitAud, quantity: next.quantity, retailOverride: next.retailOverride },
            { gstRate: d.settings.gstRate, pricesIncludeGst: d.settings.pricesIncludeGst, minMarginPct: d.settings.minMarginPct },
          );
          return { ...next, landedCostAud: r.landedCostAud, retailPrice: r.retailPrice, exGstRevenue: r.exGstRevenue, gstComponent: r.gstComponent, profitPerUnit: r.profitPerUnit, marginPct: r.marginPct, markupPct: r.markupPct, pricingRuleName: null };
        }),
      })),
    }));
  };

  const commitVariant = (variantId: string, field: VariantField, raw: string) => {
    const patch: Record<string, unknown> = {};
    const num = raw.trim() === "" ? null : Number(raw);
    switch (field) {
      case "quantity": case "grams": patch[field] = Math.max(0, Math.round(num ?? 0)); break;
      case "costPrice": case "freightPerUnitAud": patch[field] = Math.max(0, num ?? 0); break;
      case "retailOverride": case "compareAtPrice": patch[field] = num === null || Number.isNaN(num) ? null : num; break;
      case "pricingRuleId": patch[field] = raw || null; break;
      case "gstTreatment": patch[field] = raw; break;
      default: patch[field] = raw;
    }
    if (patch[field] !== undefined && Number.isNaN(patch[field])) return;
    applyLocalVariant(variantId, patch as Partial<ReviewVariant>);
    start(async () => {
      const res = await updateVariantAction(variantId, patch);
      if (!res.ok) setMessage({ tone: "danger", text: res.error });
      await refresh();
    });
  };

  const commitProduct = (productId: string, field: ProductField, value: string) => {
    setData((d) => ({ ...d, products: d.products.map((p) => (p.id === productId ? { ...p, [field]: value } : p)) }));
    start(async () => {
      const res = await updateProductAction(productId, { [field]: value });
      if (!res.ok) setMessage({ tone: "danger", text: res.error });
      await refresh();
    });
  };

  // ---- keyboard navigation --------------------------------------------------------------
  const moveFocus = (dRow: number, dCol: number) => {
    if (!focus) return;
    const idx = visibleVariants.findIndex((x) => x.v.id === focus.variantId);
    if (idx < 0) return;
    let row = idx + dRow;
    let col = focus.col + dCol;
    if (col < 0) { col = VARIANT_COLS.length - 1; row -= 1; }
    if (col >= VARIANT_COLS.length) { col = 0; row += 1; }
    row = Math.max(0, Math.min(visibleVariants.length - 1, row));
    setFocus({ variantId: visibleVariants[row].v.id, col });
  };

  const startEdit = (variantId: string, col: number, seed?: string) => {
    if (locked || !VARIANT_COLS[col].editable) return;
    const v = visibleVariants.find((x) => x.v.id === variantId)?.v;
    if (!v) return;
    setEditing({ variantId, col, value: seed ?? rawValue(v, VARIANT_COLS[col].key as VariantField) });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Keys typed into the search box, product-row inputs or the drawer belong to those fields,
    // not to grid navigation. Only the grid's own cell editor is handled below via `editing`.
    const target = e.target as HTMLElement;
    const inFormControl = ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName) || target.isContentEditable;
    if (!editing && inFormControl) return;
    if (editing) {
      if (e.key === "Enter") { e.preventDefault(); commitVariant(editing.variantId, VARIANT_COLS[editing.col].key as VariantField, editing.value); setEditing(null); moveFocus(1, 0); }
      else if (e.key === "Tab") { e.preventDefault(); commitVariant(editing.variantId, VARIANT_COLS[editing.col].key as VariantField, editing.value); setEditing(null); moveFocus(0, e.shiftKey ? -1 : 1); }
      else if (e.key === "Escape") setEditing(null);
      return;
    }
    if (!focus) return;
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); moveFocus(1, 0); break;
      case "ArrowUp": e.preventDefault(); moveFocus(-1, 0); break;
      case "ArrowLeft": e.preventDefault(); moveFocus(0, -1); break;
      case "ArrowRight": case "Tab": e.preventDefault(); moveFocus(0, e.shiftKey ? -1 : 1); break;
      case "Enter": case "F2": e.preventDefault(); startEdit(focus.variantId, focus.col); break;
      case "Delete": case "Backspace": {
        const col = VARIANT_COLS[focus.col];
        if (col.editable && (col.key === "retailOverride" || col.key === "compareAtPrice" || col.key === "pricingRuleId")) { e.preventDefault(); commitVariant(focus.variantId, col.key, ""); }
        break;
      }
      default:
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && VARIANT_COLS[focus.col].kind !== "select") { e.preventDefault(); startEdit(focus.variantId, focus.col, e.key); }
    }
  };

  /** Paste a column of values (e.g. from Excel) downward from the focused cell. */
  const onPaste = (e: React.ClipboardEvent) => {
    if (!focus || editing) return;
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;
    const lines = text.split(/\r?\n/).filter((l) => l !== "");
    if (lines.length === 0) return;
    e.preventDefault();
    const idx = visibleVariants.findIndex((x) => x.v.id === focus.variantId);
    const col = VARIANT_COLS[focus.col];
    if (!col.editable || idx < 0) return;
    lines.forEach((line, i) => {
      const target = visibleVariants[idx + i];
      if (target) commitVariant(target.v.id, col.key as VariantField, line.split("\t")[0].trim());
    });
    setMessage({ tone: "info", text: `Pasted ${lines.length} value${lines.length === 1 ? "" : "s"} into ${col.label}.` });
  };

  useEffect(() => {
    if (!focus) return;
    const el = tableRef.current?.querySelector<HTMLElement>(`[data-cell="${focus.variantId}:${focus.col}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [focus]);

  // ---- bulk ---------------------------------------------------------------------------------
  const [bulk, setBulk] = useState<{ field: string; value: string }>({ field: "addTag", value: "" });
  const runBulk = () => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    const patch: Record<string, unknown> = {};
    switch (bulk.field) {
      case "dismissWarnings": patch.dismissWarnings = bulk.value ? [bulk.value] : ["NO_IMAGE", "LOW_MARGIN", "MISSING_SKU", "MISSING_VENDOR", "MISSING_TYPE", "INVALID_IMAGE_URL", "NEGATIVE_PROFIT", "DUPLICATE_SKU_SHOPIFY", "UPDATE_EXISTING"]; break;
      case "restoreWarnings": patch.restoreWarnings = true; break;
      case "clearOverride": patch.clearOverride = true; break;
      case "pricingRuleId": patch.pricingRuleId = bulk.value || null; break;
      default: patch[bulk.field] = bulk.value;
    }
    start(async () => {
      const res = await bulkUpdateAction(batchId, ids, patch);
      setMessage(res.ok ? { tone: "success", text: `Updated ${res.data?.products} products / ${res.data?.variants} variants.` } : { tone: "danger", text: res.error });
      await refresh();
    });
  };

  const toggleAll = (on: boolean) => setSelected(on ? new Set(visible.map((p) => p.id)) : new Set());

  const summary = data.summary;
  // A product with no description exports an empty Body (HTML), which is the one thing nobody
  // notices until the CSV is open in Shopify. Said here, next to the button that fills them.
  const withoutDescription = data.products.filter((p) => !p.bodyHtml.trim()).length;
  const drawerProduct = drawer ? data.products.find((p) => p.id === drawer) ?? null : null;

  return (
    <div onKeyDown={onKeyDown} onPaste={onPaste} tabIndex={0} className="outline-none">
      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} placeholder="Search title, SKU, handle…" className={`${INPUT_INLINE} w-56`} />
        <select value={filter.brand} onChange={(e) => setFilter({ ...filter, brand: e.target.value })} className={`${INPUT_INLINE} w-40`}><option value="">All brands</option>{brands.map((b) => <option key={b}>{b}</option>)}</select>
        <select value={filter.category} onChange={(e) => setFilter({ ...filter, category: e.target.value })} className={`${INPUT_INLINE} w-40`}><option value="">All categories</option>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <select value={filter.flags} onChange={(e) => setFilter({ ...filter, flags: e.target.value })} className={`${INPUT_INLINE} w-48`}>
          <option value="">All rows</option><option value="errors">Errors only</option><option value="warnings">Warnings only</option><option value="any">Any flag</option>
          {Object.entries(FLAG_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filter.reconcile} onChange={(e) => setFilter({ ...filter, reconcile: e.target.value })} className={`${INPUT_INLINE} w-44`}>
          <option value="">Any Shopify status</option><option value="NEW">New product</option><option value="VARIANT_ADD">Adds variants</option><option value="UPDATE">Updates existing</option><option value="UNKNOWN">Not checked</option>
        </select>
        <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as "none" | "brand" | "type")} className={`${INPUT_INLINE} w-44`} title="Group products">
          <option value="brand">Group by brand</option><option value="type">Group by product type</option><option value="none">No grouping</option>
        </select>
        <span className="text-xs text-[var(--ink-soft)]">{visible.length} of {data.products.length} products{data.unassignedImages.length ? ` · ${data.unassignedImages.length} unattached photo${data.unassignedImages.length === 1 ? "" : "s"}` : ""}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setExpanded(expanded.size ? new Set() : new Set(data.products.map((p) => p.id)))}>{expanded.size ? "Collapse all" : "Expand all"}</Button>
          <Button size="sm" disabled={pending || locked} title="Re-run the tag, collection, type and metafield rules" onClick={() => start(async () => { const r = await applyRulesAction(batchId); setMessage(r.ok ? { tone: "success", text: `Rules applied: ${r.data!.matched} of ${r.data!.products} products matched a rule.` } : { tone: "danger", text: r.error }); await refresh(); })}>Apply rules</Button>
          <Button size="sm" disabled={pending || locked} title="Search the brand's website for the description and the recommended retail of anything the invoice did not carry" onClick={() => start(async () => { const r = await lookupProductsAction(batchId, { retry: true }); setMessage(r.ok ? lookupMessage(r.data!) : { tone: "danger", text: r.error }); await refresh(); })}>Find descriptions</Button>
          {data.unassignedImages.length > 0 && !locked && <Button size="sm" disabled={pending} onClick={() => start(async () => { const r = await autoAttachPhotosAction(batchId); setMessage(r.ok ? { tone: "info", text: `${r.data!.attached} photo${r.data!.attached === 1 ? "" : "s"} matched by name/SKU. Open a product's Details to attach the rest.` } : { tone: "danger", text: r.error }); await refresh(); })}>Match photos</Button>}
          <Button size="sm" disabled={pending} onClick={() => start(async () => { const r = await verifyImagesAction(batchId); setMessage(r.ok ? { tone: r.data!.failed ? "warning" : "success", text: `Checked ${r.data!.checked} image URLs, ${r.data!.failed} unreachable.` } : { tone: "danger", text: r.error }); await refresh(); })}>Check images</Button>
          <Button size="sm" disabled={pending || locked} onClick={() => start(async () => { const r = await enrichSeoAction(batchId, true); setMessage(r.ok ? { tone: "success", text: `SEO written for ${r.data!.updated} products (${r.data!.source === "AI" ? "AI" : r.data!.source === "TEMPLATE" ? "template - set ANTHROPIC_API_KEY for AI copy" : "AI + template"}).` } : { tone: "danger", text: r.error }); await refresh(); })}>Write SEO copy</Button>
          <Button size="sm" disabled={pending || !data.settings.shopifyConfigured} title={data.settings.shopifyConfigured ? "" : "Configure Shopify in Settings first"} onClick={() => start(async () => { const r = await reconcileAction(batchId); setMessage(r.ok ? { tone: "info", text: `Shopify check: ${r.data!.new} new, ${r.data!.variantAdd} add variants, ${r.data!.update} update existing.` } : { tone: "danger", text: r.error }); await refresh(); })}>Check against Shopify</Button>
          <Link href={`/batches/${batchId}/export`} style={{ color: "#fff" }} className={cx("inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-medium", summary.errors ? "bg-neutral-400" : "bg-[var(--ink)] hover:bg-black")}>{summary.errors ? `${summary.errors} errors block export` : "Export →"}</Link>
        </div>
      </div>

      {withoutDescription > 0 && !locked && (
        <Alert tone="warning" className="mb-3">
          {withoutDescription} of {data.products.length} products have no description yet. Press <strong>Find descriptions</strong> to pull them from the brand&apos;s website, or write them in a product&apos;s Details.
        </Alert>
      )}

      {message && <Alert tone={message.tone} className="mb-3 flex items-start justify-between gap-3"><span>{message.text}</span><button onClick={() => setMessage(null)} className="text-xs underline">dismiss</button></Alert>}

      {/* Bulk bar */}
      {selected.size > 0 && !locked && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--violet)] bg-[var(--violet-soft)] px-3 py-2 text-sm">
          <strong>{selected.size} selected</strong>
          <select value={bulk.field} onChange={(e) => setBulk({ field: e.target.value, value: "" })} className={`${INPUT_INLINE} w-44`}>
            <option value="addTag">Add tag</option><option value="addCollection">Add collection</option><option value="vendor">Set vendor</option><option value="productType">Set product type</option>
            <option value="category">Set category</option><option value="status">Set status</option><option value="gstTreatment">Set cost GST treatment</option>
            <option value="clearOverride">Clear retail overrides</option><option value="dismissWarnings">Dismiss warnings</option><option value="restoreWarnings">Restore dismissed warnings</option>
          </select>
          {["addTag", "addCollection", "vendor", "productType"].includes(bulk.field) && <input value={bulk.value} onChange={(e) => setBulk({ ...bulk, value: e.target.value })} className={`${INPUT_INLINE} w-48`} placeholder="Value" />}
          {bulk.field === "category" && <select value={bulk.value} onChange={(e) => setBulk({ ...bulk, value: e.target.value })} className={`${INPUT_INLINE} w-40`}><option value="">Choose…</option>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>}
          {bulk.field === "status" && <select value={bulk.value} onChange={(e) => setBulk({ ...bulk, value: e.target.value })} className={`${INPUT_INLINE} w-40`}><option value="">Choose…</option><option value="draft">Draft</option><option value="active">Active</option></select>}
          {bulk.field === "gstTreatment" && <select value={bulk.value} onChange={(e) => setBulk({ ...bulk, value: e.target.value })} className={`${INPUT_INLINE} w-40`}><option value="">Choose…</option><option value="EXCLUSIVE">Ex GST</option><option value="INCLUSIVE">Inc GST</option><option value="NONE">No GST</option></select>}
          {bulk.field === "pricingRuleId" && <select value={bulk.value} onChange={(e) => setBulk({ ...bulk, value: e.target.value })} className={`${INPUT_INLINE} w-56`}><option value="">Automatic (by category/brand)</option>{data.rules.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>}
          {bulk.field === "dismissWarnings" && <select value={bulk.value} onChange={(e) => setBulk({ ...bulk, value: e.target.value })} className={`${INPUT_INLINE} w-56`}><option value="">All warnings</option>{["NO_IMAGE", "LOW_MARGIN", "MISSING_SKU", "MISSING_VENDOR", "MISSING_TYPE", "NEGATIVE_PROFIT", "UPDATE_EXISTING", "DUPLICATE_SKU_SHOPIFY"].map((c) => <option key={c} value={c}>{FLAG_LABELS[c]}</option>)}</select>}
          <Button size="sm" variant="primary" onClick={runBulk} disabled={pending}>Apply</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      {/* Grid */}
      <div className="grid-wrap">
        <table className="review-grid" ref={tableRef}>
          <thead>
            <tr>
              <th style={{ width: 28 }}><input type="checkbox" checked={selected.size > 0 && visible.every((p) => selected.has(p.id))} onChange={(e) => toggleAll(e.target.checked)} /></th>
              <th style={{ width: 24 }} />
              <th style={{ width: 60 }}>Flags</th>
              <th style={{ width: 40 }}>Img</th>
              {VARIANT_COLS.map((c) => <th key={c.key} style={{ minWidth: c.width }} className={c.num ? "text-right" : ""}>{c.label}</th>)}
              <th />
            </tr>
          </thead>
          <tbody>
            {ordered.map((p, idx) => {
              const pFlags = [...p.flags, ...p.variants.flatMap((v) => v.flags)];
              const tone = worst(pFlags);
              const open = expanded.has(p.id);
              const key = groupKey(p);
              const sectionStart = groupBy !== "none" && (idx === 0 || groupKey(ordered[idx - 1]) !== key);
              const sectionCount = sectionStart ? ordered.filter((x) => groupKey(x) === key).length : 0;
              return [
                ...(sectionStart
                  ? [
                      <tr key={`section-${key}`} className="section-row">
                        <td colSpan={VARIANT_COLS.length + 5}><span className="cell"><strong>{key}</strong> <span className="text-[var(--ink-soft)]">· {sectionCount} product{sectionCount === 1 ? "" : "s"} · {ordered.filter((x) => groupKey(x) === key).reduce((n, x) => n + x.variants.length, 0)} variants</span></span></td>
                      </tr>,
                    ]
                  : []),
                <tr key={p.id} className={cx("product-row", tone && `row-${tone}`, selected.has(p.id) && "selected")}>
                  <td><span className="cell"><input type="checkbox" checked={selected.has(p.id)} onChange={(e) => { const s = new Set(selected); if (e.target.checked) s.add(p.id); else s.delete(p.id); setSelected(s); }} /></span></td>
                  <td><button className="cell" onClick={() => { const s = new Set(expanded); if (open) s.delete(p.id); else s.add(p.id); setExpanded(s); }}>{open ? "▾" : "▸"}</button></td>
                  <td><span className="cell" title={pFlags.map((f) => f.message).join("\n")}>{p.flags.map((f, i) => <span key={i} className={cx("flag", f.severity)} />)}{p.variants.some((v) => v.flags.length) && <span className="text-[10px] text-[var(--ink-soft)]">+{p.variants.reduce((s, v) => s + v.flags.length, 0)}</span>}</span></td>
                  <td><button className="cell" onClick={() => setDrawer(p.id)} title="Images & details">{/* eslint-disable-next-line @next/next/no-img-element -- supplier CDN hosts are arbitrary */}
                  {p.images[0] ? <img src={p.images[0].url} alt="" className="thumb" /> : <span className="thumb inline-block text-center text-[10px] leading-7 text-[var(--ink-soft)]">+</span>}</button></td>
                  <td colSpan={VARIANT_COLS.length + 1}>
                    <div className="flex items-center gap-3 px-2">
                      <ProductCell p={p} field="title" width={260} edit={productEdit} setEdit={setProductEdit} commit={commitProduct} locked={locked} strong />
                      <span className="text-[var(--ink-soft)]">/</span>
                      <ProductCell p={p} field="handle" width={200} edit={productEdit} setEdit={setProductEdit} commit={commitProduct} locked={locked} mono />
                      <ProductCell p={p} field="vendor" width={110} edit={productEdit} setEdit={setProductEdit} commit={commitProduct} locked={locked} label="Vendor" />
                      <ProductCell p={p} field="productType" width={110} edit={productEdit} setEdit={setProductEdit} commit={commitProduct} locked={locked} label="Type" />
                      <ProductCell p={p} field="category" width={100} edit={productEdit} setEdit={setProductEdit} commit={commitProduct} locked={locked} label="Category" options={[...CATEGORIES]} />
                      <ProductCell p={p} field="tags" width={180} edit={productEdit} setEdit={setProductEdit} commit={commitProduct} locked={locked} label="Tags" />
                      <ProductCell p={p} field="collections" width={130} edit={productEdit} setEdit={setProductEdit} commit={commitProduct} locked={locked} label="Collections" />
                      <ProductCell p={p} field="status" width={70} edit={productEdit} setEdit={setProductEdit} commit={commitProduct} locked={locked} label="Status" options={["draft", "active"]} />
                      <span className="text-[11px] text-[var(--ink-soft)]">{p.option1Name ? [p.option1Name, p.option2Name, p.option3Name].filter(Boolean).join(" / ") : "no options"}</span>
                      <span className="text-[11px] text-[var(--ink-soft)]">{p.images.length} img</span>
                      {p.reconcileStatus !== "UNKNOWN" && <Badge tone={p.reconcileStatus === "NEW" ? "success" : "warning"}>{p.reconcileStatus.replace("_", " ")}</Badge>}
                      <button className="ml-auto text-[11px] text-[var(--violet)]" onClick={() => setDrawer(p.id)}>Details</button>
                      {!locked && <button className="text-[11px] text-red-600" onClick={() => { if (confirm(`Remove "${p.title}" and its variants from the batch?`)) start(async () => { await deleteProductAction(p.id); await refresh(); }); }}>Remove</button>}
                    </div>
                  </td>
                </tr>,
                ...(open
                  ? p.variants.map((v) => {
                      const vt = worst(v.flags);
                      return (
                        <tr key={v.id} className={cx("variant-row", vt && `row-${vt}`, selected.has(p.id) && "selected")}>
                          <td /><td />
                          <td><span className="cell" title={v.flags.map((f) => f.message).join("\n")}>{v.flags.map((f, i) => <span key={i} className={cx("flag", f.severity)} />)}</span></td>
                          {/* eslint-disable-next-line @next/next/no-img-element -- supplier CDN hosts are arbitrary */}
                          <td><span className="cell">{p.images.find((i) => i.variantId === v.id) ? <img src={p.images.find((i) => i.variantId === v.id)!.url} alt="" className="thumb" /> : null}</span></td>
                          {VARIANT_COLS.map((c, ci) => {
                            const isFocus = focus?.variantId === v.id && focus.col === ci;
                            const isEdit = editing?.variantId === v.id && editing.col === ci;
                            const disabledOpt = (c.key === "option2Value" && !p.option2Name) || (c.key === "option3Value" && !p.option3Name) || (c.key === "option1Value" && !p.option1Name);
                            return (
                              <td key={c.key} data-cell={`${v.id}:${ci}`}>
                                {isEdit ? (
                                  c.kind === "select" && c.key === "gstTreatment" ? (
                                    <span className="cell"><select autoFocus value={editing.value} onChange={(e) => { commitVariant(v.id, "gstTreatment", e.target.value); setEditing(null); }} onBlur={() => setEditing(null)}><option value="EXCLUSIVE">Ex GST</option><option value="INCLUSIVE">Inc GST</option><option value="NONE">No GST</option></select></span>
                                  ) : c.kind === "select" && c.key === "pricingRuleId" ? (
                                    <span className="cell"><select autoFocus value={editing.value} onChange={(e) => { commitVariant(v.id, "pricingRuleId", e.target.value); setEditing(null); }} onBlur={() => setEditing(null)}><option value="">Automatic</option>{data.rules.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></span>
                                  ) : (
                                    <span className="cell"><input autoFocus type={c.kind === "number" ? "number" : "text"} step="any" value={editing.value} onChange={(e) => setEditing({ ...editing, value: e.target.value })} onBlur={() => { commitVariant(v.id, c.key as VariantField, editing.value); setEditing(null); }} /></span>
                                  )
                                ) : (
                                  <span
                                    className={cx("cell", c.editable && !locked && !disabledOpt && "editable", c.num && "num", isFocus && "focused", c.key === "retailOverride" && v.retailOverride !== null && "text-[var(--violet)] font-semibold", (c.key === "marginPct" || c.key === "profitPerUnit") && v.flags.some((f) => f.code === "LOW_MARGIN" || f.code === "NEGATIVE_PROFIT") && "text-amber-700 font-semibold", disabledOpt && "text-neutral-300")}
                                    onClick={() => setFocus({ variantId: v.id, col: ci })}
                                    onDoubleClick={() => !disabledOpt && startEdit(v.id, ci)}
                                    title={c.key === "retailOverride" ? (v.retailOverride !== null ? "Manual override (Delete to clear)" : `Computed by ${v.pricingRuleName}`) : undefined}
                                  >
                                    {disabledOpt ? "–" : fmt(v, c.key)}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                          <td>
                            <span className="cell flex gap-2 text-[11px]">
                              {v.flags.filter((f) => f.severity === "warning").map((f) => (
                                <button key={f.code} title={`Dismiss: ${f.message}`} className="text-amber-700 hover:underline" onClick={() => start(async () => { await dismissWarningAction(v.id, f.code, true); await refresh(); })}>✕ {FLAG_LABELS[f.code] ?? f.code}</button>
                              ))}
                              {v.warningsDismissed.length > 0 && <button className="text-[var(--ink-soft)] hover:underline" onClick={() => start(async () => { for (const c of v.warningsDismissed) await dismissWarningAction(v.id, c, false); await refresh(); })}>restore {v.warningsDismissed.length}</button>}
                              {!locked && <button className="text-red-600 hover:underline" onClick={() => { if (confirm("Remove this variant?")) start(async () => { await deleteVariantAction(v.id); await refresh(); }); }}>remove</button>}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  : []),
              ];
            })}
            {visible.length === 0 && <tr><td colSpan={VARIANT_COLS.length + 5}><span className="cell py-6 text-center text-[var(--ink-soft)]">No products match the current filter.</span></td></tr>}
          </tbody>
        </table>
      </div>

      {/* Summary bar */}
      <div className="summary-bar">
        <div><div className="k">Products / variants / units</div><div className="v">{summary.products} / {summary.variants} / {summary.units}</div></div>
        <div><div className="k">Total retail (inc GST)</div><div className="v">{money(summary.totalRetailIncGst)}</div></div>
        <div><div className="k">GST collected</div><div className="v">{money(summary.totalGst)}</div></div>
        <div><div className="k">Ex-GST revenue</div><div className="v">{money(summary.totalExGstRevenue)}</div></div>
        <div><div className="k">Landed cost</div><div className="v">{money(summary.totalLandedCost)}</div></div>
        <div><div className="k">Net profit (ex GST)</div><div className={cx("v", summary.totalNetProfit < 0 && "text-red-600")}>{money(summary.totalNetProfit)}</div></div>
        <div><div className="k">Avg margin</div><div className={cx("v", summary.averageMarginPct < data.settings.minMarginPct && "text-amber-700")}>{pct(summary.averageMarginPct)}</div></div>
        <div><div className="k">Low margin rows</div><div className="v">{summary.lowMarginVariants}</div></div>
        <div><div className="k">Errors / warnings</div><div className="v"><span className={summary.errors ? "text-red-600" : ""}>{summary.errors}</span> / <span className={summary.warnings ? "text-amber-700" : ""}>{summary.warnings}</span></div></div>
        <div className="self-center text-[11px] text-[var(--ink-soft)]">{pending ? "Saving…" : "Double-click or Enter to edit · arrows to move · paste a column from Excel"}</div>
      </div>

      {drawerProduct && <ProductDrawer key={drawerProduct.id} batchId={batchId} product={drawerProduct} unassigned={data.unassignedImages} locked={locked} publicBaseUrl={data.settings.publicBaseUrl} onClose={() => setDrawer(null)} refresh={refresh} setMessage={setMessage} />}
    </div>
  );
}

function ProductCell({ p, field, width, edit, setEdit, commit, locked, strong, mono, label, options }: {
  p: ReviewProduct; field: ProductField; width: number;
  edit: { productId: string; field: ProductField; value: string } | null;
  setEdit: (e: { productId: string; field: ProductField; value: string } | null) => void;
  commit: (productId: string, field: ProductField, value: string) => void;
  locked: boolean; strong?: boolean; mono?: boolean; label?: string; options?: string[];
}) {
  const value = String(p[field] ?? "");
  const isEdit = edit?.productId === p.id && edit.field === field;
  if (isEdit) {
    return options ? (
      <select autoFocus value={edit.value} onChange={(e) => { commit(p.id, field, e.target.value); setEdit(null); }} onBlur={() => setEdit(null)} className="rounded border border-[var(--violet)] px-1 py-0.5 text-xs" style={{ width }}>{options.map((o) => <option key={o}>{o}</option>)}</select>
    ) : (
      <input autoFocus value={edit.value} onChange={(e) => setEdit({ ...edit, value: e.target.value })} onBlur={() => { commit(p.id, field, edit.value); setEdit(null); }} onKeyDown={(e) => { if (e.key === "Enter") { commit(p.id, field, edit.value); setEdit(null); } if (e.key === "Escape") setEdit(null); }} className="rounded border border-[var(--violet)] px-1 py-0.5 text-xs" style={{ width }} />
    );
  }
  return (
    <span
      className={cx("inline-block truncate rounded px-1 py-0.5 text-xs", !locked && "cursor-text hover:bg-white", strong && "text-sm font-semibold", mono && "font-mono text-[11px] text-[var(--ink-soft)]", !value && "italic text-neutral-400")}
      style={{ maxWidth: width }}
      title={label ? `${label}: ${value || "(empty)"} — click to edit` : value}
      onClick={() => !locked && setEdit({ productId: p.id, field, value })}
    >
      {label && <span className="mr-1 text-[10px] uppercase tracking-wide text-[var(--ink-soft)]">{label}</span>}{value || (label ? "—" : "(untitled)")}
    </span>
  );
}

/** What a past lookup did about this product, in the words a person would use about it. */
const LOOKUP_SAID: Record<string, string> = {
  FOUND: "Description and price taken from the brand's website.",
  UNSURE: "Found a page, but not certainly this exact product — description only, no price or brand.",
  NOT_FOUND: "Searched, but the brand's website did not turn it up.",
  FAILED: "The search itself failed. Try it again.",
};

/** What a lookup pass found, said as a sentence rather than a row of counters. */
function lookupMessage(d: { attempted: number; found: number; descriptions: number; prices: number; vendors: number; missing: number; capped: boolean; remaining: number; limit: number }): { tone: "info" | "success" | "warning"; text: string } {
  if (d.attempted === 0) return { tone: "info", text: d.missing === 0 ? "Nothing is missing a description or a price." : "Everything missing has already been looked up. Nothing left to search." };
  const got = [
    d.descriptions ? `${d.descriptions} description${d.descriptions === 1 ? "" : "s"}` : "",
    d.prices ? `${d.prices} retail price${d.prices === 1 ? "" : "s"}` : "",
    d.vendors ? `${d.vendors} brand${d.vendors === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  const capped = d.capped ? ` ${d.remaining} still to do — run it again for the rest.` : "";
  if (got.length === 0) return { tone: "warning", text: `Searched ${d.attempted} product${d.attempted === 1 ? "" : "s"} and found nothing usable. Open one and check its title reads the way the brand writes it.${capped}` };
  return { tone: "success", text: `Searched ${d.attempted}, filled in ${got.join(", ")}.${capped}` };
}

function ProductDrawer({ batchId, product, unassigned, locked, publicBaseUrl, onClose, refresh, setMessage }: { batchId: string; product: ReviewProduct; unassigned: Array<{ id: string; filename: string; url: string; hint: string }>; locked: boolean; publicBaseUrl: string; onClose: () => void; refresh: () => Promise<void>; setMessage: (m: { tone: "info" | "success" | "warning" | "danger"; text: string } | null) => void }) {
  const [tab, setTab] = useState<"images" | "details">("images");
  const [url, setUrl] = useState("");
  const [variantForUrl, setVariantForUrl] = useState("");
  const [dragging, setDragging] = useState(false);
  const [pending, start] = useTransition();
  const [details, setDetails] = useState({ seoTitle: product.seoTitle, seoDescription: product.seoDescription, bodyHtml: product.bodyHtml, option1Name: product.option1Name ?? "", option2Name: product.option2Name ?? "", option3Name: product.option3Name ?? "", metafields: { ...product.metafields } });
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = (files: FileList | File[]) => {
    const form = new FormData();
    for (const f of Array.from(files)) form.append("files", f);
    if (variantForUrl) form.set("variantId", variantForUrl);
    start(async () => {
      const res = await fetch(`/api/catalog/products/${product.id}/image`, { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) setMessage({ tone: "danger", text: body.error });
      else if (body.warning) setMessage({ tone: "warning", text: body.warning });
      await refresh();
    });
  };

  const variantLabel = (id: string | null) => {
    const v = product.variants.find((x) => x.id === id);
    return v ? [v.option1Value, v.option2Value, v.option3Value].filter(Boolean).join(" / ") || v.sku : "All variants";
  };

  return (
    <div className="fixed inset-y-0 right-0 z-20 flex w-full max-w-md flex-col border-l border-[var(--line)] bg-white shadow-2xl">
      <header className="flex items-center justify-between border-b border-[var(--line-soft)] px-4 py-3">
        <div className="min-w-0"><div className="truncate text-sm font-semibold">{product.title}</div><div className="truncate font-mono text-[11px] text-[var(--ink-soft)]">{product.handle}</div></div>
        <button onClick={onClose} className="text-sm text-[var(--ink-soft)]">Close ✕</button>
      </header>
      <div className="flex border-b border-[var(--line-soft)] text-sm">
        {(["images", "details"] as const).map((t) => <button key={t} onClick={() => setTab(t)} className={cx("px-4 py-2", tab === t ? "border-b-2 border-[var(--violet)] font-medium" : "text-[var(--ink-soft)]")}>{t === "images" ? `Images (${product.images.length})` : "Details, SEO & metafields"}</button>)}
      </div>
      <div className="flex-1 overflow-auto p-4">
        {tab === "images" ? (
          <div className="space-y-4">
            {!locked && (
              <>
                <div className={cx("dropzone", dragging && "active")} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files); }}>
                  <div className="text-sm">Drop image files here</div>
                  <div className="mt-2 flex items-center justify-center gap-2"><Button size="sm" onClick={() => inputRef.current?.click()}>Choose files</Button><input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => e.target.files && upload(e.target.files)} /></div>
                  {!publicBaseUrl && <div className="mt-2 text-[11px] text-amber-700">Set a public base URL in Settings so uploaded images get public HTTPS links for Shopify.</div>}
                </div>
                <div className="flex gap-2">
                  <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… image URL" className={INPUT} />
                  <Button size="sm" disabled={!url || pending} onClick={() => start(async () => { const r = await addImageUrlAction(product.id, url, variantForUrl || null); setMessage(r.ok ? (r.data?.validated ? { tone: "success", text: "Image added." } : { tone: "warning", text: `Image added but could not be verified (${r.data?.reason}).` }) : { tone: "danger", text: r.error }); setUrl(""); await refresh(); })}>Add</Button>
                </div>
                <label className="block text-xs text-[var(--ink-soft)]">Attach new images to:
                  <select value={variantForUrl} onChange={(e) => setVariantForUrl(e.target.value)} className={`${INPUT} mt-1`}><option value="">Whole product</option>{product.variants.map((v) => <option key={v.id} value={v.id}>{variantLabel(v.id)} {v.sku && `(${v.sku})`}</option>)}</select>
                </label>
              </>
            )}
            <ul className="space-y-2">
              {product.images.map((img) => (
                <li key={img.id} className="flex items-center gap-3 rounded-lg border border-[var(--line-soft)] p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- supplier CDN hosts are arbitrary */}
                  <img src={img.url} alt="" className="h-14 w-14 rounded object-cover" />
                  <div className="min-w-0 flex-1 text-xs">
                    <div className="truncate" title={img.url}>#{img.position} · {img.source.toLowerCase()} {img.validated ? <span className="text-emerald-600">✓ reachable</span> : <span className="text-amber-700">unverified</span>}</div>
                    {!locked && <select value={img.variantId ?? ""} onChange={(e) => start(async () => { await setImageVariantAction(img.id, e.target.value || null); await refresh(); })} className="mt-1 w-full rounded border border-[var(--line)] px-1 py-0.5 text-[11px]"><option value="">Product image</option>{product.variants.map((v) => <option key={v.id} value={v.id}>Variant: {variantLabel(v.id)}</option>)}</select>}
                  </div>
                  {!locked && <div className="flex flex-col gap-1 text-[11px]"><button onClick={() => start(async () => { await moveImageAction(img.id, -1); await refresh(); })}>▲</button><button onClick={() => start(async () => { await moveImageAction(img.id, 1); await refresh(); })}>▼</button><button className="text-red-600" onClick={() => start(async () => { await removeImageAction(img.id); await refresh(); })}>✕</button></div>}
                </li>
              ))}
              {product.images.length === 0 && <li className="text-sm text-[var(--ink-soft)]">No images yet.</li>}
            </ul>
            {product.images.length > 0 && <Button size="sm" disabled={pending} onClick={() => start(async () => { const r = await saveImagesToLibraryAction(product.id); setMessage(r.ok ? { tone: "success", text: r.message ?? "Saved" } : { tone: "danger", text: r.error }); })}>Save these to the image library</Button>}
            {unassigned.length > 0 && !locked && (
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--ink-soft)]">Uploaded photos not attached yet</div>
                <ul className="space-y-2">
                  {unassigned.map((ph) => (
                    <li key={ph.id} className="flex items-center gap-3 rounded-lg border border-dashed border-[var(--line)] p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element -- uploaded photo */}
                      <img src={ph.url} alt="" className="h-14 w-14 rounded object-cover" />
                      <div className="min-w-0 flex-1 text-xs"><div className="truncate">{ph.filename}</div>{ph.hint && <div className="truncate text-[var(--ink-soft)]">AI saw: {ph.hint}</div>}</div>
                      <div className="flex flex-col gap-1 text-[11px]">
                        <button className="text-[var(--violet)]" onClick={() => start(async () => { await attachPhotoAction(ph.id, product.id, variantForUrl || null); await refresh(); })}>Attach here</button>
                        <button className="text-red-600" onClick={() => start(async () => { await deletePhotoAction(ph.id); await refresh(); })}>Discard</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <label className="block"><span className="text-xs font-medium text-[var(--ink-2)]">SEO title <span className="text-[var(--ink-soft)]">({details.seoTitle.length}/60)</span></span><input value={details.seoTitle} disabled={locked} onChange={(e) => setDetails({ ...details, seoTitle: e.target.value })} className={INPUT} /></label>
            <label className="block"><span className="text-xs font-medium text-[var(--ink-2)]">SEO description <span className="text-[var(--ink-soft)]">({details.seoDescription.length}/155)</span></span><textarea rows={3} value={details.seoDescription} disabled={locked} onChange={(e) => setDetails({ ...details, seoDescription: e.target.value })} className={INPUT} /></label>
            <label className="block"><span className="text-xs font-medium text-[var(--ink-2)]">Description (HTML)</span><textarea rows={6} value={details.bodyHtml} disabled={locked} onChange={(e) => setDetails({ ...details, bodyHtml: e.target.value })} className={`${INPUT} font-mono text-xs`} /></label>
            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--ink-soft)]">
              <span>{LOOKUP_SAID[product.lookupStatus] ?? "Not looked up yet."}</span>
              {product.lookupSource && <a href={product.lookupSource} target="_blank" rel="noreferrer" className="underline">source</a>}
              {!locked && <Button size="sm" disabled={pending} onClick={() => start(async () => { const r = await lookupProductsAction(batchId, { productIds: [product.id] }); setMessage(r.ok ? lookupMessage(r.data!) : { tone: "danger", text: r.error }); await refresh(); })}>Look this one up</Button>}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(["option1Name", "option2Name", "option3Name"] as const).map((k, i) => <label key={k} className="block"><span className="text-xs font-medium text-[var(--ink-2)]">Option {i + 1} name</span><input value={details[k]} disabled={locked} onChange={(e) => setDetails({ ...details, [k]: e.target.value })} className={INPUT} /></label>)}
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-[var(--ink-2)]">Ski metafields</div>
              <div className="grid grid-cols-2 gap-2">
                {["length_cm", "flex", "ability_level", "din_range", "terrain", "waist_width", "gender", "season", "model_code"].map((k) => (
                  <label key={k} className="block"><span className="text-[11px] text-[var(--ink-soft)]">{k.replace(/_/g, " ")}</span><input value={details.metafields[k] ?? ""} disabled={locked} onChange={(e) => setDetails({ ...details, metafields: { ...details.metafields, [k]: e.target.value } })} className={INPUT} /></label>
                ))}
              </div>
            </div>
            {!locked && <Button variant="primary" disabled={pending} onClick={() => start(async () => { const r = await updateProductAction(product.id, { seoTitle: details.seoTitle, seoDescription: details.seoDescription, bodyHtml: details.bodyHtml, option1Name: details.option1Name || null, option2Name: details.option2Name || null, option3Name: details.option3Name || null, metafields: details.metafields }); setMessage(r.ok ? { tone: "success", text: "Product details saved." } : { tone: "danger", text: r.error }); await refresh(); })}>Save details</Button>}
          </div>
        )}
      </div>
    </div>
  );
}
