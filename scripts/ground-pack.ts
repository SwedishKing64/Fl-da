/**
 * Ground a trade pack in what real shops in the trade sell: `npx tsx scripts/ground-pack.ts
 * <store>... [--pack <folder>]`. Reads each store's public product feed (Shopify's /products.json,
 * read-only, no login) and reports the kinds of product, option names and values, and tags those
 * shops actually use, and, given a pack, which of its kinds no shop uses and which kinds shops use
 * that the pack does not have. Nothing is stored; prices are not read.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { kindsOf, PackFile } from "../src/lib/catalog/trades/knowledge";

const args = process.argv.slice(2);
const at = args.indexOf("--pack");
const packDir = at >= 0 ? args[at + 1] : null;
const stores = args.filter((a, i) => a !== "--pack" && i !== at + 1);

interface FeedProduct { product_type: string; tags: string[] | string; options: Array<{ name: string; values: string[] }> }

const tally = (map: Map<string, number>, key: string) => { const k = key.trim(); if (k) map.set(k, (map.get(k) ?? 0) + 1); };
const top = (map: Map<string, number>, n: number) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

async function feed(store: string): Promise<FeedProduct[]> {
  const base = (store.startsWith("http") ? store : `https://${store}`).replace(/\/+$/, "");
  const out: FeedProduct[] = [];
  for (let page = 1; page <= 4; page++) {
    const res = await fetch(`${base}/products.json?limit=250&page=${page}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) { if (page === 1) console.warn(`${base}: ${res.status}, not a public Shopify feed`); break; }
    const body = (await res.json()) as { products?: FeedProduct[] };
    if (!body.products?.length) break;
    out.push(...body.products);
  }
  return out;
}

async function main(): Promise<void> {
  if (stores.length === 0) { console.error("Name the stores: npx tsx scripts/ground-pack.ts shop-one.com shop-two.com [--pack folder]"); process.exit(1); }
  const types = new Map<string, number>();
  const options = new Map<string, Map<string, number>>();
  const tags = new Map<string, number>();
  let products = 0;
  for (const store of stores) {
    const list = await feed(store);
    console.log(`${store}: ${list.length} products`);
    products += list.length;
    for (const p of list) {
      tally(types, p.product_type);
      for (const t of Array.isArray(p.tags) ? p.tags : String(p.tags ?? "").split(",")) tally(tags, t);
      for (const o of p.options ?? []) {
        if (/^title$/i.test(o.name)) continue;
        const values = options.get(o.name) ?? new Map<string, number>();
        for (const v of o.values) tally(values, v);
        options.set(o.name, values);
      }
    }
  }
  console.log(`\n${products} products in all.\n\nKinds of product (product type):`);
  for (const [t, n] of top(types, 60)) console.log(`  ${String(n).padStart(5)}  ${t}`);
  console.log("\nOption names, with their commonest values:");
  for (const [name, values] of [...options.entries()].sort((a, b) => [...b[1].values()].reduce((x, y) => x + y, 0) - [...a[1].values()].reduce((x, y) => x + y, 0)).slice(0, 15)) {
    console.log(`  ${name}: ${top(values, 14).map(([v, n]) => `${v} (${n})`).join(", ")}`);
  }
  console.log("\nTags:");
  console.log(`  ${top(tags, 50).map(([t, n]) => `${t} (${n})`).join(", ")}`);
  if (packDir && existsSync(join(packDir, "pack.json"))) {
    const pack = PackFile.parse(JSON.parse(readFileSync(join(packDir, "pack.json"), "utf8")));
    const menu = kindsOf(pack.tree);
    const seen = new Set([...types.keys()].map((t) => t.toLowerCase()));
    const said = new Set(menu.map((k) => k.toLowerCase()));
    console.log(`\nAgainst ${pack.name}'s menu:`);
    console.log(`  On the menu, used by no shop read: ${menu.filter((k) => !seen.has(k.toLowerCase())).join(", ") || "none"}`);
    console.log(`  Used by shops, not on the menu: ${top(types, 60).map(([t]) => t).filter((t) => !said.has(t.toLowerCase())).join(", ") || "none"}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
