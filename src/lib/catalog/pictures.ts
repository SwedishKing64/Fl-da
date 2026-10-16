/**
 * Every picture that goes onto a listing, made the same shape before it goes.
 *
 * A brand's product shots come in every size and with every amount of air around the product:
 * one site crops tight, another leaves a quarter of the frame empty, a third ships a 600px
 * thumbnail. Shopify shows them all in the same square tiles, so the product with the most air
 * around it looks smallest, and a listing built from three sources looks like three listings.
 *
 * So each picture is set on a square: the margin the site left around the product is trimmed off,
 * the product is scaled to fill the same share of the square every time, and it is centred. A
 * picture on a plain background keeps that background out to the edges; one on a busy background
 * is set on white. The result is a JPEG the shop fetches from this app's own storage, not from the
 * brand's site — which also means the picture stays when the brand takes its page down.
 *
 * Nothing is ever lost by this: a picture that cannot be fetched or cannot be read is left as the
 * address it was, and the listing carries that.
 */

import sharp from "sharp";
import { getSettings } from "./settings";
import { pictureHosting, publicFileUrl, saveFile } from "./storage";
import { pickColour, type ColourLook, type Looker } from "./colour-match";

/** The square's side: big enough for Shopify's zoom, small enough to be quick. */
export const CANVAS_MAX = 2048;
/** No smaller than this, so a thumbnail from a site is not a thumbnail in the shop. */
export const CANVAS_MIN = 1000;
/** The share of the square the product's longer side takes. */
export const FILL = 0.86;
/** How much a pixel may differ from the corner colour and still count as margin. */
const MARGIN_THRESHOLD = 18;
/** One fetch's time, and the most it may be. */
const FETCH_MS = 12_000;
const MAX_BYTES = 20 * 1024 * 1024;
/** How long a whole set of pictures may take, all in: the rest stay as the addresses they were. */
const SET_MS = 60_000;

export interface Framed { data: Buffer; width: number; height: number }

/** The side of the square for a product that is `longest` pixels on its longer side. */
export function canvasFor(longest: number): number {
  return Math.min(CANVAS_MAX, Math.max(CANVAS_MIN, Math.round(longest / FILL)));
}

type Rgb = { r: number; g: number; b: number };
const near = (a: Rgb, b: Rgb, by = MARGIN_THRESHOLD): boolean => Math.abs(a.r - b.r) <= by && Math.abs(a.g - b.g) <= by && Math.abs(a.b - b.b) <= by;
const WHITE: Rgb = { r: 255, g: 255, b: 255 };

/** The colour at each corner of a flattened picture. */
async function corners(flat: Buffer, width: number, height: number): Promise<Rgb[]> {
  const spots = [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]];
  const out: Rgb[] = [];
  for (const [left, top] of spots) {
    const px = await sharp(flat).extract({ left, top, width: 1, height: 1 }).raw().toBuffer();
    out.push({ r: px[0], g: px[1], b: px[2] });
  }
  return out;
}

/**
 * Set one picture on its square. Null when the bytes are not a picture this can read (an animated
 * GIF, an SVG, a broken file), so the caller keeps what it had.
 */
export async function framePicture(input: Buffer): Promise<Framed | null> {
  let meta: sharp.Metadata;
  try {
    meta = await sharp(input, { failOn: "none" }).metadata();
  } catch {
    return null;
  }
  if (!meta.width || !meta.height || (meta.pages ?? 1) > 1 || meta.format === "svg") return null;

  // Upright, opaque, on white where it was see-through.
  const flat = await sharp(input, { failOn: "none" }).rotate().flatten({ background: "#ffffff" }).toFormat("png").toBuffer();
  const { width, height } = await sharp(flat).metadata();
  if (!width || !height) return null;

  // The background is what the corners agree on; a busy picture whose corners differ is set on white.
  const edge = await corners(flat, width, height);
  const uniform = edge.every((c) => near(c, edge[0]));
  const background: Rgb = uniform ? edge[0] : WHITE;

  // The margin the site left around the product, trimmed off — only on a plain background, where
  // there is a margin to speak of.
  let subject = flat;
  let sw = width, sh = height;
  if (uniform) {
    try {
      const t = await sharp(flat).trim({ background: `rgb(${background.r},${background.g},${background.b})`, threshold: MARGIN_THRESHOLD }).toBuffer({ resolveWithObject: true });
      // A trim that leaves a sliver found no product, only a mark; keep the whole picture then.
      if (t.info.width >= width * 0.08 && t.info.height >= height * 0.08) { subject = t.data; sw = t.info.width; sh = t.info.height; }
    } catch {
      // Nothing to trim: the picture is one colour, or sharp could not say. Kept whole.
    }
  }

  const side = canvasFor(Math.max(sw, sh));
  const target = Math.round(side * FILL);
  const fitted = await sharp(subject).resize({ width: target, height: target, fit: "inside", withoutEnlargement: false, kernel: "lanczos3" }).toBuffer({ resolveWithObject: true });
  const left = Math.floor((side - fitted.info.width) / 2);
  const top = Math.floor((side - fitted.info.height) / 2);
  const data = await sharp(fitted.data)
    .extend({ left, top, right: side - fitted.info.width - left, bottom: side - fitted.info.height - top, background: { r: background.r, g: background.g, b: background.b, alpha: 1 } })
    .jpeg({ quality: 88, mozjpeg: true, chromaSubsampling: "4:4:4" })
    .toBuffer();
  return { data, width: side, height: side };
}

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "picture";

/** Fetch one picture from the web: its bytes, or null when the site will not give them or they are not a picture. */
export async function fetchPicture(url: string, fetcher: typeof fetch = fetch): Promise<Buffer | null> {
  try {
    const res = await fetcher(url, {
      signal: AbortSignal.timeout(FETCH_MS),
      headers: { accept: "image/*,*/*;q=0.5", "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" },
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (type && !/^image\//i.test(type) && !/octet-stream/i.test(type)) return null;
    const length = Number(res.headers.get("content-length") ?? 0);
    if (length > MAX_BYTES) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    return bytes.length > MAX_BYTES || bytes.length === 0 ? null : bytes;
  } catch {
    return null;
  }
}

/** Frame a picture and keep it in this app's storage. The public address, or null when it has none here. */
export async function storePicture(bytes: Buffer, name: string, publicBaseUrl?: string): Promise<string | null> {
  const framed = await framePicture(bytes);
  if (!framed) return null;
  const ref = await saveFile("images", `${slug(name)}.jpg`, framed.data);
  const base = publicBaseUrl ?? (await getSettings()).publicBaseUrl;
  return publicFileUrl(ref, base);
}

/**
 * The pictures a page gave, each fetched, framed and kept here, in the same order. One that cannot
 * be is left as the address it was. A few at a time, and the set as a whole gets a minute: past
 * that the rest are left as they were, so a slow site cannot hold up a build.
 */
export async function hostPictures(urls: string[], name: string, deps: { fetcher?: typeof fetch; publicBaseUrl?: string; until?: number } = {}): Promise<string[]> {
  if (urls.length === 0) return urls;
  const base = deps.publicBaseUrl ?? (await getSettings()).publicBaseUrl;
  // With nowhere public to serve them from, framed copies would be addresses the shop cannot
  // reach; the brand's own are better than that. Blob storage and the vendor's store serve their own.
  if (!pictureHosting() && !publicFileUrl("images/x.jpg", base)) return urls;
  const out = [...urls];
  const until = Math.min(deps.until ?? Infinity, Date.now() + SET_MS);
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < urls.length; i = next++) {
      if (Date.now() > until) return;
      const bytes = await fetchPicture(urls[i], deps.fetcher);
      if (!bytes) continue;
      const hosted = await storePicture(bytes, `${name}-${i + 1}`, base).catch(() => null);
      if (hosted) out[i] = hosted;
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return out;
}

export interface HostedOfColour {
  /** The pictures kept, in the order given: hosted where they could be, as they were where not. */
  images: string[];
  /** How many were left out for being another colour. */
  leftOut: number;
  /** The colours the left-out pictures showed. */
  otherColours: string[];
  /** The colour the kept pictures show, where the model named one. */
  shown: string;
  /** Beside each kept picture: the ordered colour it shows, in the order's spelling, or "" when not known. */
  colours: string[];
  /** False when the pictures were not looked at: no colour ordered, no model, or the look failed. */
  looked: boolean;
}

/**
 * A page's pictures, with the ones in another colour left out: fetched, looked at against the
 * colour ordered, and the rest framed and kept here. A picture that could not be fetched is kept
 * as the address it was, unlooked at — the review page is where to catch it.
 */
export async function hostPicturesOfColour(urls: string[], name: string, colours: string[], deps: { fetcher?: typeof fetch; publicBaseUrl?: string; until?: number; ask?: Looker } = {}): Promise<HostedOfColour> {
  const none: HostedOfColour = { images: urls, leftOut: 0, otherColours: [], shown: "", colours: urls.map(() => ""), looked: false };
  if (urls.length === 0) return none;
  const base = deps.publicBaseUrl ?? (await getSettings()).publicBaseUrl;
  const canHost = pictureHosting() || publicFileUrl("images/x.jpg", base) !== null;
  const until = Math.min(deps.until ?? Infinity, Date.now() + SET_MS);

  // Fetched, a few at a time.
  const bytes: Array<Buffer | null> = urls.map(() => null);
  let next = 0;
  const fetchWorker = async () => {
    for (let i = next++; i < urls.length; i = next++) {
      if (Date.now() > until) return;
      bytes[i] = await fetchPicture(urls[i], deps.fetcher);
    }
  };
  await Promise.all([fetchWorker(), fetchWorker(), fetchWorker(), fetchWorker()]);

  // Looked at, the ones that were fetched.
  const got = bytes.map((b, i) => ({ b, i })).filter((x): x is { b: Buffer; i: number } => x.b !== null);
  let look: ColourLook = { keep: got.map((_, k) => k), otherColours: [], shown: "", which: {}, looked: false };
  if (got.length > 0 && colours.some((c) => c.trim())) look = await pickColour(got.map((x) => x.b), colours, name, { ask: deps.ask });
  const keepIndex = new Set(look.keep.map((k) => got[k].i));
  const colourOf = new Map<number, string>();
  for (const [k, c] of Object.entries(look.which)) colourOf.set(got[Number(k)].i, c);

  // Kept: framed and stored where they can be, as they were where not; the unfetched as they were.
  const images: string[] = [];
  const pictureColours: string[] = [];
  for (let i = 0; i < urls.length; i++) {
    const b = bytes[i];
    if (b === null) { images.push(urls[i]); pictureColours.push(""); continue; }
    if (!keepIndex.has(i)) continue;
    const hosted = canHost && Date.now() <= until ? await storePicture(b, `${name}-${i + 1}`, base).catch(() => null) : null;
    images.push(hosted ?? urls[i]);
    pictureColours.push(colourOf.get(i) ?? "");
  }
  return { images, leftOut: got.length - look.keep.length, otherColours: look.otherColours, shown: look.shown, colours: pictureColours, looked: look.looked };
}
