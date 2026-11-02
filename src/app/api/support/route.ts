import { NextResponse, type NextRequest } from "next/server";
import { prisma, parseJson } from "@/lib/catalog/db";
import { normaliseKey, vendorMode, verdictFor } from "@/lib/catalog/licence";
import { findBlobToken } from "@/lib/catalog/blob-token";
import { requireApiUser } from "@/lib/catalog/auth";
import { safeBackupName, SUPPORT_KEY, SUPPORT_MAX_BYTES, type SupportBackupRow } from "@/lib/catalog/support-box";

export const runtime = "nodejs";

/**
 * A shop's backup, sent to Flöda support. Answered only on the vendor's own deployment.
 *
 * A database is far bigger than a request this host will take, so the file never passes through
 * here: the copy says it is about to send one ("begin") and is given a token that lets it put that
 * one file, under a path of the vendor's choosing, straight into the vendor's Blob store; when the
 * upload is done it says so ("done"), and the backup is listed on the Clients page. A GET from a
 * signed-in admin hands the file back.
 */
export async function POST(req: NextRequest) {
  if (!vendorMode()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const key = normaliseKey((req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""));
  if (!key) return NextResponse.json({ ok: false, why: "This copy sent no licence key, so its backup cannot be taken." }, { status: 401 });
  const client = await prisma.client.findUnique({ where: { licenceKey: key } });
  const verdict = verdictFor(client);
  if (!client || !verdict.ok) return NextResponse.json({ ok: false, why: "Backups are taken from copies in good standing." }, { status: 403 });
  const body = (await req.json().catch(() => null)) as Partial<{ step: string; name: string; bytes: number; shop: string; email: string; note: string; version: string; install: string; pathname: string; url: string; access: string }> | null;
  const blob = findBlobToken();
  if (!blob) return NextResponse.json({ ok: false, why: "Flöda has no file store attached, so a backup cannot be taken just now. Email it instead." }, { status: 503 });

  if (body?.step === "begin") {
    const bytes = Number(body.bytes) || 0;
    if (bytes <= 0 || bytes > SUPPORT_MAX_BYTES) return NextResponse.json({ ok: false, why: `A backup must be under ${SUPPORT_MAX_BYTES / 1024 / 1024 / 1024} GB.` }, { status: 413 });
    const name = safeBackupName(String(body.name ?? "backup.db"));
    const pathname = `support/${client.id}/${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 8)}-${name}`;
    const { generateClientTokenFromReadWriteToken } = await import("@vercel/blob/client");
    const token = await generateClientTokenFromReadWriteToken({
      token: blob.token,
      pathname,
      allowedContentTypes: ["application/octet-stream", "application/x-sqlite3", "application/vnd.sqlite3"],
      maximumSizeInBytes: SUPPORT_MAX_BYTES,
      addRandomSuffix: false,
      validUntil: Date.now() + 30 * 60 * 1000,
    });
    return NextResponse.json({ ok: true, pathname, token, access: process.env.FLODA_BLOB_PRIVATE === "1" ? "private" : "public" });
  }

  if (body?.step === "done") {
    const pathname = String(body.pathname ?? "");
    if (!pathname.startsWith(`support/${client.id}/`)) return NextResponse.json({ ok: false, why: "That is not this copy's backup." }, { status: 400 });
    const row: SupportBackupRow = {
      at: new Date().toISOString(),
      shop: String(body.shop ?? client.name).slice(0, 120),
      email: String(body.email ?? client.email).trim().slice(0, 200),
      note: String(body.note ?? "").trim().slice(0, 2000),
      version: String(body.version ?? "").slice(0, 40),
      install: String(body.install ?? "").slice(0, 80),
      key,
      bytes: Math.max(0, Number(body.bytes) || 0),
      name: safeBackupName(String(body.name ?? "backup.db")),
      pathname,
      url: String(body.url ?? "").slice(0, 500),
      access: body.access === "private" ? "private" : "public",
    };
    const existing = await prisma.appSetting.findUnique({ where: { key: SUPPORT_KEY } });
    const rows = parseJson<SupportBackupRow[]>(existing?.value, []);
    rows.push(row);
    const value = JSON.stringify(rows.slice(-200));
    await prisma.appSetting.upsert({ where: { key: SUPPORT_KEY }, create: { key: SUPPORT_KEY, value }, update: { value } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, why: "Say begin or done." }, { status: 400 });
}

/** The backup itself, for a signed-in admin of the vendor's deployment: `?path=support/…`. */
export async function GET(req: NextRequest) {
  if (!vendorMode()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const user = await requireApiUser();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Admins only" }, { status: 401 });
  const pathname = req.nextUrl.searchParams.get("path") ?? "";
  if (!/^support\/[A-Za-z0-9]+\/[A-Za-z0-9._-]+$/.test(pathname)) return NextResponse.json({ error: "No such backup" }, { status: 404 });
  const blob = findBlobToken();
  if (!blob) return NextResponse.json({ error: "No file store" }, { status: 503 });
  const existing = await prisma.appSetting.findUnique({ where: { key: SUPPORT_KEY } });
  const row = parseJson<SupportBackupRow[]>(existing?.value, []).find((r) => r.pathname === pathname);
  if (!row) return NextResponse.json({ error: "No such backup" }, { status: 404 });
  if (row.access === "public" && row.url) return NextResponse.redirect(row.url);
  const { get } = await import("@vercel/blob");
  const got = await get(pathname, { access: "private", token: blob.token }).catch(() => null);
  if (!got || got.statusCode !== 200) return NextResponse.json({ error: "The file store did not hand it back" }, { status: 502 });
  return new NextResponse(got.stream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${row.name}"`,
      "Cache-Control": "no-store",
    },
  });
}
