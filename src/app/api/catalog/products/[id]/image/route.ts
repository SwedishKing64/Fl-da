import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser } from "@/lib/catalog/auth";
import { prisma } from "@/lib/catalog/db";
import { framePicture } from "@/lib/catalog/pictures";
import { saveFile, publicFileUrl, filePath } from "@/lib/catalog/storage";
import { getSettings } from "@/lib/catalog/settings";

export const runtime = "nodejs";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

/** Drag-and-drop image upload for a product (optionally tied to a variant). */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/catalog/products/[id]/image">) {
  if (!(await requireApiUser())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
  const form = await req.formData();
  const variantId = (form.get("variantId") as string | null) || null;
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return NextResponse.json({ error: "No image received" }, { status: 400 });
  const settings = await getSettings();
  let position = await prisma.productImage.count({ where: { productId: id } });
  const created = [];
  let warning: string | null = null;
  for (const file of files) {
    if (!IMAGE_TYPES.has(file.type)) return NextResponse.json({ error: `${file.name}: only JPEG, PNG, GIF or WebP images are accepted` }, { status: 400 });
    if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: `${file.name}: images must be under 20MB` }, { status: 400 });
    // Set on its square like every other picture, where it can be read; kept as sent where not.
    const raw = Buffer.from(await file.arrayBuffer());
    const framed = await framePicture(raw).catch(() => null);
    const rel = await saveFile("images", framed ? file.name.replace(/\.[^.]+$/, "") + ".jpg" : file.name, framed ? framed.data : raw);
    const publicUrl = publicFileUrl(rel, settings.publicBaseUrl);
    if (!publicUrl) warning = "No public base URL is configured in Settings, so this image will not be reachable by Shopify until one is set.";
    const url = publicUrl ?? `${req.nextUrl.origin}${filePath(rel)}`;
    const img = await prisma.productImage.create({ data: { productId: id, variantId, url, position: ++position, source: "MANUAL", altText: product.title, validated: Boolean(publicUrl) } });
    created.push({ id: img.id, url: img.url, position: img.position });
  }
  return NextResponse.json({ ok: true, images: created, warning });
}
