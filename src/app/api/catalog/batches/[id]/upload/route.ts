import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser } from "@/lib/catalog/auth";
import { prisma } from "@/lib/catalog/db";
import { after } from "next/server";
import { extractStoredFile, noteOnFile, storeFile, untouchedSinceBuilt } from "@/lib/catalog/pipeline";
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

  // Store every file first, and answer as soon as they are safe. Reading them is the slow part —
  // a scanned invoice is a vision call over a photograph — and doing it here meant a slow read
  // took the whole upload down with it, so a file that had arrived intact was reported as failed.
  const stored: Array<{ id: string; filename: string }> = [];
  const results = [];
  for (const file of files) {
    if (file.size > MAX_BYTES) {
      results.push({ filename: file.name, rows: 0, method: null, kind, warnings: [`${file.name} is larger than ${Math.round(MAX_BYTES / 1024 / 1024)}MB, which is as much as one upload can carry. A picture is shrunk in the browser before it is sent, so this is a PDF — send fewer pages. Scanning above 300dpi does not help either way: it is read at 1568px across whatever you give it.`] });
      continue;
    }
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const { id: fileId } = await storeFile(id, { filename: file.name, mimeType: file.type, buffer, kind });
      stored.push({ id: fileId, filename: file.name });
      results.push({ filename: file.name, rows: 0, method: null, kind, warnings: [] });
    } catch (err) {
      results.push({ filename: file.name, rows: 0, method: null, kind, warnings: [`Could not store the file: ${err instanceof Error ? err.message : String(err)}`] });
    }
  }
  await logAudit("batch.files_uploaded", { batchId: id, userId: user.id, details: { files: stored.map((f) => f.filename) } });

  const origin = req.nextUrl.origin;
  // A batch with products already is rebuilt with the new file in it — unless somebody has edited
  // those products since, which a rebuild would undo. See untouchedSinceBuilt.
  const hadProducts = (await prisma.product.count({ where: { batchId: id } })) > 0;
  const shouldMap = autoMap && (!hadProducts || (await untouchedSinceBuilt(id)));
  // Only the reading runs back here. Reading a photographed invoice is one long model call, and
  // building the products after it can be another (lines put to the model to place), and the
  // two together outran the minute this request has after it has answered: the work was cut off
  // mid-way, the file sat on "reading…" for ever and nothing ever said why. So the page builds
  // the products itself once it sees the reading is done — a request with a minute of its own.
  after(async () => {
    for (const file of stored) {
      try {
        await extractStoredFile(file.id, origin);
      } catch (err) {
        // The file itself is safe; only the reading failed, and the row says so.
        await prisma.sourceFile.update({
          where: { id: file.id },
          data: { extractionStatus: "FAILED", extractionError: err instanceof Error ? err.message : String(err) },
        }).catch(() => undefined);
      }
    }
    if (autoMap && hadProducts && !shouldMap) {
      for (const file of stored) {
        await noteOnFile(file.id, "Added after the products were built and then edited by hand, so they have not been rebuilt with it — a rebuild starts again from the files and would lose those edits. To use it, open Column mapping and build again.").catch(() => undefined);
      }
    }
  });

  // `reading` tells the page there is more to come, so it can wait rather than look finished.
  // `buildAfter` tells the page to build the products once the reading is done.
  return NextResponse.json({ ok: true, results, reading: stored.length, buildAfter: shouldMap, auto: { applied: false, products: 0, variants: 0 } });
}
