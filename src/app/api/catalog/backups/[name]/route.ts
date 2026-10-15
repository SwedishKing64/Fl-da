import fs from "node:fs";
import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser } from "@/lib/catalog/auth";
import { backupPath } from "@/lib/catalog/backup";

export const runtime = "nodejs";

/** A backup file, to keep somewhere other than this machine. Admins only. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/catalog/backups/[name]">) {
  const user = await requireApiUser();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Admins only" }, { status: 401 });
  const { name } = await ctx.params;
  const file = backupPath(name);
  if (!file) return NextResponse.json({ error: "No such backup" }, { status: 404 });
  const content = fs.readFileSync(file);
  return new NextResponse(new Uint8Array(content), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Content-Length": String(content.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
