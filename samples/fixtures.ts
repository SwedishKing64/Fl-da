// Sample supplier documents + the deterministic run used for regression fixtures.

import { extractCsv, gridToTable } from "../src/lib/catalog/extract/tabular";
import { extractHeuristic } from "../src/lib/catalog/extract/heuristic";
import { suggestMapping } from "../src/lib/catalog/mapping";
import { DEFAULT_CATEGORY_RULES } from "../src/lib/catalog/categorize";
import { runOffline, type OfflineResult } from "../src/lib/catalog/offline";

export const FIXTURE_SETTINGS = { gstRate: 0.1, pricesIncludeGst: true, minMarginPct: 20 };


/** 1. Atomic pre-book: AUD, ex-GST, tidy CSV with image URLs and RRP. */
const ATOMIC_CSV = `Style No,Item Description,Colour,Length (cm),EAN,Qty,WHS Price,RRP,Image URL,Category,Season
AA0029,Bent 90 Skis,Blue/Black,166,874452900016,2,450.00,999.00,https://images.example-cdn.com/atomic/bent-90-blue.jpg,Skis,2026
AA0029,Bent 90 Skis,Blue/Black,172,874452900023,3,450.00,999.00,https://images.example-cdn.com/atomic/bent-90-blue.jpg,Skis,2026
AA0029,Bent 90 Skis,Blue/Black,178,874452900030,2,450.00,999.00,https://images.example-cdn.com/atomic/bent-90-blue.jpg,Skis,2026
AE5031,Hawx Ultra 100 Ski Boots,Black/Orange,,874453100101,1,320.00,749.00,https://images.example-cdn.com/atomic/hawx-ultra-100.jpg,Boots,2026
AE5031,Hawx Ultra 100 Ski Boots,Black/Orange,,874453100118,2,320.00,749.00,https://images.example-cdn.com/atomic/hawx-ultra-100.jpg,Boots,2026
AE5031,Hawx Ultra 100 Ski Boots,Black/Orange,,874453100125,1,320.00,749.00,https://images.example-cdn.com/atomic/hawx-ultra-100.jpg,Boots,2026
AX9000,Alps Beanie,Charcoal,,874459000016,12,9.50,29.95,,Accessories,2026
`;
// Boot sizes live in a separate "Size" column in the real file; simulate with a second header set.
const ATOMIC_CSV_WITH_SIZE = ATOMIC_CSV.split("\n").map((line, i) => {
  if (i === 0) return line + ",Size";
  if (!line) return line;
  const sizes: Record<string, string> = { "874453100101": "26.5", "874453100118": "27.5", "874453100125": "28.5" };
  const ean = line.split(",")[4];
  return line + "," + (sizes[ean] ?? "");
}).join("\n");

/** 2. Völkl/Marker: USD, no GST, XLSX with a preamble above the header, line totals instead of unit prices. */
const VOLKL_HEADERS = ["Article No", "Model", "Brand", "Size", "Color", "Pieces", "Amount USD"];
const VOLKL_ROWS = [
  { "Article No": "V2410170", Model: "M6 Mantra", Brand: "Völkl", Size: "170", Color: "Black", Pieces: 2, "Amount USD": 1100 },
  { "Article No": "V2410177", Model: "M6 Mantra", Brand: "Völkl", Size: "177", Color: "Black", Pieces: 2, "Amount USD": 1100 },
  { "Article No": "V2410184", Model: "M6 Mantra", Brand: "Völkl", Size: "184", Color: "Black", Pieces: 1, "Amount USD": 550 },
  { "Article No": "M7201100", Model: "Griffon 13 ID Bindings 100mm", Brand: "Marker", Size: "100", Color: "Anthracite", Pieces: 4, "Amount USD": 640 },
  { "Article No": "M7201110", Model: "Griffon 13 ID Bindings 110mm", Brand: "Marker", Size: "110", Color: "Anthracite", Pieces: 2, "Amount USD": 320 },
];

/** 3. Burton: a text-only invoice (as extracted from a PDF), AUD inc GST. */
const BURTON_TEXT = `BURTON SNOWBOARDS AUSTRALIA PTY LTD
TAX INVOICE  INV-20931   All prices AUD inc GST

SKU          Description                              Qty   Unit     Total
BUR-CUST-154 Custom Snowboard 154cm                     2   462.00   924.00
BUR-CUST-158 Custom Snowboard 158cm                     3   462.00  1386.00
BUR-CUST-162 Custom Snowboard 162cm                     1   462.00   462.00
BUR-CART-M   Cartel Bindings size M Black               3   231.00   693.00
BUR-CART-L   Cartel Bindings size L Black               2   231.00   462.00

Freight                                                        55.00
Subtotal                                                     3982.00
`;

export interface Fixtures {
  atomic: { csvSource: string };
  volkl: { headers: string[]; rows: typeof VOLKL_ROWS };
  burton: { text: string };
  results: Record<string, OfflineResult>;
}

export function buildFixtures(): Fixtures {
  const results: Record<string, OfflineResult> = {};

  const atomicTable = extractCsv(Buffer.from(ATOMIC_CSV_WITH_SIZE));
  results.atomic = runOffline(
    atomicTable,
    suggestMapping(atomicTable.headers),
    { fixed: { brand: "Atomic" } },
    { currency: "AUD", fxRateToHome: 1, gstTreatment: "EXCLUSIVE", freightTotalHome: 0, freightMode: "PER_UNIT" },
    DEFAULT_CATEGORY_RULES,
    FIXTURE_SETTINGS,
  );

  const volklGrid = [["VÖLKL / MARKER AUSTRALIA"], ["Tax Invoice 88213", "", "", "Prices are USD, no GST"], [], VOLKL_HEADERS, ...VOLKL_ROWS.map((r) => VOLKL_HEADERS.map((h) => String((r as Record<string, string | number>)[h])))];
  const volklTable = gridToTable(volklGrid, "XLSX");
  const volklMapping = suggestMapping(volklTable.headers);
  volklMapping["Size"] = "length"; // supplier calls ski length "Size"
  results.volkl = runOffline(
    volklTable,
    volklMapping,
    { costIsLineTotal: true, fixed: { season: "2026" } },
    { currency: "USD", fxRateToHome: 1.52, gstTreatment: "NONE", freightTotalHome: 220, freightMode: "BY_VALUE" },
    DEFAULT_CATEGORY_RULES,
    FIXTURE_SETTINGS,
  );

  const burtonTable = extractHeuristic(BURTON_TEXT);
  results.burton = runOffline(
    burtonTable,
    suggestMapping(burtonTable.headers),
    { fixed: { brand: "Burton" } },
    { currency: "AUD", fxRateToHome: 1, gstTreatment: "INCLUSIVE", freightTotalHome: 55, freightMode: "PER_UNIT" },
    DEFAULT_CATEGORY_RULES,
    FIXTURE_SETTINGS,
  );

  return { atomic: { csvSource: ATOMIC_CSV_WITH_SIZE }, volkl: { headers: VOLKL_HEADERS, rows: VOLKL_ROWS }, burton: { text: BURTON_TEXT }, results };
}
