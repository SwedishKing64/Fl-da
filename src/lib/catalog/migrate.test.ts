import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { COPY_ORDER, FILE_COLUMNS, START, checkSourceUrl, copyStep, hostOf, type CopiedModel, type Files, type Row, type Store } from "./migrate";

describe("the order the tables are copied in", () => {
  it("puts every table after the tables it points at, and covers them all but sessions", () => {
    const models = Prisma.dmmf.datamodel.models;
    const at = new Map<string, number>(COPY_ORDER.map((m, i) => [m, i]));
    for (const m of models) {
      if (m.name === "Session") { expect(at.has("Session")).toBe(false); continue; }
      expect(at.has(m.name), `${m.name} is copied`).toBe(true);
      for (const f of m.fields) {
        if (f.kind !== "object" || !f.relationFromFields?.length) continue;
        expect(at.get(f.type)!, `${f.type} before ${m.name}`).toBeLessThan(at.get(m.name)!);
      }
    }
    for (const c of FILE_COLUMNS) expect(models.find((m) => m.name === c.model)?.fields.some((f) => f.name === c.field)).toBe(true);
  });
});

/** An old site and a new site in memory. */
function fakeStore(source: Partial<Record<CopiedModel, Row[]>>, existingUsers: Array<{ id: string; email: string }> = []) {
  const target: Record<string, Row[]> = {};
  const cleared: string[] = [];
  const rewrites: string[] = [];
  const store: Store = {
    async read(model, offset, take) { return (source[model] ?? []).slice(offset, offset + take); },
    async write(model, rows) { target[model] = [...(target[model] ?? []), ...rows]; return rows.length; },
    async clear(model) { cleared.push(model); target[model] = []; },
    async upsertSettings(rows) { target.AppSetting = rows; return rows.length; },
    async usersByEmail(emails) { return existingUsers.filter((u) => emails.includes(u.email)); },
    async rewriteHost(column, oldHost, newHost) { rewrites.push(`${column.model}.${column.field}: ${oldHost} -> ${newHost}`); },
  };
  return { store, target, cleared, rewrites };
}

async function runToEnd(store: Store, files: Files | null, budgetMs = 1_000_000) {
  let state = START; const lines: string[] = []; let steps = 0;
  for (;;) {
    const out = await copyStep(state, store, files, budgetMs);
    lines.push(...out.lines); state = out.state; steps++;
    if (out.done || steps > 50) return { state, lines, steps };
  }
}

describe("copying the old site into the new one", () => {
  const old: Partial<Record<CopiedModel, Row[]>> = {
    User: [{ id: "u-old", email: "justin@alpsport.test", name: "Justin" }, { id: "u-staff", email: "staff@alpsport.test", name: "Sam" }],
    ImportBatch: [{ id: "b1", name: "Burton", createdById: "u-old" }, { id: "b2", name: "Head", createdById: "u-staff" }],
    CategoryRule: [{ id: "r1", pattern: "skis" }],
    AppSetting: [{ key: "gst", value: "0.1" }],
    AuditLog: [{ id: "a1", userId: "u-old", action: "x" }],
  };

  it("keeps the new site's account for a person it already has, and writes their work against it", async () => {
    const { store, target, cleared } = fakeStore(old, [{ id: "u-new", email: "justin@alpsport.test" }]);
    const { state, lines } = await runToEnd(store, null);
    expect(target.User).toEqual([{ id: "u-staff", email: "staff@alpsport.test", name: "Sam" }]);
    expect(target.ImportBatch.map((b) => b.createdById)).toEqual(["u-new", "u-staff"]);
    expect(target.AuditLog[0].userId).toBe("u-new");
    expect(state.users).toEqual({ "u-old": "u-new" });
    expect(cleared).toEqual(["CategoryRule"]);
    expect(target.AppSetting).toEqual([{ key: "gst", value: "0.1" }]);
    expect(lines.join(" ")).toMatch(/No file-store token given/);
    expect(state.counts.ImportBatch).toBe(2);
  });

  it("carries on from where a step stopped, table by table, within the budget", async () => {
    const { store, target } = fakeStore(old);
    let t = 0;
    const clock = () => (t += 400); // every look at the clock is later; a 1000ms budget is two reads
    let state = START; let steps = 0;
    for (;;) {
      const out = await copyStep(state, store, null, 1_000, clock);
      state = out.state; steps++;
      if (out.done) break;
      expect(steps).toBeLessThan(60);
    }
    expect(steps).toBeGreaterThan(3);
    expect(target.ImportBatch).toHaveLength(2);
    expect(target.User).toHaveLength(2);
  });

  it("copies the files, then rewrites their addresses to the new store", async () => {
    const { store, rewrites } = fakeStore(old);
    const copied: string[] = [];
    const files: Files = {
      async list(cursor) {
        if (!cursor) return { blobs: [{ url: "https://old123.public.blob.vercel-storage.com/catalog/images/a.jpg", pathname: "catalog/images/a.jpg" }], cursor: "page2", hasMore: true };
        return { blobs: [{ url: "https://old123.public.blob.vercel-storage.com/catalog/invoices/b.pdf", pathname: "catalog/invoices/b.pdf" }], cursor: null, hasMore: false };
      },
      async copy(blob) { copied.push(blob.pathname); return `https://new456.public.blob.vercel-storage.com/${blob.pathname}`; },
    };
    const { state, lines } = await runToEnd(store, files);
    expect(copied).toEqual(["catalog/images/a.jpg", "catalog/invoices/b.pdf"]);
    expect(state.files).toMatchObject({ done: true, copied: 2, oldHost: "https://old123.public.blob.vercel-storage.com", newHost: "https://new456.public.blob.vercel-storage.com" });
    expect(rewrites).toHaveLength(FILE_COLUMNS.length);
    expect(rewrites[0]).toBe("SourceFile.storagePath: https://old123.public.blob.vercel-storage.com -> https://new456.public.blob.vercel-storage.com");
    expect(lines.join(" ")).toMatch(/2 copied/);
  });

  it("reads a Blob address's host, and checks a connection string before using it", () => {
    expect(hostOf("https://old123.public.blob.vercel-storage.com/catalog/images/a.jpg")).toBe("https://old123.public.blob.vercel-storage.com");
    expect(hostOf("catalog/images/a.jpg")).toBe("");
    expect(checkSourceUrl("")).toMatch(/Paste/);
    expect(checkSourceUrl("prisma+postgres://accelerate")).toMatch(/Accelerate/);
    expect(checkSourceUrl("mysql://x")).toMatch(/postgres:\/\//);
    expect(checkSourceUrl("postgres://u:p@ep-x.neon.tech/neondb?sslmode=require")).toBeNull();
    expect(checkSourceUrl("postgresql://u:p@host/db")).toBeNull();
  });
});
