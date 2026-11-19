/**
 * The pictures a page gave, made right for the colour ordered, and what to tell the person.
 *
 * One place for the two readers (a delivery's product pages, an import batch's links) so that they
 * say the same things: how many pictures were left out and why, and what to do when the page had
 * none of the colour at all.
 */

import type { PageDetails } from "./page-types";
import { hostPicturesOfColour } from "./pictures";
import { isColourCode } from "./colour";

const list = (xs: string[]): string => xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

/** The page's pictures hosted and in the colour ordered, with the note to show. */
export async function picturesForColour(details: PageDetails, name: string, colours: string[], deps: Parameters<typeof hostPicturesOfColour>[3] = {}): Promise<PageDetails> {
  // A colour that is only a code ("001") cannot be seen in a picture, so it is not looked for.
  const wanted = colours.map((c) => c.trim()).filter((c) => c && !isColourCode(c));
  let r = await hostPicturesOfColour(details.images, name, wanted, deps);
  // None of the ordered colour: the product's pictures are still better than none (asked
  // 2026-10-20 — pictures fetched by hand after a page read took none). All of them are kept,
  // and the note says to swap them, or to give that colour its own page.
  const allOther = r.looked && wanted.length > 0 && r.images.length === 0 && r.leftOut > 0;
  const others = r.otherColours;
  if (allOther) r = { ...(await hostPicturesOfColour(details.images, name, [], deps)), leftOut: r.leftOut, otherColours: others, looked: true, shown: "" };
  let pictureNote = "";
  if (r.looked && wanted.length > 0) {
    const others = r.otherColours.length > 0 ? ` (${list(r.otherColours)})` : "";
    // Several colours on one page: which of them the pictures were matched to, for their variants.
    const found = wanted.filter((c) => r.colours.some((x) => x.toLowerCase() === c.toLowerCase()));
    const missing = wanted.filter((c) => !found.includes(c));
    const perColour = wanted.length > 1 && !allOther ? ` Pictures matched for ${found.length ? list(found) : "none of the colours"}${missing.length ? `; none for ${list(missing)}, so those variants have no picture of their own` : ", each colour's variants given its own"}.` : "";
    if (allOther) {
      pictureNote = `The page's ${r.leftOut === 1 ? "picture is" : `${r.leftOut} pictures are all`} of another colour${others}, none of the ${list(wanted)} ordered. They were kept so the product has pictures; for the right ones, paste the ${list(wanted)} page into that colour's own link box.`;
    } else if (r.leftOut > 0) {
      pictureNote = `${r.leftOut} picture${r.leftOut === 1 ? "" : "s"} of other colours${others} left out; the ${r.images.length} kept show the ${r.shown || list(wanted)}.${perColour}`;
    } else if (r.shown) {
      pictureNote = `The pictures show the ${r.shown}.${perColour}`;
    }
  }
  return { ...details, images: r.images, imageColours: r.colours, pictureColour: r.looked ? r.shown : details.pictureColour, pictureNote: pictureNote || undefined };
}
