import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser } from "@/lib/catalog/auth";
import { readRunFile } from "@/lib/catalog/work-runs";

export const runtime = "nodejs";

const TYPES: Record<string, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/** A file kept with a run of Prices and stock or Bills, to download again. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/catalog/runs/[id]">) {
  if (!(await requireApiUser())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;
  const file = await readRunFile(id);
  if (!file) return NextResponse.json({ error: "That file is no longer kept: only the newest runs keep their files." }, { status: 404 });
  const ext = (/\.([a-z0-9]+)$/i.exec(file.filename)?.[1] ?? "").toLowerCase();
  const safe = file.filename.replace(/[^\w.\- ]+/g, "_") || "file";
  return new NextResponse(new Uint8Array(file.content), {
    headers: {
      "Content-Type": TYPES[ext] ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safe}"`,
      "Content-Length": String(file.content.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
