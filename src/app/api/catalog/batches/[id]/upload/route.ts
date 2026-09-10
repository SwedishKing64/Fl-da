import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser } from "@/lib/catalog/auth";
import { prisma } from "@/lib/catalog/db";
import { ingestFile } from "@/lib/catalog/pipeline";
import { logAudit } from "@/lib/catalog/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 40 * 1024 * 1024;

/** Multipart upload of one or more invoices/spec sheets; each is stored and extracted. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/catalog/batches/[id]/upload">) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;
  const batch = await prisma.importBatch.findUnique({ where: { id } });
  if (!batch) return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  if (["EXPORTED", "PUSHED"].includes(batch.status)) return NextResponse.json({ error: "This batch has already been exported." }, { status: 400 });

  const form = await req.formData();
  const kind = String(form.get("kind") ?? "INVOICE");
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return NextResponse.json({ error: "No files received" }, { status: 400 });

  const results = [];
  for (const file of files) {
    if (file.size > MAX_BYTES) {
      results.push({ filename: file.name, rows: 0, warnings: ["File is larger than 40MB"] });
      continue;
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const r = await ingestFile(id, { filename: file.name, mimeType: file.type, buffer, kind });
    results.push({ filename: file.name, ...r });
  }
  await logAudit("batch.files_uploaded", { batchId: id, userId: user.id, details: { files: results.map((r) => ({ filename: r.filename, rows: r.rows })) } });
  return NextResponse.json({ ok: true, results });
}
