import { describe, expect, it } from "vitest";
import { readGridPdf, sizeOf } from "./pdf-grid";

/**
 * A one-page PDF with text placed where an ordering portal's buy-plan prints it — the layout of the
 * shop's Atomic boot and pole order (2026-10-19). Written by hand so no supplier figures are kept;
 * the prices are made up.
 */
function pdfOf(texts: Array<[number, number, string]>): Buffer {
  const content = texts.map(([x, y, t]) => `BT /F1 10 Tf ${x} ${y} Td (${t.replace(/[()\\]/g, "\\$&")}) Tj ET`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 850] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, "latin1");
}

// Courier at 10pt is 6pt a character, so a size's place along its row is known exactly.
const ORDER = pdfOf([
  [17, 800, "Brand Name:"], [80, 800, "Atomic"],
  [100, 700, "HAWX MAGNA 130 S"],
  [100, 688, "SKU:"], [130, 688, "AE0000001"], [280, 688, "W/S:"], [310, 688, "$600.00"], [400, 688, "Qty:"], [430, 688, "3"],
  [100, 676, "Style:"], [140, 676, "Black / Red"], [280, 676, "R/R:"], [310, 676, "$1,100.00"],
  // 25X starts at 57; each size is four characters (24pt) on from the last: 26X at 81, 27X at 105.
  [57, 640, "25X 26X 27X 28X"],
  [84, 628, "1"], [108, 628, "2"],
  [100, 560, "REVENT LITE"],
  [100, 548, "SKU:"], [130, 548, "AJ0000002"], [280, 548, "W/S:"], [310, 548, "$30.00"], [400, 548, "Qty:"], [430, 548, "1"],
  [100, 536, "Style:"], [140, 536, "Black"], [280, 536, "R/R:"], [310, 536, "$60.00"],
  [57, 500, "110 115 120"],
  [108, 488, "1"],
  [17, 400, "Alpine Poles"],
]);

describe("a PDF order with a size grid under each product", () => {
  it("gives each quantity to the size printed above it, with the product's code, colour and prices", async () => {
    const read = (await readGridPdf(ORDER))!;
    expect(read.brand).toBe("Atomic");
    expect(read.lines.map((l) => [l.title, l.sku, l.colour, l.size, l.quantity, l.costPrice, l.rrp, l.kind])).toEqual([
      ["HAWX MAGNA 130 S", "AE0000001", "Black / Red", "26.5", 1, 600, 1100, "Ski Boots"],
      ["HAWX MAGNA 130 S", "AE0000001", "Black / Red", "27.5", 2, 600, 1100, "Ski Boots"],
      ["REVENT LITE", "AJ0000002", "Black", "120", 1, 30, 60, "Ski Poles"],
    ]);
    expect(read.warnings).toEqual([]);
  });

  it("writes a half size printed with an X as the shop writes it", () => {
    expect(["24X", "25x", "26", "110", "M"].map(sizeOf)).toEqual(["24.5", "25.5", "26", "110", "M"]);
  });

  it("finds nothing in a PDF with no size grid", async () => {
    expect(await readGridPdf(pdfOf([[50, 700, "Tax invoice 123"], [50, 680, "Total $100.00"]]))).toBeNull();
  });
});
