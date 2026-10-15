"use client";

import Image from "next/image";
import { useState } from "react";

/**
 * The product as it is, not as drawn: real screens from a copy of Flöda with a supplier's order
 * read into it. One at a time, picked from the list beside it, inside a window frame.
 */
const SCREENS = [
  { id: "review", title: "The review grid", text: "Every product and variant in one grid: SKU, barcode, options, stock, cost, price and margin, with the totals for the whole order at the bottom. Nothing goes to Shopify until you have looked at it here.", src: "/shots/review-grid.jpg", width: 1800, height: 1433 },
  { id: "first", title: "A new supplier's first invoice", text: "The first invoice from a supplier gets a closer look: the five things a new layout gets wrong, listed above the grid, and what you fix is remembered for them.", src: "/shots/review-top.jpg", width: 1800, height: 1138 },
  { id: "suppliers", title: "Setup: your suppliers", text: "One example from each supplier, read on the spot. Every column is shown against what Flöda took it for, you fix anything in the wrong place, and the layout is remembered for that supplier.", src: "/shots/suppliers.jpg", width: 1800, height: 1138 },
  { id: "learn", title: "Setup: your catalogue", text: "Your Shopify export, read on your own computer, teaches Flöda your kinds of product, your menus and how you spell every tag. Only what was learned is kept.", src: "/shots/learn.jpg", width: 1800, height: 1138 },
  { id: "home", title: "Home", text: "The three jobs, and a checklist that walks a new shop through setup and goes away when it is done.", src: "/shots/home.jpg", width: 1800, height: 1138 },
  { id: "bulk", title: "Prices and stock", text: "Load your Shopify export, say the change in plain words or add a delivery, and check every cell that moves before you download the file.", src: "/shots/bulk.jpg", width: 1800, height: 1138 },
  { id: "tidy", title: "Tidy a document", text: "A photo or a scan of an order, pen marks and all, read into a table you can check and save as a CSV the other jobs take.", src: "/shots/tidy.jpg", width: 1800, height: 1138 },
  { id: "batches", title: "New products", text: "Each import is one supplier order that becomes one Shopify file. Who built it, when, and how many products and units.", src: "/shots/batches.jpg", width: 1800, height: 1138 },
];

export function Screens() {
  const [current, setCurrent] = useState(0);
  const s = SCREENS[current];
  return (
    <div className="screens">
      <div className="screens-list" role="tablist" aria-label="Screens">
        {SCREENS.map((sc, i) => (
          <button key={sc.id} type="button" role="tab" aria-selected={i === current} className={i === current ? "on" : ""} onClick={() => setCurrent(i)}>
            <span className="t">{sc.title}</span>
            <span className="x">{sc.text}</span>
          </button>
        ))}
      </div>
      <div className="screens-frame" role="tabpanel">
        <div className="chrome"><i /><i /><i /><span className="url">Flöda · {s.title}</span></div>
        <div className="shot" style={{ aspectRatio: `${s.width} / ${s.height}` }}>
          {SCREENS.map((sc, i) => (
            <Image key={sc.id} src={sc.src} alt={`${sc.title}: ${sc.text}`} width={sc.width} height={sc.height} sizes="(min-width: 860px) 760px, 100vw" priority={i === 0} className={i === current ? "on" : ""} />
          ))}
        </div>
      </div>
    </div>
  );
}
