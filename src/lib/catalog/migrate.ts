/**
 * Moving the shop from one Rubin to another.
 *
 * The business's own Vercel project starts with an empty database and an empty file store, and
 * the shop's year of work — its rules, templates, remembered listings, every batch and its
 * pictures — sits in the old project's. Copying a Postgres database needs tools nobody at the
 * shop has installed, and copying a Blob store needs more than that. So the new site copies it
 * for itself: given the old site's connection string and file-store token, it reads every table
 * in the order their relations allow, writes the rows into its own, carries the files across,
 * and rewrites the file addresses to the new store.
 *
 * It runs in steps, because a request on Vercel has minutes, not hours. Each step does what fits
 * in its budget and hands back where it got to; the page calls again until done. Nothing is kept
 * on the server between steps, the connection string and token included.
 */

import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./db";
import { runtimeDatabaseUrl, POSTGRES_URL } from "./db-url";

/** Every table, each after the tables it points at. Sessions are not worth carrying. */
export const COPY_ORDER = [
  "User", "Supplier", "MappingTemplate", "ImportBatch", "SourceFile", "Product", "Variant", "ExtractedLineItem",
  "ProductImage", "PricingRule", "CategoryRule", "TagRule", "ProductTemplate", "UnassignedImage", "ImageLibraryEntry",
  "AppSetting", "BatchInstruction", "ExportFeedback", "ExportFile", "ShopifyCatalogItem", "AuditLog", "ShopListing",
] as const;
export type CopiedModel = (typeof COPY_ORDER)[number];

/**
 * Tables the new site seeds with defaults on its first visit — rules, templates, the shop memory.
 * The old site's are the shop's real ones, so where the old site has any, the new site's are
 * cleared before the copy rather than left beside them — unless the old site's rows are already
 * here, copied by hand, when what the new site has since learned is kept.
 */
export const REPLACED: ReadonlySet<string> = new Set(["PricingRule", "CategoryRule", "TagRule", "ProductTemplate", "ShopListing", "ShopifyCatalogItem", "ImageLibraryEntry"]);

/** Columns that hold a file's address in the store. */
export const FILE_COLUMNS: ReadonlyArray<{ model: string; field: string }> = [
  { model: "SourceFile", field: "storagePath" },
  { model: "ExportFile", field: "storagePath" },
  { model: "ProductImage", field: "url" },
  { model: "UnassignedImage", field: "url" },
  { model: "ImageLibraryEntry", field: "urls" },
];

/** Columns that name a user, rewritten where the new site already had that person by email. */
const USER_COLUMNS = new Set(["createdById", "userId"]);

export type Row = Record<string, unknown>;

export interface CopyState {
  /** Index into COPY_ORDER of the table being copied, and how far into it. */
  table: number;
  offset: number;
  /** Old user id → the new site's id for the same email. */
  users: Record<string, string>;
  /** Rows written per table. */
  counts: Record<string, number>;
  files: { cursor: string | null; done: boolean; copied: number; oldHost: string; newHost: string };
  rewritten: boolean;
}

export const START: CopyState = { table: 0, offset: 0, users: {}, counts: {}, files: { cursor: null, done: false, copied: 0, oldHost: "", newHost: "" }, rewritten: false };

/** The old site's data and the new site's tables, behind an interface a test can stand in for. */
export interface Store {
  read(model: CopiedModel, offset: number, take: number): Promise<Row[]>;
  write(model: CopiedModel, rows: Row[]): Promise<number>;
  clear(model: CopiedModel): Promise<void>;
  /** Whether the new site already holds this row of the old site's, by its id. */
  has(model: CopiedModel, row: Row): Promise<boolean>;
  upsertSettings(rows: Row[]): Promise<number>;
  usersByEmail(emails: string[]): Promise<Array<{ id: string; email: string }>>;
  rewriteHost(column: { model: string; field: string }, oldHost: string, newHost: string): Promise<void>;
}

export interface Files {
  list(cursor: string | null): Promise<{ blobs: Array<{ url: string; pathname: string; contentType?: string }>; cursor: string | null; hasMore: boolean }>;
  /** Copies one file into the new store and gives its new address. */
  copy(blob: { url: string; pathname: string; contentType?: string }): Promise<string>;
}

const CHUNK = 400;

/** The host of a Blob address: everything before the path. */
export function hostOf(url: string): string {
  const m = /^(https?:\/\/[^/]+)/i.exec(url);
  return m ? m[1] : "";
}

/**
 * One step of the copy: as many tables, rows and files as fit in the budget, then where it got to.
 * Called again with the state it returns until `done`.
 */
export async function copyStep(state: CopyState, store: Store, files: Files | null, budgetMs = 45_000, now: () => number = Date.now): Promise<{ state: CopyState; lines: string[]; done: boolean }> {
  const started = now();
  const within = () => now() - started < budgetMs;
  const lines: string[] = [];
  let s: CopyState = { ...state, users: { ...state.users }, counts: { ...state.counts }, files: { ...state.files } };

  // The tables, in order.
  while (s.table < COPY_ORDER.length && within()) {
    const model = COPY_ORDER[s.table];
    if (s.offset === 0 && REPLACED.has(model)) {
      const first = await store.read(model, 0, 1);
      if (first.length > 0 && !(await store.has(model, first[0]))) { await store.clear(model); lines.push(`${model}: the new site's own rows cleared for the old site's.`); }
    }
    const rows = await store.read(model, s.offset, CHUNK);
    if (rows.length === 0) {
      lines.push(`${model}: ${s.counts[model] ?? 0} row${(s.counts[model] ?? 0) === 1 ? "" : "s"}.`);
      s = { ...s, table: s.table + 1, offset: 0 };
      continue;
    }
    let written = 0;
    if (model === "User") {
      // A person the new site already has, by email, keeps the new site's account; what the old
      // site did under their name is written against it.
      const have = await store.usersByEmail(rows.map((r) => String(r.email ?? "")));
      const byEmail = new Map(have.map((u) => [u.email.toLowerCase(), u.id]));
      const fresh: Row[] = [];
      for (const r of rows) {
        const existing = byEmail.get(String(r.email ?? "").toLowerCase());
        if (existing && existing !== r.id) s.users[String(r.id)] = existing;
        else if (!existing) fresh.push(r);
      }
      written = fresh.length > 0 ? await store.write(model, fresh) : 0;
      if (have.length > 0) lines.push(`User: ${have.length} already on the new site by email, kept.`);
    } else if (model === "AppSetting") {
      written = await store.upsertSettings(rows);
    } else {
      const mapped = rows.map((r) => {
        const out: Row = { ...r };
        for (const k of Object.keys(out)) if (USER_COLUMNS.has(k) && typeof out[k] === "string" && s.users[out[k] as string]) out[k] = s.users[out[k] as string];
        return out;
      });
      written = await store.write(model, mapped);
    }
    s.counts[model] = (s.counts[model] ?? 0) + written;
    s = { ...s, offset: s.offset + rows.length };
  }
  if (s.table < COPY_ORDER.length) return { state: s, lines, done: false };

  // The files, page by page.
  if (!files) {
    if (!s.files.done) { s.files = { ...s.files, done: true }; lines.push("No file-store token given, so the files stay where they are; the new site reads them from the old store while it exists."); }
    return { state: { ...s, rewritten: true }, lines, done: true };
  }
  while (!s.files.done && within()) {
    const page = await files.list(s.files.cursor);
    for (const blob of page.blobs) {
      if (!within()) return { state: s, lines, done: false };
      const url = await files.copy(blob);
      if (!s.files.oldHost) s.files = { ...s.files, oldHost: hostOf(blob.url), newHost: hostOf(url) };
      s.files = { ...s.files, copied: s.files.copied + 1 };
    }
    s.files = { ...s.files, cursor: page.hasMore ? page.cursor : null, done: !page.hasMore };
    if (!page.hasMore) lines.push(`Files: ${s.files.copied} copied to the new store.`);
    if (page.hasMore && page.blobs.length === 0) break;
  }
  if (!s.files.done) return { state: s, lines, done: false };

  // The addresses, once the files are there to answer at them.
  if (!s.rewritten) {
    if (s.files.oldHost && s.files.newHost && s.files.oldHost !== s.files.newHost) {
      for (const column of FILE_COLUMNS) await store.rewriteHost(column, s.files.oldHost, s.files.newHost);
      lines.push(`File addresses rewritten from ${s.files.oldHost} to ${s.files.newHost}.`);
    }
    s = { ...s, rewritten: true };
  }
  return { state: s, lines, done: true };
}

// ---------------------------------------------------------------------------------------------
// The real store and files
// ---------------------------------------------------------------------------------------------

type AnyModel = {
  findMany: (args: { where?: Row; skip: number; take: number; orderBy: Record<string, "asc"> }) => Promise<Row[]>;
  createMany: (args: { data: Row[]; skipDuplicates?: boolean }) => Promise<{ count: number }>;
  deleteMany: () => Promise<{ count: number }>;
  upsert: (args: { where: Row; create: Row; update: Row }) => Promise<Row>;
};

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const modelOf = (client: unknown, name: string): AnyModel => (client as Record<string, AnyModel>)[lowerFirst(name)];
const idFieldOf = (name: string): string => Prisma.dmmf.datamodel.models.find((m) => m.name === name)?.fields.find((f) => f.isId)?.name ?? "id";

/** The old site's connection string, checked before anything connects to it. */
export function checkSourceUrl(url: string): string | null {
  const u = url.trim();
  if (!u) return "Paste the old site's database connection string.";
  if (/^prisma\+postgres/i.test(u)) return "That is a Prisma Accelerate address. Use the plain postgres:// one from the old project's Storage tab.";
  if (!POSTGRES_URL.test(u) && !/^file:/.test(u)) return "That does not look like a Postgres connection string; it should start with postgres://.";
  return null;
}

export function prismaStore(source: PrismaClient, target: unknown = prisma): Store {
  return {
    async read(model, offset, take) {
      return modelOf(source, model).findMany({ skip: offset, take, orderBy: { [idFieldOf(model)]: "asc" } });
    },
    async write(model, rows) {
      const { count } = await modelOf(target, model).createMany({ data: rows, skipDuplicates: true });
      return count;
    },
    async clear(model) { await modelOf(target, model).deleteMany(); },
    async has(model, row) {
      const id = idFieldOf(model);
      return (await modelOf(target, model).findMany({ where: { [id]: row[id] }, skip: 0, take: 1, orderBy: { [id]: "asc" } })).length > 0;
    },
    async upsertSettings(rows) {
      let n = 0;
      for (const r of rows) { await modelOf(target, "AppSetting").upsert({ where: { key: r.key }, create: r, update: { value: r.value } }); n++; }
      return n;
    },
    async usersByEmail(emails) {
      const users = await (target as typeof prisma).user.findMany({ where: { email: { in: emails } }, select: { id: true, email: true } });
      return users;
    },
    async rewriteHost(column, oldHost, newHost) {
      await (target as typeof prisma).$executeRaw(Prisma.sql`UPDATE ${Prisma.raw(`"${column.model}"`)} SET ${Prisma.raw(`"${column.field}"`)} = replace(${Prisma.raw(`"${column.field}"`)}, ${oldHost}, ${newHost}) WHERE ${Prisma.raw(`"${column.field}"`)} LIKE ${`%${oldHost}%`}`);
    },
  };
}

export function sourceClient(url: string): PrismaClient {
  return new PrismaClient({ datasourceUrl: /^file:/.test(url) ? url : runtimeDatabaseUrl(url.trim()), log: ["error"] });
}

export function blobFiles(oldToken: string, newToken: string): Files {
  return {
    async list(cursor) {
      const { list } = await import("@vercel/blob");
      const page = await list({ token: oldToken, limit: 100, ...(cursor ? { cursor } : {}) });
      return { blobs: page.blobs.map((b) => ({ url: b.url, pathname: b.pathname })), cursor: page.cursor ?? null, hasMore: page.hasMore };
    },
    async copy(blob) {
      const { put } = await import("@vercel/blob");
      const res = await fetch(blob.url);
      if (!res.ok) throw new Error(`Could not read ${blob.pathname} from the old store (${res.status}).`);
      const body = Buffer.from(await res.arrayBuffer());
      const out = await put(blob.pathname, body, { access: "public", token: newToken, addRandomSuffix: false, contentType: res.headers.get("content-type") ?? undefined });
      return out.url;
    },
  };
}
