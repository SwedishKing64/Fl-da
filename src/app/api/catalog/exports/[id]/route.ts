import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser } from "@/lib/catalog/auth";
import { readExportFile } from "@/lib/catalog/pipeline";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/catalog/exports/[id]">) {
  if (!(await requireApiUser())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;
  const file = await readExportFile(id);
  if (!file.ok) {
    // Logged as well as returned: a download that does nothing is otherwise unexplainable from
    // the outside, and the reason only exists here.
    console.error(`[export-download] ${id}: ${file.reason}`);
    return NextResponse.json({ error: file.reason }, { status: 404 });
  }
  // The filename is slugified to lowercase ASCII and hyphens upstream, so it is header-safe.
  return new NextResponse(new Uint8Array(file.content), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Content-Length": String(file.content.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
