/**
 * Which deliveries have already been applied, kept in the browser across reloads.
 *
 * Applying the same invoice twice adds its stock twice: three arriving on the three already
 * counted makes six. The page asked before doing that, but only remembered within the one page
 * load and only by filename, so a re-saved file, or the same file after a reload, went through
 * unasked. A delivery is now remembered by what is on it — the lines, not the name — and the
 * memory lives in the browser's storage, so the question is asked whenever it should be, and
 * dropped when the delivery is undone.
 */

export interface AppliedRecord {
  filename: string;
  at: string; // ISO
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const APPLIED_KEY = "floda.applied";
const KEEP = 50;

/** A short, stable fingerprint of what a delivery says: each line's codes, name and numbers. */
export function fingerprint(lines: Array<{ sku: string; barcode: string; title: string; quantity: number | null; costPrice: number | null; rrp: number | null; size?: string; colour?: string }>): string {
  const text = lines
    .map((l) => [l.sku, l.barcode, l.title, l.size ?? "", l.colour ?? "", l.quantity ?? "", l.costPrice ?? "", l.rrp ?? ""].map((v) => String(v).trim().toLowerCase()).join("\u0001"))
    .sort()
    .join("\n");
  // FNV-1a, 32 bits twice over different seeds: enough to tell deliveries apart, no crypto needed.
  const fnv = (seed: number) => {
    let h = seed >>> 0;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  };
  return `${fnv(0x811c9dc5)}${fnv(0x9747b28c)}:${lines.length}`;
}

function read(store: StorageLike): Record<string, AppliedRecord> {
  try {
    const raw = store.getItem(APPLIED_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, AppliedRecord>) : {};
  } catch {
    return {};
  }
}

function write(store: StorageLike, records: Record<string, AppliedRecord>): void {
  try {
    const entries = Object.entries(records).sort((a, b) => a[1].at.localeCompare(b[1].at));
    store.setItem(APPLIED_KEY, JSON.stringify(Object.fromEntries(entries.slice(-KEEP))));
  } catch {
    // Storage full or refused: the page's own memory still holds this load.
  }
}

export function appliedBefore(store: StorageLike, key: string): AppliedRecord | null {
  return read(store)[key] ?? null;
}

export function rememberApplied(store: StorageLike, key: string, filename: string, at = new Date()): void {
  write(store, { ...read(store), [key]: { filename, at: at.toISOString() } });
}

export function forgetApplied(store: StorageLike, key: string): void {
  const records = read(store);
  if (!(key in records)) return;
  delete records[key];
  write(store, records);
}
