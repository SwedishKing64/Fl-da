import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser } from "@/lib/catalog/auth";
import { prisma } from "@/lib/catalog/db";
import { autoApplyMappings, ingestFile } from "@/lib/catalog/pipeline";
import type { UploadKind } from "@/lib/catalog/extract";
import { logAudit } from "@/lib/catalog/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

// Vercel serverless functions accept request bodies up to ~4.5MB; elsewhere allow 40MB.
const MAX_BYTES = process.env.VERCEL ? 4 * 1024 * 1024 : 40 * 1024 * 1024;

/** Multipart upload of one or more invoices/spec sheets; each is stored and extracted. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/catalog/batches/[id]/upload">) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;
  const batch = await prisma.importBatch.findUnique({ where: { id } });
  if (!batch) return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  if (["EXPORTED", "PUSHED"].includes(batch.status)) return NextResponse.json({ error: "This batch has already been exported." }, { status: 400 });

  const form = await req.formData();
  const kindRaw = String(form.get("kind") ?? "AUTO");
  const kind: UploadKind = (["AUTO", "INVOICE", "SPEC_SHEET", "PRODUCT_PHOTO"] as const).includes(kindRaw as UploadKind) ? (kindRaw as UploadKind) : "AUTO";
  const autoMap = String(form.get("autoMap") ?? "1") !== "0";
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return NextResponse.json({ error: "No files received" }, { status: 400 });

  const results = [];
  for (const file of files) {
    if (file.size > MAX_BYTES) {
      results.push({ filename: file.name, rows: 0, method: null, kind, warnings: [`File is larger than ${Math.round(MAX_BYTES / 1024 / 1024)}MB${process.env.VERCEL ? " (Vercel upload limit)" : ""}; split or compress it.`] });
      continue;
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const r = await ingestFile(id, { filename: file.name, mimeType: file.type, buffer, kind, origin: req.nextUrl.origin });
    results.push({ filename: file.name, ...r });
  }
  await logAudit("batch.files_uploaded", { batchId: id, userId: user.id, details: { files: results.map((r) => ({ filename: r.filename, rows: r.rows, kind: r.kind })) } });
  let auto: { applied: boolean; products: number; variants: number } = { applied: false, products: 0, variants: 0 };
  if (autoMap && batch.status !== "REVIEW") {
    try {
      auto = await autoApplyMappings(id, user.id);
    } catch (err) {
      results.push({ filename: "(mapping)", rows: 0, method: null, kind: "AUTO", warnings: [`Automatic mapping failed: ${err instanceof Error ? err.message : String(err)}`] });
    }
  }
  return NextResponse.json({ ok: true, results, auto });
}
