import { gunzipSync } from "node:zlib";
import { prisma, parseJson } from "./db";

/**
 * The history of Prices and stock and of Bills for QuickBooks (asked 2026-10-26): each run — the
 * updated exports saved, or a bills sheet downloaded — with what it did, from which documents, who
 * and when, and its files to download again. New Products keeps its batches; these pages kept
 * nothing once the tab was closed.
 *
 * The files are kept in the database, gzipped: they carry the shop's costs, and the file store can
 * be public. Only the newest runs of each kind keep their files, so it cannot grow without end; an
 * older run keeps its summary.
 */
export type RunKind = "PRICES" | "BILLS";

/** How many of the newest runs of each kind keep their files. */
export const RUNS_WITH_FILES = 40;
/** The most a run's files may come to, compressed: past this the run is kept without them. Under the 12MB a request may carry, base64 and all. */
export const MAX_RUN_BYTES = 7 * 1024 * 1024;

export interface RunSummary {
  /** One line per thing done: an instruction applied, a delivery, a bill. */
  lines: string[];
  /** The documents it was made from: the exports, the sheet, the invoices. */
  documents: string[];
  /** Counts worth a glance: cells changed, products, bills, total, discrepancies. */
  counts: Record<string, number>;
}

export interface RunListing {
  id: string;
  kind: RunKind;
  title: string;
  summary: RunSummary;
  who: string;
  createdAt: Date;
  files: Array<{ id: string; filename: string; sizeBytes: number }>;
}

export async function saveRun(input: {
  kind: RunKind;
  title: string;
  summary: RunSummary;
  userId: string | null;
  /** Each file gzipped and base64-encoded in the browser, with its size before compressing. */
  files: Array<{ filename: string; gzipBase64: string; sizeBytes: number }>;
  /** The browser found the files too large to send, and sent none. */
  tooLarge?: boolean;
}): Promise<{ id: string; keptFiles: boolean }> {
  const compressed = input.files.reduce((n, f) => n + f.gzipBase64.length * 0.75, 0);
  const keepFiles = !input.tooLarge && compressed <= MAX_RUN_BYTES;
  const run = await prisma.workRun.create({
    data: {
      kind: input.kind,
      title: input.title.slice(0, 300),
      summary: JSON.stringify({
        lines: input.summary.lines.slice(0, 200).map((l) => l.slice(0, 400)),
        documents: input.summary.documents.slice(0, 50),
        counts: input.summary.counts,
        ...(keepFiles ? {} : { note: "Its files were too large to keep." }),
      }),
      userId: input.userId,
      ...(keepFiles ? { files: { create: input.files.map((f) => ({ filename: f.filename.slice(0, 200), sizeBytes: Math.round(f.sizeBytes), content: f.gzipBase64 })) } } : {}),
    },
  });
  await pruneRunFiles(input.kind).catch(() => undefined);
  return { id: run.id, keptFiles: keepFiles };
}

/** The files of all but the newest runs of a kind are let go; their summaries stay. */
async function pruneRunFiles(kind: RunKind): Promise<void> {
  const older = await prisma.workRun.findMany({ where: { kind }, orderBy: { createdAt: "desc" }, skip: RUNS_WITH_FILES, select: { id: true } });
  if (older.length === 0) return;
  await prisma.workRunFile.deleteMany({ where: { runId: { in: older.map((r) => r.id) } } });
}

export async function listRuns(kind: RunKind, take = 30): Promise<RunListing[]> {
  const runs = await prisma.workRun.findMany({
    where: { kind },
    orderBy: { createdAt: "desc" },
    take,
    include: { user: { select: { name: true, email: true } }, files: { select: { id: true, filename: true, sizeBytes: true } } },
  });
  return runs.map((r) => ({
    id: r.id,
    kind: r.kind as RunKind,
    title: r.title,
    summary: { lines: [], documents: [], counts: {}, ...parseJson<Partial<RunSummary>>(r.summary, {}) } as RunSummary,
    who: r.user?.name || r.user?.email || "someone",
    createdAt: r.createdAt,
    files: r.files,
  }));
}

/** One kept file, uncompressed, for download. Null when it is not there (any more). */
export async function readRunFile(id: string): Promise<{ filename: string; content: Buffer } | null> {
  const file = await prisma.workRunFile.findUnique({ where: { id } });
  if (!file) return null;
  return { filename: file.filename, content: gunzipSync(Buffer.from(file.content, "base64")) };
}

export async function deleteRun(id: string): Promise<void> {
  await prisma.workRun.delete({ where: { id } });
}
