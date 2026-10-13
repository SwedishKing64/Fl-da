/**
 * The pictures a page gave, made right for the colour ordered, and what to tell the person.
 *
 * One place for the two readers (a delivery's product pages, an import batch's links) so that they
 * say the same things: how many pictures were left out and why, and what to do when the page had
 * none of the colour at all.
 */

import type { PageDetails } from "./page-types";
import { hostPicturesOfColour } from "./pictures";

const list = (xs: string[]): string => xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

/** The page's pictures hosted and in the colour ordered, with the note to show. */
export async function picturesForColour(details: PageDetails, name: string, colours: string[], deps: Parameters<typeof hostPicturesOfColour>[3] = {}): Promise<PageDetails> {
  const wanted = colours.map((c) => c.trim()).filter(Boolean);
  const r = await hostPicturesOfColour(details.images, name, wanted, deps);
  let pictureNote = "";
  if (r.looked && wanted.length > 0) {
    const others = r.otherColours.length > 0 ? ` (${list(r.otherColours)})` : "";
    if (r.images.length === 0 && r.leftOut > 0) {
      pictureNote = `The page's ${r.leftOut === 1 ? "picture is" : `${r.leftOut} pictures are all`} of another colour${others}, none of the ${list(wanted)} ordered, so none were taken. Open the page with ${list(wanted)} selected and paste that link, or add the pictures by hand.`;
    } else if (r.leftOut > 0) {
      pictureNote = `${r.leftOut} picture${r.leftOut === 1 ? "" : "s"} of other colours${others} left out; the ${r.images.length} kept show the ${r.shown || list(wanted)}.`;
    } else if (r.shown) {
      pictureNote = `The pictures show the ${r.shown}.`;
    }
  }
  return { ...details, images: r.images, pictureColour: r.looked ? r.shown : details.pictureColour, pictureNote: pictureNote || undefined };
}
