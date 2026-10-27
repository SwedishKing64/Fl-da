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
import { isPlaceholderBody } from "./body";
import { shopBody } from "./description-style";
import { cleanProductUrl, colourLinksOf, coloursOfProduct, fitlessOf, flatHandleOf, sameColour, type ColourLink, type PageDetails } from "./page-types";
import { readProductPage, PageError } from "./extract/page";
import { picturesForColour } from "./picture-colour";
import { pageProductTitle } from "./page-title";
import { genderOf, genderedTitle } from "./trades/snow/gender-title";
import { withoutGender } from "./mapping";
import { seoTitle, titleYear, titledForShop } from "./titles";

/** A package is read from its ski's page: "… inc Marker Griffon Binding Package" is the ski's name with a binding added. */
export const flatTitleOf = (title: string): string => title.replace(/\s+inc\s+.*binding package$/i, "").replace(/\s+inc\s+.*$/i, "").trim();

/** Whether a product's title is its own model's, not a package or a fit of a model whose page it shares. */
const ownPage = (title: string): boolean => flatTitleOf(title) === title.trim() && fitlessOf(title) === title.replace(/\s+/g, " ").trim().toLowerCase();

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

/** Fetch a product's page and write what it says onto the product, and onto its package; then each colour's own page. */
export async function readProductLink(productId: string, deps: { read?: typeof readProductPage; pictures?: typeof picturesForColour } = {}): Promise<PageRead> {
  const product = await prisma.product.findUniqueOrThrow({ where: { id: productId }, select: { lookupSource: true, colourLinks: true } });
  const url = product.lookupSource.trim();
  const perColour = colourLinksOf(product.colourLinks).filter((l) => l.url);
  const empty = { productId, description: false, details: 0, images: 0, also: [] as string[] };
  if (!url && perColour.length === 0) return { ...empty, ok: false, said: "There is no link beside this product." };
  const main = url ? await readMainLink(productId, url, deps) : null;
  if (perColour.length === 0) return main!;
  const colours = await readColourLinks(productId, perColour, { describe: !main?.ok }, deps);
  return {
    productId,
    ok: (main?.ok ?? false) || colours.ok,
    said: [main?.said ?? "", colours.said].filter(Boolean).join(" "),
    description: (main?.description ?? false) || colours.description,
    details: Math.max(main?.details ?? 0, colours.details),
    images: (main?.images ?? 0) + colours.images,
    also: main?.also ?? [],
  };
}

async function readMainLink(productId: string, url: string, deps: { read?: typeof readProductPage; pictures?: typeof picturesForColour }): Promise<PageRead> {
  const read = deps.read ?? readProductPage;
  const pictures = deps.pictures ?? picturesForColour;
  const product = await prisma.product.findUniqueOrThrow({ where: { id: productId }, include: { variants: { select: { sku: true, option1Value: true, option2Value: true, option3Value: true } } } });
  const empty = { productId, description: false, details: 0, images: 0, also: [] as string[] };

  let details: PageDetails;
  try {
    details = await read(url, { title: flatTitleOf(product.title), brand: product.vendor || undefined, modelCode: product.variants.map((v) => v.sku).find(Boolean), colours: coloursOf(product) });
    // The pictures looked at for the product's colour, then each set on its square and kept here.
    details = await pictures(details, product.title, coloursOf(product));
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
  const said = [
    got.length ? `Took ${got.join(", ")} from the page.` : "The page had nothing to take.",
    details.pictureNote ?? "",
    details.confident ? "" : `The page is titled "${details.pageTitle || "?"}", which does not clearly match this product — check it is the right page.`,
    ...notes,
    details.via === "basic" ? details.note : "",
  ].filter(Boolean).join(" ");
  return { ...out, said };
}

/**
 * A colour's own page (asked 2026-10-19): a jacket in three colours is often three pages on the
 * brand's site, each with its own pictures. Each colour's page gives that colour its pictures — the
 * first becomes the picture of that colour's variants — and, where the product has no page of its
 * own, the first colour's page gives the description and the title as well.
 */
async function readColourLinks(productId: string, links: ColourLink[], opts: { describe: boolean }, deps: { read?: typeof readProductPage; pictures?: typeof picturesForColour }): Promise<{ ok: boolean; said: string; description: boolean; details: number; images: number }> {
  const read = deps.read ?? readProductPage;
  const pictures = deps.pictures ?? picturesForColour;
  const product = await prisma.product.findUniqueOrThrow({ where: { id: productId }, include: { variants: { select: { sku: true } } } });
  const out = { ok: false, said: "", description: false, details: 0, images: 0 };
  const said: string[] = [];
  let describe = opts.describe;
  const done: ColourLink[] = [];
  for (const link of links) {
    try {
      let d = await read(link.url, { title: flatTitleOf(product.title), brand: product.vendor || undefined, modelCode: product.variants.map((v) => v.sku).find(Boolean), colours: [link.colour] });
      d = await pictures(d, product.title, [link.colour]);
      if (describe) {
        // Words and title from this page, but not its pictures: they are this colour's alone.
        const r = await applyDetails(productId, { ...d, images: [] }, { source: false });
        out.description = r.description; out.details = r.details;
        said.push(...r.notes);
        describe = false;
      }
      const n = await applyColourPictures(productId, link.colour, d.images);
      out.images += n;
      out.ok = true;
      said.push(`${link.colour}: ${n > 0 ? `took ${n} picture${n === 1 ? "" : "s"} from its page` : "its page had no pictures to take"}.${d.confident ? "" : ` The page is titled "${d.pageTitle || "?"}", which does not clearly match — check it is the right one.`}`);
      done.push({ ...link, status: d.confident ? "PAGE" : "PAGE_UNSURE" });
    } catch (err) {
      said.push(`${link.colour}: ${err instanceof PageError ? err.message : "the page could not be read."}`);
      done.push({ ...link, status: "LINK_FAILED" });
    }
  }
  const all = colourLinksOf(product.colourLinks).map((l) => done.find((x) => sameColour(x.colour, l.colour)) ?? l);
  // Read, as far as the panel is concerned, once a colour's page was. A product with a page of its
  // own keeps the standing that page gave it; one only waiting on its colours' pages is now read.
  const { lookupStatus } = await prisma.product.findUniqueOrThrow({ where: { id: productId }, select: { lookupStatus: true } });
  const waited = WAITING.includes(lookupStatus) && !product.lookupSource.trim();
  await prisma.product.update({
    where: { id: productId },
    data: { colourLinks: JSON.stringify(all), ...(waited ? { lookupStatus: out.ok ? "PAGE" : "LINK_FAILED", lookupAt: new Date() } : {}) },
  });
  out.said = said.join(" ");
  return out;
}

/** The marker on a picture that came from one colour's page, so a later read of that page replaces it. */
const colourMark = (colour: string): string => `Colour: ${colour.trim()}`;

/** One colour's pictures onto the product: the gallery, and the first on that colour's variants. */
async function applyColourPictures(productId: string, colour: string, urls: string[]): Promise<number> {
  const p = await prisma.product.findUniqueOrThrow({
    where: { id: productId },
    select: { option1Name: true, option2Name: true, option3Name: true, images: { select: { id: true, url: true, source: true, position: true, altText: true } }, variants: { select: { id: true, option1Value: true, option2Value: true, option3Value: true }, orderBy: { sortOrder: "asc" } } },
  });
  const mark = colourMark(colour);
  const earlier = p.images.filter((i) => i.source === "PAGE" && i.altText === mark);
  const kept = p.images.filter((i) => !earlier.includes(i));
  if (urls.length === 0) return 0;
  const have = new Map(kept.map((i) => [i.url, i]));
  if (earlier.length > 0) await prisma.productImage.deleteMany({ where: { id: { in: earlier.map((i) => i.id) } } });
  const at = [p.option1Name, p.option2Name, p.option3Name].findIndex((n) => /colou?r/i.test(n ?? ""));
  const first = at < 0 ? undefined : p.variants.find((v) => sameColour([v.option1Value, v.option2Value, v.option3Value][at] ?? "", colour));
  let position = Math.max(0, ...kept.map((i) => i.position)) + 1;
  // A picture the product already has — a brand like Burton shows every colour on one page, so the
  // product's own link brought it in — is this colour's all the same: it is marked as this colour's,
  // and the first becomes its variants' picture. Counting it as nothing taken left the White Cartel
  // X with no pictures of its own (asked 2026-10-22).
  for (const [i, url] of urls.entries()) {
    const there = have.get(url);
    if (there) {
      await prisma.productImage.update({ where: { id: there.id }, data: { altText: mark, ...(i === 0 && first ? { variantId: first.id } : {}) } });
      continue;
    }
    await prisma.productImage.create({ data: { productId, url, position: position++, source: "PAGE", altText: mark, validated: false, ...(i === 0 && first ? { variantId: first.id } : {}) } });
  }
  return urls.length;
}

/** Save, or clear, one colour's own page. */
export async function setColourLink(productId: string, colour: string, raw: string): Promise<{ url: string }> {
  const product = await prisma.product.findUniqueOrThrow({ where: { id: productId }, select: { colourLinks: true, lookupStatus: true } });
  const cleaned = cleanProductUrl(raw);
  if ("error" in cleaned && cleaned.error) throw new Error(cleaned.error);
  const url = "error" in cleaned ? "" : cleaned.url;
  const others = colourLinksOf(product.colourLinks).filter((l) => !sameColour(l.colour, colour));
  const next = url ? [...others, { colour: colour.trim(), url, status: "LINKED" }] : others;
  await prisma.product.update({
    where: { id: productId },
    // A new page waits to be read, as the product's own link does. See linkedFrom.
    data: { colourLinks: JSON.stringify(next), ...(url ? { lookupStatus: linkedFrom(product.lookupStatus), lookupAt: null } : {}) },
  });
  return { url };
}

/** The first variant of each colour the product comes in, by the colour in lower case. */
function variantByColour(p: { option1Name: string | null; option2Name: string | null; option3Name: string | null; variants: Array<{ id: string; option1Value: string | null; option2Value: string | null; option3Value: string | null }> }): Map<string, string> {
  const at = [p.option1Name, p.option2Name, p.option3Name].findIndex((n) => /colou?r/i.test(n ?? ""));
  const out = new Map<string, string>();
  if (at < 0) return out;
  for (const v of p.variants) {
    const colour = ([v.option1Value, v.option2Value, v.option3Value][at] ?? "").trim().toLowerCase();
    if (colour && !out.has(colour)) out.set(colour, v.id);
  }
  return out;
}

/** Write one page's details onto one product. Never touches prices, costs, quantities, barcodes or options. */
async function applyDetails(productId: string, d: PageDetails, opts: { source?: boolean } = {}): Promise<{ description: boolean; details: number; images: number; notes: string[] }> {
  const p = await prisma.product.findUniqueOrThrow({ where: { id: productId }, select: { id: true, title: true, vendor: true, productType: true, tags: true, reconcileStatus: true, bodyHtml: true, lookupStatus: true, option1Name: true, option2Name: true, option3Name: true, variants: { select: { id: true, option1Value: true, option2Value: true, option3Value: true }, orderBy: { sortOrder: "asc" } }, images: { select: { id: true, url: true, source: true, position: true, altText: true } } } });
  const notes: string[] = [];
  // Titled as the page titles it, when the page is surely this product and the product is the
  // page's own model — a binding package or a wide fit sharing the ski's page keeps its own name.
  // Only a new product: one the shop already lists keeps the name it is listed under.
  const isNew = !["UPDATE", "VARIANT_ADD"].includes(p.reconcileStatus);
  const tagList = p.tags.split(",").map((t) => t.trim()).filter(Boolean);
  const season = titleYear(tagList, p.productType);
  const fromPage = d.confident && isNew && ownPage(withoutGender(p.title).title) ? titledForShop(p.vendor, pageProductTitle(d.pageTitle, p.vendor, season, coloursOfProduct(p))) : "";
  // Snow clothing keeps who it is for on the front of the page's name. See gender-title.ts.
  const named = fromPage ? genderedTitle(fromPage, { productType: p.productType, tags: tagList, gender: genderOf(tagList) }) : "";
  const retitle = named !== "" && named !== p.title;
  if (retitle) notes.push(`Titled "${named}", as the page names it.`);
  const body = await shopBody(d.description, d.features);
  // A body the invoice wrote, or an earlier lookup or page read wrote, may be replaced; one a person
  // or a description list supplied is theirs, and the page's words are not laid over the top of it.
  const machine = isPlaceholderBody(p.bodyHtml) || MACHINE_FILLED.includes(p.lookupStatus);
  const writeBody = body !== "" && machine;
  if (body !== "" && !machine) notes.push("It already has a description, so that was kept.");

  // Pictures from an earlier read of this page are replaced; the supplier's own stay.
  const have = new Set(p.images.map((i) => i.url));
  const fresh = d.images.filter((u) => !have.has(u));
  // A colour's own page's pictures belong to that page, and stay. See applyColourPictures.
  const earlier = p.images.filter((i) => i.source === "PAGE" && !i.altText.startsWith("Colour: "));
  if (fresh.length > 0 && earlier.length > 0) await prisma.productImage.deleteMany({ where: { id: { in: earlier.map((i) => i.id) } } });
  let position = Math.max(0, ...p.images.filter((i) => i.source !== "PAGE" || fresh.length === 0).map((i) => i.position)) + 1;
  // A picture the look matched to one of the colours ordered goes on that colour's variant, so
  // Shopify shows the black binding on the black variant; the first of each colour is the one.
  const variantOfColour = variantByColour(p);
  const given = new Set<string>();
  for (const url of fresh) {
    const colour = (d.imageColours?.[d.images.indexOf(url)] ?? "").trim().toLowerCase();
    const variantId = colour && !given.has(colour) ? variantOfColour.get(colour) : undefined;
    if (variantId) given.add(colour);
    await prisma.productImage.create({ data: { productId, url, position: position++, source: "PAGE", altText: p.title, validated: false, ...(variantId ? { variantId } : {}) } });
  }

  await prisma.product.update({
    where: { id: productId },
    data: { ...(writeBody ? { bodyHtml: body } : {}), ...(retitle ? { title: named, seoTitle: seoTitle(p.vendor, named) } : {}), lookupStatus: d.confident ? "PAGE" : "PAGE_UNSURE", ...(opts.source === false ? {} : { lookupSource: d.sourceUrl }), lookupAt: new Date() },
  });
  return { description: writeBody && d.description.trim() !== "", details: writeBody ? d.features.length : 0, images: fresh.length, notes };
}
