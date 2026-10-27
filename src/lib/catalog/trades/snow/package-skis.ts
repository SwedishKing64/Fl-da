import { getBatchPicks, getBindingList } from "./binding-store";
import { skiKey } from "./binding-list";
import { isFlatSki } from "./packages";

/**
 * The new flat skis of a batch, each with the bindings its package offers now, and the shop's
 * binding list to pick from. One place for the upload page and the review page, which both show
 * the picker (asked 2026-10-20: it was on the review page only, and nobody saw it there). A ski the
 * shop already lists is included: it is packaged with what is picked like any other.
 */
export async function packageSkisOf(
  batchId: string,
  products: Array<{ title: string; productType: string; tags: string; handle: string; variants: Array<{ option2Value: string | null }> }>,
): Promise<{ skis: Array<{ key: string; title: string; current: string[] }>; bindings: string[] }> {
  const [bindingList, picks] = await Promise.all([
    getBindingList().catch(() => null),
    getBatchPicks(batchId).catch(() => ({} as Record<string, string[]>)),
  ]);
  const names = (bindingList?.entries ?? []).map((e) => e.name);
  const packages = products.filter((p) => /\binc\b.*\bpackage\b/i.test(p.title));
  const skis = products
    .filter((p) => isFlatSki({ productType: p.productType, title: p.title, tags: p.tags.split(",").map((t) => t.trim()) }))
    .map((p) => {
      const key = skiKey(p.title);
      const own = packages.find((k) => skiKey(k.title.replace(/\s+inc\b.*$/i, "")) === key);
      const offered = [...new Set((own?.variants ?? []).map((v) => (v.option2Value ?? "").trim()).filter(Boolean))];
      // "Marker Griffon - Black" on a package is the list's "Marker Griffon".
      const asListed = offered.map((o) => names.find((n) => o.toLowerCase().startsWith(n.toLowerCase())) ?? "").filter(Boolean);
      return { key, title: p.title, current: picks[key] ?? [...new Set(asListed)] };
    });
  return { skis, bindings: names };
}
