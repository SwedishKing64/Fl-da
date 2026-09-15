// Shopify product CSV generation, validation and splitting.
//
// Rules implemented (see Shopify "Using CSV files" import spec):
//  - one row per variant; product-level fields only on the first row of each Handle
//  - additional images as extra rows carrying only Handle + Image Src + Image Position
//  - products without options use Option1 Name "Title" / Option1 Value "Default Title"
//  - straight quotes, comma delimiter, UTF-8, prices as plain decimals
//  - files are split so no part exceeds the size limit and a Handle never spans two parts

import { NO_VARIANT_OPTION, normaliseOptionName, normaliseOptionValue } from "./options";
import { defaultGrams } from "./variant-rules";
import { formatPrice } from "./money";
import { isValidHandle } from "./handle";

export interface CsvImage {
  url: string;
  position?: number;
  altText?: string;
}

export interface CsvVariant {
  sku: string;
  barcode?: string;
  option1Value?: string | null;
  option2Value?: string | null;
  option3Value?: string | null;
  grams?: number;
  quantity?: number;
  price: number;
  compareAtPrice?: number | null;
  costPerItem?: number | null;
  imageUrl?: string | null; // variant-specific image (Variant Image column)
  inventoryPolicy?: "deny" | "continue";
  requiresShipping?: boolean;
  taxable?: boolean;
}

export interface CsvProduct {
  handle: string;
  title: string;
  bodyHtml?: string;
  vendor?: string;
  productType?: string;
  tags?: string[]; // joined with ", "
  published?: boolean;
  status?: "draft" | "active" | "archived";
  seoTitle?: string;
  seoDescription?: string;
  option1Name?: string | null;
  option2Name?: string | null;
  option3Name?: string | null;
  collection?: string; // import-only "Collection" column (one per product)
  metafields?: Record<string, string>; // column name -> value, e.g. "Flex (product.metafields.ski.flex)"
  images: CsvImage[];
  variants: CsvVariant[];
}

export const CORE_COLUMNS = [
  "Handle",
  "Title",
  "Body (HTML)",
  "Vendor",
  "Type",
  "Tags",
  "Published",
  "Option1 Name",
  "Option1 Value",
  "Option2 Name",
  "Option2 Value",
  "Option3 Name",
  "Option3 Value",
  "Variant SKU",
  "Variant Grams",
  "Variant Inventory Tracker",
  "Variant Inventory Qty",
  "Variant Inventory Policy",
  "Variant Fulfillment Service",
  "Variant Price",
  "Variant Compare At Price",
  "Variant Requires Shipping",
  "Variant Taxable",
  "Variant Barcode",
  "Image Src",
  "Image Position",
  "Image Alt Text",
  "Gift Card",
  "SEO Title",
  "SEO Description",
  "Variant Image",
  "Variant Weight Unit",
  "Cost per item",
  "Collection",
  "Status",
] as const;

export type CsvRow = Record<string, string>;

export interface GenerateOptions {
  /** Extra metafield column names appended after the core columns (stable order). */
  metafieldColumns?: string[];
  /** Omit the import-only Collection column entirely. Default: include it. */
  includeCollectionColumn?: boolean;
}

/** Replace curly quotes and non-breaking spaces with straight ASCII equivalents; normalise newlines. */
export function straightenQuotes(value: string): string {
  return value
    .replace(/[\u2018\u2019\u201a\u201b\u2032]/g, "'")
    .replace(/[\u201c\u201d\u201e\u201f\u2033]/g, '"')
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n");
}

/** RFC 4180 quoting with straight quotes only. */
export function escapeCsvField(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = straightenQuotes(String(value));
  if (s === "") return "";
  if (/[",\n]/.test(s) || /^\s|\s$/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function columnsFor(options: GenerateOptions = {}): string[] {
  const cols = [...CORE_COLUMNS] as string[];
  const filtered = options.includeCollectionColumn === false ? cols.filter((c) => c !== "Collection") : cols;
  return [...filtered, ...(options.metafieldColumns ?? [])];
}

function bool(value: boolean | undefined, fallback: boolean): string {
  return (value ?? fallback) ? "TRUE" : "FALSE";
}

/** Build the ordered list of CSV rows (as column->value maps) for a set of products. */
export function buildRows(products: CsvProduct[], options: GenerateOptions = {}): CsvRow[] {
  void options;
  const rows: CsvRow[] = [];
  for (const product of products) {
    const hasOptions = !!(product.option1Name && product.option1Name.trim());
    const images = [...product.images].map((img, i) => ({ ...img, position: img.position ?? i + 1 }));
    images.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const variants = product.variants.length > 0 ? product.variants : [{ sku: "", price: 0 }];
    const metafields = product.metafields ?? {};

    variants.forEach((variant, index) => {
      const first = index === 0;
      const row: CsvRow = { Handle: product.handle };
      if (first) {
        row["Title"] = product.title;
        row["Body (HTML)"] = product.bodyHtml ?? "";
        row["Vendor"] = product.vendor ?? "";
        row["Type"] = product.productType ?? "";
        row["Tags"] = (product.tags ?? []).map((t) => t.trim()).filter(Boolean).join(", ");
        // Every product the importer builds arrives in the store as a draft, so someone looks at it
        // before a customer can. There is no setting for this: a product that went live straight
        // from an invoice would be a product nobody had read.
        row["Published"] = "FALSE";
        row["SEO Title"] = product.seoTitle ?? "";
        row["SEO Description"] = product.seoDescription ?? "";
        row["Gift Card"] = "FALSE";
        row["Collection"] = product.collection ?? "";
        row["Status"] = "draft";
        for (const [col, val] of Object.entries(metafields)) row[col] = val ?? "";
      }
      // Option names on every variant row (Shopify accepts them on the first row only, but
      // repeating them keeps re-imports and manual edits robust); values on every row.
      if (hasOptions) {
        // Last gate on spelling: the shop is Australian and writes Colour, and asks for the Zip
        // Side however an invoice spelled it.
        row["Option1 Name"] = normaliseOptionName(product.option1Name ?? "");
        row["Option1 Value"] = normaliseOptionValue(variant.option1Value ?? "");
        if (product.option2Name) {
          row["Option2 Name"] = normaliseOptionName(product.option2Name);
          row["Option2 Value"] = normaliseOptionValue(variant.option2Value ?? "");
        }
        if (product.option3Name) {
          row["Option3 Name"] = normaliseOptionName(product.option3Name);
          row["Option3 Value"] = normaliseOptionValue(variant.option3Value ?? "");
        }
      } else {
        row["Option1 Name"] = NO_VARIANT_OPTION.name;
        row["Option1 Value"] = NO_VARIANT_OPTION.value;
      }
      // The shop does not use SKUs — 64 of the 2,394 variant rows in its exports carry one — so
      // the column is left empty rather than filled with an identifier nobody reads. A SKU an
      // invoice supplied is still kept in the app, where it is useful for matching the invoice.
      row["Variant SKU"] = "";
      // The shop records a shipping band rather than a measured weight, so a ski is 2 kg and a
      // board 1 kg whatever the invoice says. A weight that came from the supplier is kept.
      // Zero is what an invoice that carries no weight leaves behind, so it means "unset" here.
      const grams = variant.grams || defaultGrams(product.productType ?? "", product.title);
      row["Variant Grams"] = String(Math.max(0, Math.round(grams)));
      row["Variant Inventory Tracker"] = "shopify";
      row["Variant Inventory Qty"] = String(Math.max(0, Math.round(variant.quantity ?? 0)));
      row["Variant Inventory Policy"] = variant.inventoryPolicy ?? "deny";
      row["Variant Fulfillment Service"] = "manual";
      row["Variant Price"] = formatPrice(variant.price);
      row["Variant Compare At Price"] =
        variant.compareAtPrice && variant.compareAtPrice > variant.price ? formatPrice(variant.compareAtPrice) : "";
      row["Variant Requires Shipping"] = bool(variant.requiresShipping, true);
      row["Variant Taxable"] = bool(variant.taxable, true);
      row["Variant Barcode"] = variant.barcode ?? "";
      // Grams is always grams; this is the unit the shop reads them in, on all 2,394 rows.
      row["Variant Weight Unit"] = "kg";
      row["Cost per item"] = variant.costPerItem != null ? formatPrice(variant.costPerItem) : "";
      row["Variant Image"] = variant.imageUrl ?? "";
      // Image N rides on variant row N (first image on first row), overflow becomes extra rows.
      const image = images[index];
      if (image) {
        row["Image Src"] = image.url;
        row["Image Position"] = String(image.position);
        row["Image Alt Text"] = image.altText ?? "";
      }
      rows.push(row);
    });

    for (let i = variants.length; i < images.length; i++) {
      const image = images[i];
      rows.push({
        Handle: product.handle,
        "Image Src": image.url,
        "Image Position": String(image.position),
        "Image Alt Text": image.altText ?? "",
      });
    }
  }
  return rows;
}

export function serialiseRows(rows: CsvRow[], columns: string[]): string {
  const header = columns.map(escapeCsvField).join(",");
  const lines = rows.map((row) => columns.map((c) => escapeCsvField(row[c])).join(","));
  return [header, ...lines].join("\n") + "\n";
}

export function generateCsv(products: CsvProduct[], options: GenerateOptions = {}): string {
  return serialiseRows(buildRows(products, options), columnsFor(options));
}

// ---------------------------------------------------------------------------
// Splitting
// ---------------------------------------------------------------------------

export const SHOPIFY_MAX_BYTES = 15 * 1024 * 1024;

export interface CsvPart {
  index: number;
  content: string;
  rowCount: number;
  bytes: number;
  handles: string[];
}

/**
 * Split products into files that each stay under `maxBytes` (default ~14.5MB for headroom)
 * and `maxRows`. A product's rows are never split across two files.
 */
export function generateCsvParts(
  products: CsvProduct[],
  options: GenerateOptions & { maxBytes?: number; maxRows?: number } = {},
): CsvPart[] {
  const maxBytes = options.maxBytes ?? Math.floor(SHOPIFY_MAX_BYTES * 0.97);
  const maxRows = options.maxRows ?? Number.POSITIVE_INFINITY;
  const columns = columnsFor(options);
  const header = columns.map(escapeCsvField).join(",") + "\n";
  const headerBytes = Buffer.byteLength(header, "utf8");

  const parts: CsvPart[] = [];
  let current: { lines: string[]; bytes: number; handles: string[] } = { lines: [], bytes: headerBytes, handles: [] };

  const flush = () => {
    if (current.lines.length === 0) return;
    const content = header + current.lines.join("\n") + "\n";
    parts.push({
      index: parts.length + 1,
      content,
      rowCount: current.lines.length,
      bytes: Buffer.byteLength(content, "utf8"),
      handles: current.handles,
    });
    current = { lines: [], bytes: headerBytes, handles: [] };
  };

  for (const product of products) {
    const rows = buildRows([product], options);
    const lines = rows.map((row) => columns.map((c) => escapeCsvField(row[c])).join(","));
    const bytes = lines.reduce((s, l) => s + Buffer.byteLength(l, "utf8") + 1, 0);
    const wouldExceed = current.bytes + bytes > maxBytes || current.lines.length + lines.length > maxRows;
    if (wouldExceed && current.lines.length > 0) flush();
    current.lines.push(...lines);
    current.bytes += bytes;
    current.handles.push(product.handle);
  }
  flush();
  return parts;
}

// ---------------------------------------------------------------------------
// Validation (structural, on the CsvProduct model) + file-level re-parse check
// ---------------------------------------------------------------------------

export interface CsvIssue {
  level: "error" | "warning";
  handle?: string;
  message: string;
}

export function isPublicHttpsUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
    if (/^(127\.|10\.|192\.168\.|0\.|169\.254\.)/.test(host)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
    if (!host.includes(".")) return false;
    return true;
  } catch {
    return false;
  }
}

export function validateProducts(products: CsvProduct[]): CsvIssue[] {
  const issues: CsvIssue[] = [];
  const seenHandles = new Map<string, CsvProduct>();
  const seenSkus = new Map<string, string>();

  for (const p of products) {
    const h = p.handle;
    if (!h || !isValidHandle(h)) issues.push({ level: "error", handle: h, message: `Invalid handle "${h}" (lowercase letters, numbers and hyphens only)` });
    if (!p.title?.trim()) issues.push({ level: "error", handle: h, message: "Missing title" });
    const dup = seenHandles.get(h);
    if (dup) {
      const conflicting = dup.title !== p.title || (dup.vendor ?? "") !== (p.vendor ?? "") || (dup.option1Name ?? "") !== (p.option1Name ?? "");
      issues.push({
        level: "error",
        handle: h,
        message: conflicting
          ? `Duplicate handle "${h}" with conflicting product fields`
          : `Duplicate handle "${h}" (merge the variants into one product)`,
      });
    } else seenHandles.set(h, p);

    if (p.option2Name && !p.option1Name) issues.push({ level: "error", handle: h, message: "Option2 set without Option1" });
    if (p.option3Name && !p.option2Name) issues.push({ level: "error", handle: h, message: "Option3 set without Option2" });
    const names = [p.option1Name, p.option2Name, p.option3Name].filter(Boolean).map((n) => n!.toLowerCase());
    if (new Set(names).size !== names.length) issues.push({ level: "error", handle: h, message: "Option names must be distinct" });

    const combos = new Set<string>();
    for (const v of p.variants) {
      if (p.option1Name) {
        if (!v.option1Value?.toString().trim()) issues.push({ level: "error", handle: h, message: `Variant ${v.sku || "(no sku)"} is missing a value for ${p.option1Name}` });
        if (p.option2Name && !v.option2Value?.toString().trim()) issues.push({ level: "error", handle: h, message: `Variant ${v.sku || "(no sku)"} is missing a value for ${p.option2Name}` });
        if (p.option3Name && !v.option3Value?.toString().trim()) issues.push({ level: "error", handle: h, message: `Variant ${v.sku || "(no sku)"} is missing a value for ${p.option3Name}` });
      }
      const combo = [v.option1Value ?? "", v.option2Value ?? "", v.option3Value ?? ""].join(" ").toLowerCase();
      if (combos.has(combo)) issues.push({ level: "error", handle: h, message: `Duplicate option combination "${[v.option1Value, v.option2Value, v.option3Value].filter(Boolean).join(" / ") || "Default Title"}"` });
      combos.add(combo);
      if (!Number.isFinite(v.price) || v.price < 0) issues.push({ level: "error", handle: h, message: `Variant ${v.sku || "(no sku)"} has no valid price` });
      if (v.sku) {
        const prev = seenSkus.get(v.sku.toLowerCase());
        if (prev && prev !== h) issues.push({ level: "error", handle: h, message: `SKU ${v.sku} is also used by "${prev}"` });
        else if (prev === h) issues.push({ level: "error", handle: h, message: `SKU ${v.sku} appears twice in this product` });
        else seenSkus.set(v.sku.toLowerCase(), h);
      }
      if (v.imageUrl && !isPublicHttpsUrl(v.imageUrl)) issues.push({ level: "error", handle: h, message: `Variant image is not a public HTTPS URL: ${v.imageUrl}` });
    }
    if (p.variants.length > 100) issues.push({ level: "error", handle: h, message: "Shopify allows at most 100 variants per product" });
    if (p.images.length === 0) issues.push({ level: "warning", handle: h, message: "No images" });
    for (const img of p.images) {
      if (!isPublicHttpsUrl(img.url)) issues.push({ level: "error", handle: h, message: `Image is not a public HTTPS URL: ${img.url}` });
    }
  }
  return issues;
}

/** Minimal RFC 4180 parser used to re-validate generated files (and read simple uploads). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^\ufeff/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export const REQUIRED_COLUMNS = ["Handle", "Title", "Option1 Name", "Option1 Value", "Variant Price"];

/** Validate a generated CSV file by re-parsing it: structure, columns, handles, option consistency, images. */
export function validateCsvFile(content: string): CsvIssue[] {
  const issues: CsvIssue[] = [];
  if (/[\u2018\u2019\u201c\u201d]/.test(content)) issues.push({ level: "error", message: "File contains curly quotes" });
  const rows = parseCsv(content);
  if (rows.length < 2) return [{ level: "error", message: "CSV has no data rows" }];
  const header = rows[0];
  for (const col of REQUIRED_COLUMNS) if (!header.includes(col)) issues.push({ level: "error", message: `Missing required column ${col}` });
  const idx = (name: string) => header.indexOf(name);
  const iHandle = idx("Handle"), iTitle = idx("Title"), iO1 = idx("Option1 Name"), iO2 = idx("Option2 Name"), iO3 = idx("Option3 Name");
  const iO1v = idx("Option1 Value"), iO2v = idx("Option2 Value"), iO3v = idx("Option3 Value"), iImg = idx("Image Src"), iPrice = idx("Variant Price"), iVendor = idx("Vendor");

  const byHandle = new Map<string, { title: string; vendor: string; names: string; combos: Set<string>; firstRow: number }>();
  let lastHandle: string | null = null;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length === 1 && row[0] === "") continue;
    if (row.length !== header.length) issues.push({ level: "error", message: `Row ${r + 1} has ${row.length} columns, expected ${header.length}` });
    const handle = row[iHandle] ?? "";
    if (!isValidHandle(handle)) issues.push({ level: "error", handle, message: `Row ${r + 1}: invalid handle "${handle}"` });
    const isImageOnly = (row[iTitle] ?? "") === "" && (row[iPrice] ?? "") === "" && (row[iImg] ?? "") !== "";
    const names = [row[iO1], iO2 >= 0 ? row[iO2] : "", iO3 >= 0 ? row[iO3] : ""].map((s) => s ?? "").join("|");
    const existing = byHandle.get(handle);
    if (!existing) {
      if ((row[iTitle] ?? "") === "") issues.push({ level: "error", handle, message: `First row for "${handle}" has no Title` });
      byHandle.set(handle, { title: row[iTitle] ?? "", vendor: row[iVendor] ?? "", names, combos: new Set(), firstRow: r });
    } else {
      if (lastHandle !== handle) issues.push({ level: "error", handle, message: `Rows for handle "${handle}" are not contiguous (row ${r + 1})` });
      if ((row[iTitle] ?? "") !== "" && row[iTitle] !== existing.title) issues.push({ level: "error", handle, message: `Conflicting Title for "${handle}" at row ${r + 1}` });
      if ((row[iVendor] ?? "") !== "" && row[iVendor] !== existing.vendor) issues.push({ level: "error", handle, message: `Conflicting Vendor for "${handle}" at row ${r + 1}` });
      if (!isImageOnly && names.replace(/\|/g, "") !== "" && names !== existing.names) issues.push({ level: "error", handle, message: `Inconsistent option names for "${handle}" at row ${r + 1}` });
    }
    if (!isImageOnly) {
      const combo = [row[iO1v], iO2v >= 0 ? row[iO2v] : "", iO3v >= 0 ? row[iO3v] : ""].map((s) => (s ?? "").toLowerCase()).join("|");
      const bucket = byHandle.get(handle)!;
      if (bucket.combos.has(combo)) issues.push({ level: "error", handle, message: `Duplicate option values for "${handle}" at row ${r + 1}` });
      bucket.combos.add(combo);
      const price = row[iPrice] ?? "";
      if (!/^\d+(\.\d{1,2})?$/.test(price)) issues.push({ level: "error", handle, message: `Row ${r + 1}: Variant Price "${price}" is not a plain decimal` });
    }
    const img = iImg >= 0 ? row[iImg] ?? "" : "";
    if (img && !isPublicHttpsUrl(img)) issues.push({ level: "error", handle, message: `Row ${r + 1}: image URL is not public HTTPS (${img})` });
    lastHandle = handle;
  }
  return issues;
}
