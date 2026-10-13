// Deterministic, no-API fallback for plain-text invoices. Finds lines that look like
// "<code> <description> <qty> <unit price> [<total>]" and turns them into rows. It is
// deliberately conservative: it's better to return fewer rows than to invent data.

import type { ExtractedTable } from "./types";

const MONEY = String.raw`[$€£]?\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})|[$€£]?\s?\d+\.\d{2}`;
const LINE_RE = new RegExp(
  String.raw`^\s*(?<code>[A-Z0-9][A-Z0-9\-_/.]{2,})\s+(?<desc>.+?)\s+(?<qty>\d{1,4})\s+(?<price>${MONEY})(?:\s+(?<total>${MONEY}))?\s*$`,
  "i",
);
const LENGTH_RE = /\b(1[0-9]{2}|2[01][0-9])\s?cm\b|\b(1[3-9][0-9]|20[0-9])\b(?=\s*(?:\/|$|\s))/;
const SIZE_RE = /\b(?:size|sz|mp|mondo)\s*:?\s*(\d{2}(?:\.\d)?|XXS|XS|S|M|L|XL|XXL|3XL)\b/i;
const COLOUR_RE = /\b(black|white|red|blue|green|yellow|orange|grey|gray|navy|teal|purple|pink|silver|gold|olive|charcoal|sand|ice|mint|lime|coral|burgundy|maroon|tan|brown)\b/i;

export const HEURISTIC_HEADERS = ["SKU", "Description", "Qty", "Unit Price", "Length", "Size", "Colour"];

export function extractHeuristic(text: string): ExtractedTable {
  const rows: Record<string, string>[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s{2,}/g, "  ").trim();
    if (!line) continue;
    const m = LINE_RE.exec(line);
    if (!m?.groups) continue;
    const desc = m.groups.desc.trim();
    const length = LENGTH_RE.exec(desc);
    const size = SIZE_RE.exec(desc);
    const colour = COLOUR_RE.exec(desc);
    rows.push({
      SKU: m.groups.code,
      Description: desc,
      Qty: m.groups.qty,
      "Unit Price": m.groups.price.replace(/[$€£\s]/g, ""),
      Length: length ? (length[1] ?? length[2] ?? "") : "",
      Size: size ? size[1] : "",
      Colour: colour ? colour[1][0].toUpperCase() + colour[1].slice(1).toLowerCase() : "",
    });
  }
  return {
    headers: HEURISTIC_HEADERS,
    rows,
    method: "HEURISTIC",
    text,
    warnings: rows.length === 0 ? ["No line items recognised. Set ANTHROPIC_API_KEY for AI extraction, or upload a CSV/XLSX."] : ["Extracted without AI (pattern matching). Check quantities and prices carefully."],
  };
}
