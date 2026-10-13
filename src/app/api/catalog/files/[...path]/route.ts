import { NextResponse, type NextRequest } from "next/server";
import { promises as fs } from "node:fs";
import { resolveStoragePath } from "@/lib/catalog/storage";

export const runtime = "nodejs";

const TYPES: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
  pdf: "application/pdf", csv: "text/csv; charset=utf-8", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", txt: "text/plain; charset=utf-8",
};

/**
 * Serves stored files. Images are public (Shopify must be able to fetch them from the CSV
 * URLs); everything else (invoices, exports) requires a signed-in user.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/catalog/files/[...path]">) {
  const { path } = await ctx.params;
  const rel = path.map(decodeURIComponent).join("/");
  if (!rel.startsWith("images/")) {
    const { requireApiUser } = await import("@/lib/catalog/auth");
    if (!(await requireApiUser())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  let abs: string;
  try {
    abs = resolveStoragePath(rel);
  } catch {
    return NextResponse.json({ error: "Bad path" }, { status: 400 });
  }
  try {
    const data = await fs.readFile(abs);
    const ext = rel.split(".").pop()?.toLowerCase() ?? "";
    return new NextResponse(new Uint8Array(data), {
      headers: { "Content-Type": TYPES[ext] ?? "application/octet-stream", "Cache-Control": rel.startsWith("images/") ? "public, max-age=31536000, immutable" : "private, no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
