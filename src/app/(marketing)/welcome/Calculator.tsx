"use client";

import { useState } from "react";
import { PLANS, planOf, type PlanId } from "@/lib/catalog/plans";

/**
 * What Flöda saves a shop, in its own numbers. Three things the shop knows (what an hour costs,
 * how many products a month, how long a hundred take by hand) and one thing Flöda knows (it reads,
 * matches and prices a hundred products in about fifteen minutes), with the checking time left
 * adjustable because it is the shop's. The plan is suggested from the volume.
 */

/**
 * How long Flöda itself takes: about 15 minutes for 100 products, never under 5 for an order of
 * any size, and less per product as an order grows, because the reading, the matching and the
 * brand pages are done in parallel and a bigger order shares the fixed part.
 */
const FLODA_MIN_PER_100 = 15;
const FLODA_FLOOR_MIN = 5;
function flodaMinutes(products: number): number {
  return Math.max(FLODA_FLOOR_MIN, FLODA_MIN_PER_100 * Math.pow(products / 100, 0.75));
}

function suggest(products: number): PlanId {
  const fit = PLANS.find((p) => p.products === null || products <= p.products);
  return (fit ?? PLANS[PLANS.length - 1]).id;
}

const money = (n: number) => `$${Math.round(n).toLocaleString("en-AU")}`;
const hours = (h: number) => (h >= 10 ? `${Math.round(h)} h` : `${Math.round(h * 10) / 10} h`);

export function Calculator() {
  const [wage, setWage] = useState(30);
  const [products, setProducts] = useState(200);
  const [handHours, setHandHours] = useState(24);
  const [checkHours, setCheckHours] = useState(1.5);

  const hundreds = products / 100;
  const byHandHours = hundreds * handHours;
  const flodaOwnHours = flodaMinutes(products) / 60;
  const flodaHours = flodaOwnHours + hundreds * checkHours;
  const byHandCost = byHandHours * wage;
  const flodaStaffCost = flodaHours * wage;
  const plan = planOf(suggest(products));
  const flodaCost = flodaStaffCost + plan.price;
  const saved = byHandCost - flodaCost;
  const hoursSaved = byHandHours - flodaHours;
  const times = plan.price > 0 ? (byHandCost - flodaStaffCost) / plan.price : 0;

  return (
    <div className="calc" aria-label="What Flöda saves you">
      <div className="calc-in">
        <label>
          <span className="l">What an hour of staff time costs</span>
          <span className="v">${wage}<small>/h</small></span>
          <input type="range" min={20} max={80} step={1} value={wage} onChange={(e) => setWage(Number(e.target.value))} aria-label="Hourly wage" />
        </label>
        <label>
          <span className="l">Products/variants you list a month</span>
          <span className="v">{products}</span>
          <input type="range" min={25} max={2000} step={25} value={products} onChange={(e) => setProducts(Number(e.target.value))} aria-label="Products/variants a month" />
        </label>
        <label>
          <span className="l">Hours to list 100 products/variants by hand</span>
          <span className="v">{handHours}<small> h</small></span>
          <input type="range" min={4} max={60} step={1} value={handHours} onChange={(e) => setHandHours(Number(e.target.value))} aria-label="Hours per 100 products/variants by hand" />
          <span className="h">Typing names, sizes, colours, prices; finding pictures; writing a description; checking it.</span>
        </label>
        <label>
          <span className="l">Your checking time per 100, through Flöda</span>
          <span className="v">{checkHours}<small> h</small></span>
          <input type="range" min={0.25} max={6} step={0.25} value={checkHours} onChange={(e) => setCheckHours(Number(e.target.value))} aria-label="Checking hours per 100 products/variants" />
          <span className="h">Looking over the grid and pressing import. Flöda&rsquo;s own time for your {products} products/variants is about {Math.round(flodaMinutes(products))} minutes.</span>
        </label>
      </div>
      <div className="calc-out">
        <div className="big">
          <span className="l">Kept every month</span>
          <span className="n">{saved >= 0 ? money(saved) : `−${money(-saved)}`}</span>
          <span className="s">{hours(hoursSaved)} of staff time back, after the {plan.name} plan&rsquo;s ${plan.price}</span>
        </div>
        <div className="rows">
          <div><span>By hand</span><b>{hours(byHandHours)} · {money(byHandCost)}</b></div>
          <div><span>Through Flöda</span><b>{hours(flodaHours)} · {money(flodaStaffCost)}</b></div>
          <div><span>Suggested plan</span><b>{plan.name} · ${plan.price} a month</b></div>
          <div><span>Pays for itself</span><b>{times >= 1 ? `${times >= 10 ? Math.round(times) : Math.round(times * 10) / 10} times over` : "not at this volume"}</b></div>
        </div>
        <p className="fine">Flöda reads, matches, prices and illustrates about 100 products/variants in {FLODA_MIN_PER_100} minutes, never under {FLODA_FLOOR_MIN} for an order of any size, and less per product/variant on a big order, because the reading and the brand pages run side by side. The checking is yours and the slider is how long you give it. The plan is suggested from the products/variants a month: {PLANS.map((p) => `${p.name} up to ${p.products ?? "any number"}`).join(", ")}.</p>
      </div>
    </div>
  );
}
