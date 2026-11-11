/**
 * Pictures kept on this computer, sent somewhere Shopify can fetch them before a batch goes out.
 *
 * A picture saved before the shop connected its store — or one whose upload failed at the time —
 * is a 127.0.0.1 address, which the export would drop and Shopify could never fetch. Before the
 * CSV is written or the batch is pushed, each such picture of the batch is read back from this
 * computer and kept in the shop's Shopify Files (see shopify-files.ts), and its address replaced.
 * One that cannot be is left as it was; the export says so as it always has.
 */

import { prisma } from "./db";
import { isPublicHttpsUrl } from "./csv";
import { keepInShopify, readFile } from "./storage";

/** The stored ref behind an address this copy serves its own files at, or null for any other. */
export function localPictureRef(url: string): string | null {
  const m = /\/api\/catalog\/files\/(images\/[^?#]+)/.exec(url);
  if (!m || isPublicHttpsUrl(url)) return null;
  try {
    return m[1].split("/").map(decodeURIComponent).join("/");
  } catch {
    return null;
  }
}

/** Send a batch's local pictures to Shopify; how many went and how many could not. */
export async function publishLocalPictures(batchId: string): Promise<{ sent: number; failed: number }> {
  const images = await prisma.productImage.findMany({ where: { product: { batchId } }, select: { id: true, url: true, altText: true, product: { select: { title: true } } } });
  const local = images.map((i) => ({ ...i, ref: localPictureRef(i.url) })).filter((i): i is typeof i & { ref: string } => i.ref !== null);
  let sent = 0;
  let failed = 0;
  // The same file under several products is sent once.
  const done = new Map<string, string | null>();
  for (const image of local) {
    if (!done.has(image.ref)) {
      const data = await readFile(image.ref).catch(() => null);
      done.set(image.ref, data ? await keepInShopify(image.ref.split("/").pop() ?? "picture.jpg", data, image.altText || image.product.title) : null);
    }
    const url = done.get(image.ref);
    if (url) {
      await prisma.productImage.update({ where: { id: image.id }, data: { url } });
      sent++;
    } else failed++;
  }
  return { sent, failed };
}
