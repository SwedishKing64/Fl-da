/**
 * Which brand a product is, as against who sent it.
 *
 * A shop buys through distributors — one sends two brands' goods on one order form — and the batch
 * is filed under the distributor. Its name must never become the brand of anything whose files did
 * not print one: a distributor is not a brand, and a vendor filled in wrongly is worse than one
 * left empty for somebody to see.
 *
 * So a brand is only ever a name the trade pack knows as a brand, or one the shop already lists as
 * a vendor — found in the order's own tab names, in the file's name, or in the product's name.
 */

import { packInForce, snowTrade } from "./taxonomy";
import { SNOWBOARD_BRANDS } from "./trades/snow/brands";

/** The brands the trade in force knows. A shop on no trade knows only its own vendors. */
const tradeBrands = (): string[] => packInForce().brands ?? [];
const distributors = (): string[] => packInForce().distributors ?? [];
/** The ski and snowboard rules apply wherever the shop sells them, pack or no pack, so this knowledge comes with them. */
const snowboardBrands = (): string[] => packInForce().snowboardBrands ?? (snowTrade() ? SNOWBOARD_BRANDS : []);

export function isSnowboardBrand(name: string): boolean {
  const n = fold(name);
  return n !== "" && snowboardBrands().some((b) => fold(b) === n);
}

export function isDistributor(name: string): boolean {
  const n = fold(name);
  return n !== "" && distributors().some((d) => fold(d) === n);
}

const fold = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

/**
 * The first brand named in the text, as the shop spells it — the shop's own vendor spelling where it
 * has one ("Volkl", not "Völkl" or "VOLKL"). Longer names win, so "Black Crows" is not "Black".
 */
export function brandIn(text: string, vendors: string[] = []): string {
  const hay = ` ${fold(text)} `;
  if (!hay.trim()) return "";
  const byFold = new Map<string, string>();
  for (const b of tradeBrands()) byFold.set(fold(b), b);
  for (const v of vendors) if (v.trim()) byFold.set(fold(v), v.trim()); // the shop's spelling wins
  const names = [...byFold.keys()].filter((k) => k.length >= 2).sort((a, b) => b.length - a.length);
  // "Line" and "Now" and "Yes" are words as well as brands: only as the WHOLE text, or first.
  const ordinary = new Set(["LINE", "NOW", "YES", "LOOK", "RIDE", "ROME", "FLUX", "UNION", "MOMENT", "HEAD"]);
  for (const name of names) {
    if (ordinary.has(name) ? !(hay.trim() === name || hay.startsWith(` ${name} `)) : !hay.includes(` ${name} `)) continue;
    return byFold.get(name) ?? "";
  }
  return "";
}

/** Whether a name is a brand: one the trade knows, or one the shop already sells under. */
export function isBrand(name: string, vendors: string[] = []): boolean {
  const n = fold(name);
  return n !== "" && [...tradeBrands(), ...vendors].some((b) => fold(b) === n);
}

/**
 * Which of an order's brands an instruction keeps, or null when it is not about that.
 *
 * Burton's confirmation carries Burton and Anon on the one sheet, and the shop does them one at a
 * time: "only Burton", "just the Burton for now", "start with Burton", "leave out Anon", "not the
 * Anon". Read against the brands actually on the order, so "only Burton" on an all-Burton order is
 * nothing to do, and a brand the order does not carry is not a filter.
 */
export function brandsAsked(instruction: string, onOrder: string[]): string[] | null {
  const t = ` ${fold(instruction)} `;
  const brands = onOrder.map((b) => b.trim()).filter(Boolean);
  if (brands.length < 2) return null;
  const KEEP = /\b(ONLY|JUST|START WITH|STARTING WITH|BEGIN WITH|FIRST|SOLELY|NOTHING BUT)\b/;
  const DROP = /\b(LEAVE OUT|LEAVE|WITHOUT|SKIP|NOT|EXCLUDE|EXCEPT|DROP|IGNORE|MINUS|THEN)\b/;
  const LATER = /\b(LATER|SEPARATELY|AFTERWARDS|AFTER|NEXT TIME|ANOTHER TIME|SECOND)\b/;
  const JOINED = /^((AND|PLUS|WITH|ALSO|OR)( THE)?|)$/;
  const kept: string[] = [], dropped: string[] = [];
  // Each brand is judged by the words between it and its neighbours, so "only Burton, Anon
  // separately" does not read "separately" against Burton.
  // The brand's name on its own — "burton" — is the whole instruction: do that one.
  const alone = brands.find((b) => t.trim() === fold(b) || t.trim() === `${fold(b)} ONLY` || t.trim() === `ONLY ${fold(b)}`);
  if (alone) return [alone];
  const found = brands.map((b) => ({ b, at: t.indexOf(` ${fold(b)} `), end: t.indexOf(` ${fold(b)} `) + fold(b).length + 1 })).filter((f) => f.at >= 0).sort((x, y) => x.at - y.at);
  found.forEach((f, i) => {
    const before = t.slice(i > 0 ? found[i - 1].end : 0, f.at + 1).trim().split(" ").slice(-3).join(" ");
    const after = t.slice(f.end, i + 1 < found.length ? found[i + 1].at + 1 : undefined).trim().split(" ").slice(0, 3).join(" ");
    // What is said just before the brand decides: "only Burton", "leave out Anon"; what follows it
    // can too: "Anon separately", "Anon later", "Burton first".
    if (DROP.test(before) || LATER.test(after)) dropped.push(f.b);
    else if (KEEP.test(before) || /\b(FIRST|ONLY)\b/.test(after)) kept.push(f.b);
    // "only Burton and Anon", "leave out Anon and the Burton": the second goes the way of the first.
    else if (i > 0 && JOINED.test(before)) (kept.includes(found[i - 1].b) ? kept : dropped.includes(found[i - 1].b) ? dropped : []).push(f.b);
  });
  // "Burton and Anon only", "Burton and Anon later": what is said after the last goes for the
  // ones joined to it before, where nothing was said about them on their own.
  for (let i = found.length - 2; i >= 0; i--) {
    const f = found[i], next = found[i + 1];
    if (kept.includes(f.b) || dropped.includes(f.b)) continue;
    const between = t.slice(f.end, next.at + 1).trim();
    if (!JOINED.test(between)) continue;
    if (kept.includes(next.b)) kept.push(f.b);
    else if (dropped.includes(next.b)) dropped.push(f.b);
  }
  if (kept.length === 0 && dropped.length === 0) return null;
  // In the order's own order, however the instruction listed them.
  const keep = kept.length > 0 ? brands.filter((b) => kept.includes(b)) : brands.filter((b) => !dropped.includes(b));
  const out = keep.filter((b) => !dropped.includes(b));
  return out.length === 0 || out.length === brands.length ? null : out;
}

/**
 * Who a model is for when the sheet says "unisex" and the brand's own naming says otherwise.
 *
 * Anon's goggles with an S on the model — M4S, M5S, WM3 — are the women's models; the sheet calls
 * them unisex. The shop tags them womens and, as with every goggle, names them by the model.
 */
export function audienceByModel(brand: string, title: string): string {
  const name = title.trim().toUpperCase();
  if (/^anon$/i.test(brand.trim()) && /^(W?M\d+S|WM\d+)\b/.test(name)) return "Womens";
  return "";
}
