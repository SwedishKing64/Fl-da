/**
 * A PDF order with a size grid under each product, read by where the words sit on the page.
 *
 * A buy-plan order printed from an ordering portal — the shop's Atomic boots and poles (asked
 * 2026-10-19) — gives each product a block: its name, then "SKU:", "Style:", "W/S:", "R/R:",
 * "Qty:", then a row of sizes with the quantities printed under them:
 *
 *   HAWX MAGNA 130 S        SKU: AE5034620   W/S: $614.97   Qty: 4
 *                           Style: Black / Red   R/R: $1,149.99
 *   25X 26X 27X 28X 29X 30X 31X
 *        1   1   1   1
 *
 * As plain text the quantities lose their columns — "1 1 1 1" under seven sizes says nothing — so
 * the text layer is read with positions instead: each size's place along its row, worked out from
 * where the row starts and how wide it is, and each quantity given to the size it sits under. No
 * model is asked, so it costs nothing and reads the same every time.
 *
 * "24X" is how these print a half size: 24.5 (the shop's own words). A row's quantities have to add
 * up to the product's "Qty:", or the product is said to need checking.
 */

import { getDocumentProxy } from "unpdf";
import type { InvoiceLine } from "../reconcile";

interface Word { s: string; x: number; y: number; w: number }
interface Line { y: number; words: Word[] }

/** One size as these grids print it: 24X, 24.5, 25, 110. */
const SIZE_TOKEN = /^(\d{2}X|\d{2}(\.5)?|\d{3}|[XSML]{1,3}|XXL)$/i;

/** A printed size as the shop writes it: "24X" is 24.5. */
export function sizeOf(token: string): string {
  const half = /^(\d{2})X$/i.exec(token.trim());
  return half ? `${half[1]}.5` : token.trim();
}

const money = (raw: string): number | null => {
  const v = raw.replace(/[$,\s]|AUD|NZD/gi, "");
  return /^\d+(\.\d+)?$/.test(v) ? Number(v) : null;
};

/** The words of a page, top to bottom, gathered into lines. */
function linesOf(words: Word[]): Line[] {
  const sorted = [...words].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Line[] = [];
  for (const w of sorted) {
    const line = lines.find((l) => Math.abs(l.y - w.y) <= 2);
    if (line) line.words.push(w);
    else lines.push({ y: w.y, words: [w] });
  }
  for (const l of lines) l.words.sort((a, b) => a.x - b.x);
  return lines.sort((a, b) => b.y - a.y);
}

/** A row of sizes, each with the middle of where it is printed. One printed run can hold them all. */
function sizeRow(line: Line): Array<{ size: string; x: number }> | null {
  const out: Array<{ size: string; x: number }> = [];
  for (const w of line.words) {
    const tokens = w.s.split(/(\s+)/);
    const perChar = w.w / Math.max(1, w.s.length);
    let at = 0;
    for (const t of tokens) {
      if (t.trim()) {
        if (!SIZE_TOKEN.test(t)) return null;
        out.push({ size: sizeOf(t), x: w.x + (at + t.length / 2) * perChar });
      }
      at += t.length;
    }
  }
  return out.length >= 2 ? out : null;
}

/** A row of quantities: small whole numbers and nothing else. */
const quantityRow = (line: Line): boolean => line.words.every((w) => /^\d{1,3}$/.test(w.s.trim()));

/** The value printed after a label on the same line: "SKU:" then "AE5034620". */
function valueAfter(lines: Line[], label: RegExp): string {
  for (const l of lines) {
    const at = l.words.findIndex((w) => label.test(w.s.trim()));
    if (at < 0) continue;
    const inline = l.words[at].s.replace(label, "").trim();
    if (inline) return inline;
    return l.words[at + 1]?.s.trim() ?? "";
  }
  return "";
}

export interface GridPdf { lines: InvoiceLine[]; brand: string; warnings: string[] }

/** Read the order's size grids. Null when the PDF has none — it is some other document. */
export async function readGridPdf(buffer: Buffer): Promise<GridPdf | null> {
  const doc = await getDocumentProxy(new Uint8Array(buffer));
  const pages: Line[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const words = (content.items as Array<{ str?: string; transform?: number[]; width?: number }>)
      .filter((i) => typeof i.str === "string" && i.str.trim() && i.transform)
      .map((i) => ({ s: i.str!.replace(/ /g, " "), x: i.transform![4], y: i.transform![5], w: i.width ?? 0 }));
    pages.push(linesOf(words));
  }
  const all = pages.flat();
  const text = all.map((l) => l.words.map((w) => w.s).join(" ")).join("\n");
  const brand = valueAfter(all, /^brand( name)?:/i);
  // What the lengths are, where the order says what it holds: "Alpine Poles" and no skis.
  const poles = /\bpoles?\b/i.test(text) && !/\bskis\b/i.test(text);

  const lines: InvoiceLine[] = [];
  const warnings: string[] = [];
  for (const page of pages) {
    for (let i = 0; i < page.length; i++) {
      const sizes = sizeRow(page[i]);
      if (!sizes) continue;
      // The product's block is the lines above the sizes, back to the previous grid.
      let top = i - 1;
      while (top > 0 && !sizeRow(page[top - 1]) && !quantityRow(page[top - 1])) top--;
      const block = page.slice(top, i);
      const sku = valueAfter(block, /^sku:/i);
      if (!sku) continue;
      // The name: the line above the one carrying "SKU:".
      const skuAt = block.findIndex((l) => l.words.some((w) => /^sku:/i.test(w.s.trim())));
      const title = (skuAt > 0 ? block[skuAt - 1] : block[0]).words.map((w) => w.s).join(" ").trim();
      const colour = valueAfter(block, /^(style|colou?r):/i);
      const cost = money(valueAfter(block, /^(w\/s|wholesale|cost):/i));
      const rrp = money(valueAfter(block, /^(r\/r|rrp|retail):/i));
      const stated = Number(valueAfter(block, /^qty:/i)) || null;
      // Each quantity to the size it sits under: the one whose middle is nearest its own.
      let ordered = 0;
      for (const q of page[i + 1] && quantityRow(page[i + 1]) ? page[i + 1].words : []) {
        const middle = q.x + q.w / 2;
        const under = sizes.reduce((best, s) => (Math.abs(s.x - middle) < Math.abs(best.x - middle) ? s : best));
        const quantity = Number(q.s.trim());
        if (!quantity) continue;
        lines.push({
          sku, barcode: "", title, colour, size: under.size, quantity, costPrice: cost, rrp,
          ...(brand ? { brand } : {}),
          // "HAWX MAGNA 85 W": the W is the women's model.
          ...(/\sW(\s|$)/.test(title) ? { gender: "Womens" } : {}),
          ...(/^\d{2}(\.5)?$/.test(under.size) ? { kind: "Ski Boots" } : poles && /^\d{3}$/.test(under.size) ? { kind: "Ski Poles" } : {}),
        });
        ordered += quantity;
      }
      if (stated !== null && ordered !== stated) warnings.push(`${title} (${sku}): the order says ${stated}, the size grid adds up to ${ordered} — check it.`);
    }
  }
  return lines.length > 0 ? { lines, brand, warnings } : null;
}
