import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser } from "@/lib/catalog/auth";
import { readExportFile } from "@/lib/catalog/pipeline";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/catalog/exports/[id]">) {
  if (!(await requireApiUser())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;
  const file = await readExportFile(id);
  if (!file) {
    // The saved file is gone and the batch could not produce it again — deleted, or edited into a
    // state that no longer exports. Say so; a bare 404 on a download button explains nothing.
    return NextResponse.json({ error: "That CSV is no longer available and could not be rebuilt from the batch. Open the batch and export it again." }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(file.content), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${file.filename}"` },
  });
}
