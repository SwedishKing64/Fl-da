/**
 * Shared supplier layouts, kept and asked for. See shared-layouts.ts for what is shared and why.
 *
 * On Flöda's own deployment the layouts are kept in its database (`recordLayout`, `lookupLayout`).
 * A shop's copy reaches them through the licence route with its licence key: it offers a layout a
 * person confirmed (`contributeLayout`) and asks for one when a file arrives in a layout it has
 * never seen (`findSharedLayout`). Neither ever holds up a batch: a vendor that cannot be reached
 * is the same as a layout nobody has taught yet.
 */

import { prisma, parseJson } from "./db";
import { headerHash, trimToHeaders, type Mapping } from "./mapping";
import { getLicence, servers } from "./licence-store";
import { licenceServer, reachVendor, vendorMode } from "./licence";
import { getSettings } from "./settings";
import { addReading, bestReading, shareable, shareableHeaders, type LayoutVariant, type SharedLayoutAnswer } from "./shared-layouts";

/** On Flöda's deployment: one shop's confirmed reading of a layout, kept beside the others'. */
export async function recordLayout(input: { headers: string[]; mappings: Mapping }, client: string): Promise<boolean> {
  const safe = shareable(input.headers, input.mappings);
  if (!safe) return false;
  const hash = headerHash(safe.headers);
  const had = await prisma.sharedLayout.findUnique({ where: { headerHash: hash } });
  const variants = addReading(parseJson<LayoutVariant[]>(had?.variants, []), safe.mappings, client);
  await prisma.sharedLayout.upsert({
    where: { headerHash: hash },
    create: { headerHash: hash, headers: JSON.stringify(safe.headers), variants: JSON.stringify(variants) },
    update: { variants: JSON.stringify(variants) },
  });
  return true;
}

/** On Flöda's deployment: the reading most other shops agree on for these headings, if any. */
export async function lookupLayout(hash: string, client: string): Promise<SharedLayoutAnswer | null> {
  const row = await prisma.sharedLayout.findUnique({ where: { headerHash: hash } });
  if (!row) return null;
  const answer = bestReading(parseJson<LayoutVariant[]>(row.variants, []), client);
  if (answer) await prisma.sharedLayout.update({ where: { id: row.id }, data: { uses: { increment: 1 } } });
  return answer;
}

/** The deployment's own shop counts as one more shop, under a name no client has. */
const VENDOR_SHOP = "floda-deployment";

async function sharing(): Promise<boolean> {
  return (await getSettings()).shareLayouts !== false;
}

async function askVendorLayouts<T>(action: "layout-share" | "layout-find", body: object): Promise<T | null> {
  if (!licenceServer()) return null;
  const licence = await getLicence();
  if (!licence) return null;
  return reachVendor(await servers(), async (server) => {
    const res = await fetch(`${server}/api/licence/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${licence.key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });
    return res.ok ? ((await res.json().catch(() => null)) as T | null) : null;
  });
}

/**
 * Offer a layout a person confirmed to the other shops. Only the headings and the field each is go;
 * nothing is sent when the shop has turned sharing off, has no licence, or the layout is not one.
 */
export async function contributeLayout(headers: string[], mappings: Mapping): Promise<void> {
  try {
    if (!(await sharing())) return;
    const safe = shareable(headers, mappings);
    if (!safe) return;
    if (vendorMode()) await recordLayout(safe, VENDOR_SHOP);
    else await askVendorLayouts("layout-share", safe);
  } catch (err) {
    console.warn("[layouts] could not share a layout:", err instanceof Error ? err.message : err);
  }
}

const asked = new Map<string, SharedLayoutAnswer | null>();

/**
 * How other shops read a file laid out with these headings, trimmed to them, or null where no other
 * shop has taught it. Asked once per layout per process. A shop that does not share does not ask.
 */
export async function findSharedLayout(headers: string[]): Promise<SharedLayoutAnswer | null> {
  const kept = shareableHeaders(headers);
  if (kept.length < 2) return null;
  const hash = headerHash(kept);
  if (asked.has(hash)) return asked.get(hash) ?? null;
  let answer: SharedLayoutAnswer | null = null;
  try {
    if (await sharing()) {
      if (vendorMode()) answer = await lookupLayout(hash, VENDOR_SHOP);
      else answer = (await askVendorLayouts<{ ok: boolean; layout: SharedLayoutAnswer | null }>("layout-find", { headerHash: hash }))?.layout ?? null;
    }
  } catch (err) {
    console.warn("[layouts] could not ask for a shared layout:", err instanceof Error ? err.message : err);
  }
  const mappings = answer ? trimToHeaders(answer.mappings, headers) : null;
  const found = answer && mappings && Object.values(mappings).some(Boolean) ? { mappings, shops: answer.shops } : null;
  asked.set(hash, found);
  return found;
}

/** For tests: forget what has been asked. */
export function forgetSharedLayouts(): void {
  asked.clear();
}
