import { beforeEach, describe, expect, it, vi } from "vitest";

// The Blob SDK stood in for: a store made private in Vercel refuses a public save, as the real one does.
const stored = new Map<string, { data: Buffer; access: string }>();
vi.mock("@vercel/blob", () => ({
  put: async (pathname: string, data: Buffer, opts: { access: string }) => {
    if (opts.access === "public") throw new Error("Vercel Blob: Cannot use public access on a private store. The store is configured with private access.");
    stored.set(pathname, { data, access: opts.access });
    return { url: `https://store.private.blob.vercel-storage.com/${pathname}`, pathname };
  },
  get: async (pathname: string) => {
    const hit = stored.get(pathname);
    return hit ? { statusCode: 200, stream: new Response(new Uint8Array(hit.data)).body, headers: new Headers(), blob: {} } : null;
  },
}));

describe("files in a private Blob store", () => {
  beforeEach(() => { stored.clear(); process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test_token"; });

  it("saves privately when the store refuses public files, and reads the file back by its path", async () => {
    const { saveFile, readFile, filePath, publicFileUrl } = await import("./storage");
    const ref = await saveFile("invoices", "Osprey FO Del.xlsx", Buffer.from("the invoice"));
    expect(ref).toMatch(/^invoices\/\d{4}-\d{2}\/[0-9a-f]{8}-Osprey_FO_Del\.xlsx$/);
    expect(stored.get(`catalog/${ref}`)?.access).toBe("private");
    expect((await readFile(ref)).toString()).toBe("the invoice");
    // Served by the app, where an invoice needs a signed-in user and a picture does not.
    expect(filePath(ref)).toBe(`/api/catalog/files/${ref}`);
    const picture = await saveFile("images", "exos.jpg", Buffer.from("jpeg"));
    expect(publicFileUrl(picture, "https://rubin-hph1.vercel.app")).toBe(`https://rubin-hph1.vercel.app/api/catalog/files/${picture}`);
  });

  it("will not read outside the store's own folder", async () => {
    const { readPrivateBlob } = await import("./storage");
    expect(await readPrivateBlob("../secrets.txt")).toBeNull();
    expect(await readPrivateBlob("invoices//x.pdf")).toBeNull();
  });
});
