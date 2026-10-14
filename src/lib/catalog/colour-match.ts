/**
 * Which of a page's pictures show the colour that was ordered — by looking at them.
 *
 * A brand's page carries pictures of every colour the product comes in, and which is which is
 * written nowhere reliable: a caption that says the colour on one site, a code in the file name
 * on another, nothing at all on a third. Reading the page's words got a black order red bindings.
 * So the pictures themselves are shown to the model, small, with the colour from the order, and
 * it says for each one what colour the product in it is and whether that is the one ordered.
 *
 * Nothing is dropped on a doubt: a picture the model cannot see the product in, or cannot tell the
 * colour of, is kept. Only a picture it is sure shows another colour is left out.
 */

import Anthropic from "@anthropic-ai/sdk";
import { retailer } from "./shop-profile";
import { anthropicClient } from "./anthropic";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import sharp from "sharp";
import { EXTRACTION_MODEL, aiAvailable } from "./extract/ai";

/** The most pictures shown in one look. A page rarely has more that are the product's own. */
export const MOST_PICTURES = 16;
/** The thumbnail's longer side: enough to tell black from brown, small enough to be quick. */
const THUMB = 384;
const LOOK_MS = 45_000;

const Verdict = z.object({
  pictures: z.array(z.object({
    number: z.number().describe("The picture's number as given."),
    colour: z.string().describe("The colour of the product in the picture, as a shop would name it: \"black\", \"red\", \"bear hug brown\". Empty when the product is not in the picture or its colour cannot be told."),
    ordered: z.enum(["yes", "no", "unsure"]).describe("Whether the product in the picture is in the colour ordered. \"no\" only when it is plainly a different colour; \"unsure\" when the product is not clearly visible, the picture is a detail that shows no colour, or the colour cannot be told."),
  })),
  note: z.string().describe("One short sentence: which colours the pictures show."),
});

const SYSTEM = () => `You are shown the pictures from one product's web page, for ${retailer()} who ordered the product in one colour and needs the pictures of that colour only. Look at each picture and say what colour the product in it is, and whether that is the colour ordered. A brand's colour names are what they are: "True Black" is black, "Bear Hug Brown" is brown, "Stout White" is off-white. A lifestyle shot counts by the colour of this product in it. Be plain about a different colour and say "unsure" rather than guess when you cannot see.`;

export interface ColourLook {
  /** The indexes, in the order given, of the pictures to keep. */
  keep: number[];
  /** The colours the left-out pictures showed, as the model named them. */
  otherColours: string[];
  /** The colour the kept pictures show, where the model named one. */
  shown: string;
  /** False when nothing was looked at: no model, nothing ordered, or the look failed. */
  looked: boolean;
}

const getClient = (): Anthropic => anthropicClient(1);

export type Looker = (system: string, content: Anthropic.MessageParam["content"]) => Promise<string | undefined>;
const askModel: Looker = async (system, content) => {
  const response = await getClient().messages.stream({
    model: EXTRACTION_MODEL,
    max_tokens: 2000,
    system,
    output_config: { format: zodOutputFormat(Verdict), effort: "low" },
    messages: [{ role: "user", content }],
  }, { timeout: LOOK_MS, maxRetries: 1, signal: AbortSignal.timeout(LOOK_MS) }).finalMessage();
  return response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
};

/** A picture small enough to send and still show its colour. Null when it is not a picture sharp can read. */
export async function thumbnail(bytes: Buffer): Promise<Buffer | null> {
  try {
    return await sharp(bytes, { failOn: "none" }).rotate().flatten({ background: "#ffffff" }).resize({ width: THUMB, height: THUMB, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer();
  } catch {
    return null;
  }
}

const keepAll = (n: number): ColourLook => ({ keep: Array.from({ length: n }, (_, i) => i), otherColours: [], shown: "", looked: false });

/**
 * Look at the pictures and keep the ones in the colour ordered. Everything is kept when there is
 * no colour to go by, no model to look, or the look fails: the wrong pictures are better caught
 * on the review page than silently thrown away with the right ones.
 */
export async function pickColour(pictures: Buffer[], colours: string[], title: string, deps: { ask?: Looker } = {}): Promise<ColourLook> {
  const ordered = colours.map((c) => c.trim()).filter(Boolean);
  if (pictures.length === 0 || ordered.length === 0) return keepAll(pictures.length);
  if (!deps.ask && !aiAvailable()) return keepAll(pictures.length);
  const ask = deps.ask ?? askModel;

  const shown = pictures.slice(0, MOST_PICTURES);
  const thumbs = await Promise.all(shown.map(thumbnail));
  const content: Anthropic.MessageParam["content"] = [
    { type: "text", text: `Product ordered: ${title}\nColour ordered: ${ordered.join(" / ")}\n\nThe pictures from its page, numbered:` },
  ];
  const numbered: number[] = [];
  thumbs.forEach((t, i) => {
    if (!t) return;
    numbered.push(i);
    content.push({ type: "text", text: `Picture ${i + 1}` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: t.toString("base64") } });
  });
  if (numbered.length === 0) return keepAll(pictures.length);

  let text: string | undefined;
  try {
    text = await ask(SYSTEM(), content);
  } catch {
    return keepAll(pictures.length);
  }
  if (!text) return keepAll(pictures.length);
  const parsed = Verdict.safeParse(JSON.parse(text));
  if (!parsed.success) return keepAll(pictures.length);

  const byNumber = new Map(parsed.data.pictures.map((p) => [Math.round(p.number), p]));
  const keep: number[] = [];
  const others = new Set<string>();
  const kept = new Set<string>();
  for (let i = 0; i < pictures.length; i++) {
    const v = i < shown.length ? byNumber.get(i + 1) : undefined;
    // Beyond what was looked at, or not answered for: kept, as a doubt is.
    if (!v || v.ordered !== "no") {
      keep.push(i);
      if (v?.ordered === "yes" && v.colour.trim()) kept.add(v.colour.trim());
    } else if (v.colour.trim()) {
      others.add(v.colour.trim());
    }
  }
  return { keep, otherColours: [...others], shown: [...kept][0] ?? "", looked: true };
}
