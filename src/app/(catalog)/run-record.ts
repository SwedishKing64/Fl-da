"use client";

import { saveRunAction } from "@/app/(catalog)/actions";
import type { RunKind, RunSummary } from "@/lib/catalog/work-runs";

/** Past this, compressed and encoded, the run is kept without its files: a request takes 12MB. */
const MAX_SEND = 9.5 * 1024 * 1024;

async function gzip64(data: string | ArrayBuffer): Promise<{ b64: string; size: number }> {
  const blob = new Blob([data]);
  const gz = await new Response(blob.stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
  const bytes = new Uint8Array(gz);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { b64: btoa(bin), size: blob.size };
}

/**
 * Keep a run in the page's history: what it did, from what, and the files it handed over. Never
 * in the way of the download it follows — a failure here is only logged.
 */
export async function recordRun(input: { kind: RunKind; title: string; summary: RunSummary; files: Array<{ filename: string; data: string | ArrayBuffer }> }): Promise<void> {
  try {
    const files = await Promise.all(input.files.map(async (f) => { const g = await gzip64(f.data); return { filename: f.filename, gzipBase64: g.b64, sizeBytes: g.size }; }));
    const total = files.reduce((n, f) => n + f.gzipBase64.length, 0);
    const r = await saveRunAction({ kind: input.kind, title: input.title, summary: input.summary, files: total <= MAX_SEND ? files : [], tooLarge: total > MAX_SEND });
    if (!r.ok) console.error("[history]", r.error);
  } catch (err) {
    console.error("[history]", err);
  }
}
