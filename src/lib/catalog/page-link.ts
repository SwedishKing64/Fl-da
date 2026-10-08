/**
 * A link beside a product, and what reading it does to that product.
 *
 * Somebody pastes the product's own page under its name; reading it fills the description, the
 * details list and the pictures from the page, and nothing else — the order is still the authority
 * on what was bought, at what cost, and in what sizes. A product with no link is left exactly as it
 * was: the whole feature is optional per product.
 *
 * The link is kept in the product's lookupSource, which already means "the page the copy came
 * from", with its own lookupStatus while it waits:
 *   LINKED       a link was given and has not been read yet
 *   RELINKED     the same, on a product whose description an earlier lookup or page read wrote, which
 *                a new page may therefore replace (a description somebody supplied may not be)
 *   PAGE         it was read; PAGE_UNSURE when the page's title does not look like this product
 *   LINK_FAILED  it could not be read; the reason is said to the person, and the link is kept
 */

import { prisma } from "./db";
import { houseBody, isPlaceholderBody } from "./body";
import { cleanProductUrl, fitlessOf, flatHandleOf, type PageDetails } from "./page-types";
import { readProductPage, PageError } from "./extract/page";

/** A package is read from its ski's page: "… inc Marker Griffon Binding Package" is the ski's name with a binding added. */
export const flatTitleOf = (title: string): string => title.replace(/\s+inc\s+.*binding package$/i, "").replace(/\s+inc\s+.*$/i, "").trim();

const WAITING = ["LINKED", "RELINKED", "LINK_FAILED"];
const MACHINE_FILLED = ["FOUND", "UNSURE", "PAGE", "PAGE_UNSURE", "RELINKED"];
const linkedFrom = (status: string): string => (MACHINE_FILLED.includes(status) ? "RELINKED" : "LINKED");

/** Save, or clear, the link beside a product. The package of a ski gets the ski's link when it has none of its own. */
export async function setProductLink(productId: string, raw: string): Promise<{ url: string; shared: string[] }> {
  const product = await prisma.product.findUniqueOrThrow({ where: { id: productId }, select: { id: true, batchId: true, handle: true, title: true, lookupStatus: true, lookupSource: true } });
  const cleaned = cleanProductUrl(raw);
  if ("error" in cleaned) {
    if (cleaned.error) throw new Error(cleaned.error);
    // Cleared. A product that was only waiting on its link goes back to being unlooked-up; one that
    // was already read keeps what it got, and simply forgets the address.
    if (WAITING.includes(product.lookupStatus)) await prisma.product.update({ where: { id: productId }, data: { lookupSource: "", lookupStatus: product.lookupStatus === "RELINKED" ? "FOUND" : "NONE" } });
    else if (product.lookupStatus.startsWith("PAGE")) await prisma.product.update({ where: { id: productId }, data: { lookupSource: "", lookupStatus: "FOUND" } });
    return { url: "", shared: [] };
  }
  await prisma.product.update({ where: { id: productId }, data: { lookupSource: cleaned.url, lookupStatus: linkedFrom(product.lookupStatus), lookupAt: null } });
  const flat = flatHandleOf(product.handle);
  // The ski's package, and the model's other fits — "M4 Cylindrical Low Bridge" beside "M4
  // Cylindrical" — are the same page, so they take this link unless they already have one.
  const sameModel = (p: { handle: string; title: string }) => flatHandleOf(p.handle) === flat || fitlessOf(p.title) === fitlessOf(product.title);
  const siblings = (await prisma.product.findMany({ where: { batchId: product.batchId, id: { not: productId } }, select: { id: true, handle: true, title: true, lookupSource: true, lookupStatus: true } }))
    .filter((p) => sameModel(p) && (!p.lookupSource.trim() || WAITING.includes(p.lookupStatus)));
  for (const s of siblings) await prisma.product.update({ where: { id: s.id }, data: { lookupSource: cleaned.url, lookupStatus: linkedFrom(s.lookupStatus), lookupAt: null } });
  return { url: cleaned.url, shared: siblings.map((s) => s.id) };
}

export interface PageRead {
  productId: string;
  ok: boolean;
  /** One line fit for the screen. */
  said: string;
  description: boolean;
  details: number;
  images: number;
  /** Other products given the same page in the same read. */
  also: string[];
}

/** The colours the product is listed in: the values of whichever option is the colour one. */
function coloursOf(product: { option1Name: string | null; option2Name: string | null; option3Name: string | null; variants: Array<{ option1Value: string | null; option2Value: string | null; option3Value: string | null }> }): string[] {
  const names = [product.option1Name, product.option2Name, product.option3Name];
  const at = names.findIndex((n) => /colou?r/i.test(n ?? ""));
  if (at < 0) return [];
  const values = product.variants.map((v) => [v.option1Value, v.option2Value, v.option3Value][at]?.trim() ?? "").filter(Boolean);
  return [...new Set(values)].slice(0, 6);
}

/** Fetch a product's page and write what it says onto the product, and onto its package. */
export async function readProductLink(productId: string, deps: { read?: typeof readProductPage } = {}): Promise<PageRead> {
  const read = deps.read ?? readProductPage;
  const product = await prisma.product.findUniqueOrThrow({ where: { id: productId }, include: { variants: { select: { sku: true, option1Value: true, option2Value: true, option3Value: true } } } });
  const url = product.lookupSource.trim();
  const empty = { productId, description: false, details: 0, images: 0, also: [] as string[] };
  if (!url) return { ...empty, ok: false, said: "There is no link beside this product." };

  let details: PageDetails;
  try {
    details = await read(url, { title: flatTitleOf(product.title), brand: product.vendor || undefined, modelCode: product.variants.map((v) => v.sku).find(Boolean), colours: coloursOf(product) });
  } catch (err) {
    const said = err instanceof PageError ? err.message : "The page could not be read.";
    await prisma.product.update({ where: { id: productId }, data: { lookupStatus: "LINK_FAILED", lookupAt: new Date() } });
    return { ...empty, ok: false, said };
  }

  // The same page for the ski's package(s), in one read.
  const flat = flatHandleOf(product.handle);
  const waiting = (await prisma.product.findMany({ where: { batchId: product.batchId, id: { not: productId } }, select: { id: true, handle: true, title: true, lookupSource: true, lookupStatus: true } }))
    .filter((p) => (flatHandleOf(p.handle) === flat || fitlessOf(p.title) === fitlessOf(product.title)) && p.lookupSource === url && WAITING.includes(p.lookupStatus));
  const targets = [productId, ...waiting.map((p) => p.id)];
  const out = { ...empty, ok: true, also: waiting.map((p) => p.id) };
  const notes: string[] = [];
  for (const id of targets) {
    const r = await applyDetails(id, details);
    if (id === productId) { out.description = r.description; out.details = r.details; out.images = r.images; notes.push(...r.notes); }
  }
  const got = [out.description ? "the description" : "", out.details > 0 ? `${out.details} detail${out.details === 1 ? "" : "s"}` : "", out.images > 0 ? `${out.images} picture${out.images === 1 ? "" : "s"}` : ""].filter(Boolean);
  // Pictures of a colour the product is not listed in are the wrong pictures, however good.
  const wanted = coloursOf(product);
  const shown = (details.pictureColour ?? "").trim();
  const offColour = out.images > 0 && wanted.length > 0 && shown !== "" && !wanted.some((c) => c.toLowerCase().includes(shown.toLowerCase()) || shown.toLowerCase().includes(c.toLowerCase()));
  const said = [
    got.length ? `Took ${got.join(", ")} from the page.` : "The page had nothing to take.",
    out.images > 0 && shown ? `The pictures are of the ${shown} colour${offColour ? `, not the ${wanted.join(" / ")} this product comes in — open the page with that colour selected and paste that link instead` : ""}.` : "",
    details.confident ? "" : `The page is titled "${details.pageTitle || "?"}", which does not clearly match this product — check it is the right page.`,
    ...notes,
    details.via === "basic" ? details.note : "",
  ].filter(Boolean).join(" ");
  return { ...out, said };
}

/** Write one page's details onto one product. Never touches prices, costs, quantities, barcodes or options. */
async function applyDetails(productId: string, d: PageDetails): Promise<{ description: boolean; details: number; images: number; notes: string[] }> {
  const p = await prisma.product.findUniqueOrThrow({ where: { id: productId }, select: { id: true, title: true, bodyHtml: true, lookupStatus: true, images: { select: { id: true, url: true, source: true, position: true } } } });
  const notes: string[] = [];
  const body = houseBody(d.description, d.features);
  // A body the invoice wrote, or an earlier lookup or page read wrote, may be replaced; one a person
  // or a description list supplied is theirs, and the page's words are not laid over the top of it.
  const machine = isPlaceholderBody(p.bodyHtml) || MACHINE_FILLED.includes(p.lookupStatus);
  const writeBody = body !== "" && machine;
  if (body !== "" && !machine) notes.push("It already has a description, so that was kept.");

  // Pictures from an earlier read of this page are replaced; the supplier's own stay.
  const have = new Set(p.images.map((i) => i.url));
  const fresh = d.images.filter((u) => !have.has(u));
  const earlier = p.images.filter((i) => i.source === "PAGE");
  if (fresh.length > 0 && earlier.length > 0) await prisma.productImage.deleteMany({ where: { id: { in: earlier.map((i) => i.id) } } });
  let position = Math.max(0, ...p.images.filter((i) => i.source !== "PAGE" || fresh.length === 0).map((i) => i.position)) + 1;
  for (const url of fresh) {
    await prisma.productImage.create({ data: { productId, url, position: position++, source: "PAGE", altText: p.title, validated: false } });
  }

  await prisma.product.update({
    where: { id: productId },
    data: { ...(writeBody ? { bodyHtml: body } : {}), lookupStatus: d.confident ? "PAGE" : "PAGE_UNSURE", lookupSource: d.sourceUrl, lookupAt: new Date() },
  });
  return { description: writeBody && d.description.trim() !== "", details: writeBody ? d.features.length : 0, images: fresh.length, notes };
}
