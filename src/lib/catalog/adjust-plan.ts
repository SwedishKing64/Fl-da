/**
 * Turning "put all the Spyder jackets 30% off and into clearance" into something that can be
 * applied to a file, checked, and shown to a person before it runs.
 *
 * The instruction is read against what the uploaded file actually contains — its vendors, its
 * types, its tags — rather than in the abstract, so a scope can only ever name something that is
 * really in there. A scope that matches nothing is a far better outcome than a scope that
 * silently matches everything.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { EXTRACTION_MODEL, aiAvailable } from "./extract/ai";
import type { Operation, Plan } from "./adjust";

const ScopeSchema = z.object({
  vendors: z.array(z.string()).describe("Vendor names exactly as the file spells them. Empty unless the instruction names a brand."),
  types: z.array(z.string()).describe("Shopify Type values exactly as the file spells them. Empty unless the instruction names one."),
  tags: z.array(z.string()).describe("Tags the product must ALL carry at once, exactly as the file spells them. Use this only for 'X and Y'. Empty otherwise."),
  anyTags: z.array(z.string()).describe("Tags where carrying ANY ONE is enough. This is what a list means: 'items tagged 2024 or 2025 or 2999' goes here, never in tags. Empty otherwise."),
  excludeTags: z.array(z.string()).describe("Tags that rule a product out however well it matches. 'but not the 2027s', 'except anything tagged clearance'. Empty otherwise."),
  excludeVendors: z.array(z.string()).describe("Vendors ruled out the same way. Empty otherwise."),
  handles: z.array(z.string()).describe("Exact product handles, when the instruction lists specific products. Otherwise empty."),
  titleContains: z.string().describe("A word from the product title to match on, when nothing else narrows it. Empty otherwise."),
});

const OperationSchema = z.object({
  kind: z.enum(["discount", "endSale", "setPrice", "addTags", "removeTags", "setStatus", "setType", "setVendor"]),
  percent: z.number().nullable().describe("For discount: the percentage off, 1-95. Null otherwise."),
  from: z.enum(["rrp", "current"]).nullable().describe("For discount: 'rrp' (the default, off the recommended retail in Compare At) or 'current' only when the instruction plainly means off today's price."),
  value: z.number().nullable().describe("For setPrice: the new price. Null otherwise."),
  tags: z.array(z.string()).describe("For addTags/removeTags: the tags, spelled as this shop spells them. Empty otherwise."),
  status: z.enum(["active", "draft", "archived"]).nullable().describe("For setStatus. Null otherwise."),
  text: z.string().describe("For setType/setVendor: the new value. Empty otherwise."),
});

const PlanSchema = z.object({
  understood: z.string().describe("What you are about to do, in one plain sentence, naming the scope and the change."),
  unclear: z.string().describe("What you could not work out from the instruction, if anything. Empty when it was clear."),
  scope: ScopeSchema,
  operations: z.array(OperationSchema),
});

export interface PlannedChange {
  plan: Plan;
  understood: string;
  unclear: string;
  /** Why this instruction must not run. Non-empty means the plan carries no operations. */
  blocked: string[];
}

const SYSTEM = `You turn an instruction from a ski shop's staff into edits to a Shopify product export.

The shop's rules, which you follow without being told:
- The recommended retail price lives in the Compare At column. Putting something "on sale", "on clearance" or "X% off" means the discount comes off the RECOMMENDED RETAIL, not off whatever the price happens to be today, so a product marked down twice does not compound. Use from: "rrp" unless the instruction plainly says otherwise.
- "Into clearance" or "on clearance" means a discount AND the clearance tag. If the instruction gives no percentage, do the tag only and say in "unclear" that no percentage was given. An instruction that plainly says which tags to ADD is exactly that and nothing more: do the tags, add no discount, and leave "unclear" empty — it is not missing a percentage.
- Tags are lower case. Use the spelling the file already uses when the file has something close.

How to read a list of values. "Items tagged 2999 or 2026 or 2025" is ANY ONE of them, so it goes in anyTags. The tags field means ALL AT ONCE, and no product carries five different years, so putting a list there matches nothing. Getting this backwards is the single worst thing you can do here.

How to read an exclusion. "Therefore items tagged 2027 should not be edited", "everything except the Oakleys", "but leave the 2027s alone" — that is excludeTags or excludeVendors. An exclusion is never a reason to widen the scope, and saying which things to leave out does not mean every other thing is in.

Only ever name a vendor, type or tag that appears in the list of what the file contains. If the instruction names something the file does not have, leave that field empty and say so in "unclear" — a scope that matches nothing is much better than one that matches everything.

If the instruction does not narrow the products at all, leave every scope field empty and say so in "unclear". Never invent a scope to make an instruction fit, and NEVER fall back to an empty scope because the right one was hard to express — an empty scope edits the whole shop. If you cannot express the SCOPE, return no operations and say why in "unclear".

That last rule is about the scope and nothing else. When the instruction says plainly what to do — add a tag, take 30% off — always return that operation. Whether it turns out to change anything is not your decision: the products it matches may already be that way, and the page works that out for itself and says so.`;

let client: Anthropic | null = null;
const getClient = (): Anthropic => (client ??= new Anthropic());

export function planningAvailable(): boolean {
  return aiAvailable();
}

function toOperation(raw: z.infer<typeof OperationSchema>): Operation | null {
  switch (raw.kind) {
    case "discount": {
      const percent = raw.percent ?? 0;
      if (!(percent > 0 && percent < 100)) return null;
      return { kind: "discount", percent, ...(raw.from === "current" ? { from: "current" as const } : {}) };
    }
    case "endSale": return { kind: "endSale" };
    case "setPrice": return typeof raw.value === "number" && raw.value >= 0 ? { kind: "setPrice", value: raw.value } : null;
    case "addTags": return raw.tags.length ? { kind: "addTags", tags: raw.tags } : null;
    case "removeTags": return raw.tags.length ? { kind: "removeTags", tags: raw.tags } : null;
    case "setStatus": return raw.status ? { kind: "setStatus", status: raw.status } : null;
    case "setType": return raw.text.trim() ? { kind: "setType", value: raw.text.trim() } : null;
    case "setVendor": return raw.text.trim() ? { kind: "setVendor", value: raw.text.trim() } : null;
  }
}

/**
 * Keep only the scope values the file really has.
 *
 * Two rules do the work here. A value the file has never heard of is dropped, so a typo narrows to
 * nothing rather than to everything. And if dropping it empties a whole field, the scope that comes
 * back is WIDER than the one asked for — "2999 ski bindings" becomes "everything tagged 2999" —
 * so the instruction is blocked instead. A scope that quietly grows is how a sheet about bindings
 * ends up repricing skis.
 */
export function groundScope(
  scope: z.infer<typeof ScopeSchema>,
  file: { vendors: string[]; types: string[]; tags: string[] },
): { scope: Plan["scope"]; dropped: string[]; blocked: string[] } {
  const dropped: string[] = [];
  const blocked: string[] = [];
  // Spelling drifts between a buyer's sheet and a Shopify export in one predictable way: spaces,
  // hyphens and underscores. "snowboard bindings" on the page is "snowboard-bindings" in the file
  // and they are the same shelf, so they are matched as the same word.
  const norm = (value: string): string => value.toLowerCase().replace(/[-_\s]+/g, " ").trim();
  const keep = (wanted: string[], have: string[], what: string): string[] => {
    const out: string[] = [];
    for (const w of wanted) {
      const match = have.find((h) => norm(h) === norm(w));
      if (match) out.push(match);
      else if (w.trim()) dropped.push(`${what} "${w.trim()}" is not in this file`);
    }
    return out;
  };

  const vendors = keep(scope.vendors, file.vendors, "vendor");
  let tags = keep(scope.tags, file.tags, "tag");
  let anyTags = keep(scope.anyTags, file.tags, "tag");

  // The category column of a buyer's sheet names a shelf in the shop's menu, and this shop keeps
  // some of those shelves in Type and others in tags — "Snowboard Bindings" is a Type, "ski-helmets"
  // is a tag, and the sheet spells both the same way. So a category that is not a Type is looked
  // for among the tags before it is given up on.
  const types: string[] = [];
  for (const wanted of scope.types) {
    if (!wanted.trim()) continue;
    const asType = file.types.find((t) => norm(t) === norm(wanted));
    if (asType) { types.push(asType); continue; }
    const asTag = file.tags.find((t) => norm(t) === norm(wanted));
    if (asTag) { tags.push(asTag); dropped.push(`matched "${wanted.trim()}" on the tag rather than the type`); continue; }
    dropped.push(`type "${wanted.trim()}" is not in this file`);
  }

  // An exclusion the file has never heard of is harmless — it simply excludes nothing — so it is
  // kept rather than dropped, and never reported as a problem.
  const excludeTags = scope.excludeTags.map((t) => t.trim()).filter(Boolean);
  const excludeVendors = scope.excludeVendors.map((v) => v.trim()).filter(Boolean);
  const handles = scope.handles.map((h) => h.trim()).filter(Boolean);
  const titleContains = scope.titleContains.trim();

  // Two or more tags in the ALL list is almost always a list of alternatives read the wrong way —
  // no product carries two years or two shelves at once. Rather than match nothing, treat it as
  // the any-of it meant and say so.
  if (tags.length > 1 && anyTags.length === 0) {
    const exclusive = tags.every((t) => /^\d{4}$/.test(t));
    if (exclusive) {
      dropped.push(`read "${tags.join(", ")}" as any one of them rather than all at once`);
      anyTags = tags;
      tags = [];
    }
  }

  // Losing one value out of several only narrows the scope, which is safe. Losing the last one
  // removes the whole condition, which widens it — that is what gets blocked.
  const emptied = (asked: string[], got: string[], what: string): void => {
    if (asked.some((v) => v.trim()) && got.length === 0) {
      blocked.push(`Nothing in the loaded files matches the ${what} it asked for (${asked.filter((v) => v.trim()).map((v) => `"${v.trim()}"`).join(", ")}). Running it without that would have changed far more than the instruction asked for.`);
    }
  };
  emptied(scope.vendors, vendors, "brand");
  emptied(scope.types, types.length + tags.length > 0 ? [...types, ...tags] : [], "category");
  emptied(scope.anyTags, anyTags, "tags");

  return {
    scope: {
      ...(vendors.length ? { vendors } : {}),
      ...(types.length ? { types } : {}),
      ...(tags.length ? { tags } : {}),
      ...(anyTags.length ? { anyTags } : {}),
      ...(excludeTags.length ? { excludeTags } : {}),
      ...(excludeVendors.length ? { excludeVendors } : {}),
      ...(handles.length ? { handles } : {}),
      ...(titleContains ? { titleContains } : {}),
    },
    dropped,
    blocked,
  };
}

/**
 * Read an instruction into a plan.
 *
 * Returns null only when there is no API key — the caller says so on screen rather than guessing
 * at what someone meant with a pile of regular expressions, which is how a price change becomes
 * the wrong price change.
 */
export async function planAdjustment(
  instruction: string,
  file: { products: number; vendors: string[]; types: string[]; tags: string[] },
): Promise<PlannedChange | null> {
  if (!planningAvailable() || !instruction.trim()) return null;

  const context = [
    `The file holds ${file.products} products.`,
    `Vendors in it: ${file.vendors.join(", ") || "(none)"}`,
    `Types in it: ${file.types.join(", ") || "(none)"}`,
    `Tags in it: ${file.tags.slice(0, 120).join(", ") || "(none)"}`,
    "",
    `Instruction: ${instruction.trim()}`,
  ].join("\n");

  const response = await getClient().messages.stream({
    model: EXTRACTION_MODEL,
    max_tokens: 2000,
    system: SYSTEM,
    output_config: { format: zodOutputFormat(PlanSchema), effort: "low" },
    messages: [{ role: "user", content: context }],
  }).finalMessage();

  const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
  if (!text) return null;
  const parsed = PlanSchema.safeParse(JSON.parse(text));
  if (!parsed.success) return null;

  const { scope, dropped, blocked } = groundScope(parsed.data.scope, file);
  const operations = blocked.length ? [] : parsed.data.operations.map(toOperation).filter((op): op is Operation => op !== null);
  const unclear = [parsed.data.unclear.trim(), ...dropped].filter(Boolean).join(" ");
  return { plan: { scope, operations }, understood: parsed.data.understood.trim(), unclear, blocked };
}

/** A plan in words, for the screen — built from the plan itself so it cannot describe something else. */
export function describePlan(plan: Plan): string[] {
  const lines: string[] = [];
  const s = plan.scope;
  const parts: string[] = [];
  if (s.vendors?.length) parts.push(`vendor is ${s.vendors.join(" or ")}`);
  if (s.types?.length) parts.push(`type is ${s.types.join(" or ")}`);
  if (s.tags?.length) parts.push(`tagged ${s.tags.join(" and ")}`);
  if (s.anyTags?.length) parts.push(`tagged any of ${s.anyTags.join(", ")}`);
  if (s.handles?.length) parts.push(`${s.handles.length} named product${s.handles.length === 1 ? "" : "s"}`);
  if (s.titleContains) parts.push(`the title contains "${s.titleContains}"`);
  const nots: string[] = [];
  if (s.excludeTags?.length) nots.push(`tagged ${s.excludeTags.join(" or ")}`);
  if (s.excludeVendors?.length) nots.push(`from ${s.excludeVendors.join(" or ")}`);
  lines.push(parts.length ? `Products where ${parts.join(", and ")}.` : "EVERY product in the file.");
  if (nots.length) lines.push(`Except anything ${nots.join(", or ")} — those are left alone.`);
  for (const op of plan.operations) {
    switch (op.kind) {
      case "discount":
        lines.push(op.from === "current"
          ? `Take ${op.percent}% off the current price.`
          : `Price at ${100 - op.percent}% of the recommended retail, and put the recommended retail in Compare At if it is not there already.`);
        break;
      case "endSale": lines.push("Put the price back to the recommended retail and clear Compare At."); break;
      case "setPrice": lines.push(`Set the price to ${op.value.toFixed(2)}.`); break;
      case "addTags": lines.push(`Add the tag${op.tags.length === 1 ? "" : "s"} ${op.tags.join(", ")}.`); break;
      case "removeTags": lines.push(`Remove the tag${op.tags.length === 1 ? "" : "s"} ${op.tags.join(", ")}.`); break;
      case "setStatus": lines.push(`Set the status to ${op.status}.`); break;
      case "setType": lines.push(`Set the type to ${op.value}.`); break;
      case "setVendor": lines.push(`Set the vendor to ${op.value}.`); break;
    }
  }
  return lines;
}

/**
 * Breaking a sheet of instructions into the separate changes it asks for.
 *
 * The changes for a season arrive as a document — a page from the buyer listing what goes on sale,
 * what moves to clearance, what comes off the site. That is many rules about many products, and
 * reading it as one instruction would produce one scope and one change, which is wrong for all of
 * them. So it is split first, and each piece goes through the same reading, preview and apply as
 * something typed by hand.
 *
 * Splitting is deliberately conservative: a line that is a heading, a date or a note to the reader
 * is not an instruction, and two changes to the same products are still two instructions, because
 * being able to see and undo them separately is the point.
 */
const SplitSchema = z.object({
  instructions: z.array(z.string()).describe("Each separate change the document asks for, one per entry, rewritten as a plain imperative sentence that stands on its own. Keep the document's own product names, brands, tags and numbers exactly."),
  ignored: z.array(z.string()).describe("Lines that are headings, dates, notes or anything else that is not a change to make. Short quotes, for the reader to check nothing was missed."),
  unclear: z.string().describe("Anything in the document you could not turn into a change. Empty when there was nothing."),
});

export interface SplitInstructions {
  instructions: string[];
  ignored: string[];
  unclear: string;
}

const SPLIT_SYSTEM = `You are reading a sheet of instructions from a ski shop's buyer. It lists the changes to make to products the shop already sells — what moves into clearance, what goes on sale and by how much, what comes off the site, what gets retagged.

Break it into the separate changes it asks for. One entry per change.

These sheets are a TABLE, one instruction per row, and the columns are always the same. Left to right:

1. YEAR TAG. The year tags a product must carry for the row to touch it: 2026, 2025, 2999, 2998. This is a hard filter and the most important cell in the row. One year means only that year. Several mean any one of them. Never widen it, never add a year the row does not name, and never let the year from the row above or below leak into this one — putting a 2027 ski into clearance because the row above said 2026 is the worst mistake you can make here.
2. CATEGORY. The Shopify product Type: "snow skis", "ski boots", "ski bindings", "snowboards", "snowboard boots", "snowboard bindings", "helmets", "gloves", "snow goggles", "ski poles". The cell sometimes adds which part of the category it means — "flat and package", "step on only", "midlayer", "ADULT", "KIDS" — and that stays in the sentence.
3. BRANDS OR MODELS. The extra narrowing, and the difference between the right hundred products and the wrong thousand. "Nitro", "anon", "POC", "Bent metal, RIDE", "except arcteryx", "Burton Genesis step on only". When it names brands or models the products must carry those ON TOP OF everything else in the row. A\\T, A/T and AT all mean the alpine touring tag, so "selected A\\T +selected look" means products carrying both the alpine touring tag and the look tag. "except X" rules X out and is never a reason to widen anything.
4. THE TAG COLUMN, headed with the month — "august clearance", "october clearance". It says which tag the row adds. It always reads "clearance", and it always means BOTH tags at once: clearance and snow clearance. Write every one of these as "add the clearance and snow clearance tags".
5. METAFIELD, a column of yes and no. IGNORE IT COMPLETELY. Never make an instruction out of it, never mention it, and never try to match its values back to rows — if the page's text arrives with that column detached from its rows, that is expected and it is not something to work out.

So a row reading "2025 | ski boots | | clearance | yes" is one instruction: "Add the clearance and snow clearance tags to ski boots tagged 2025."

IF A ROW STATES NO YEAR TAG, DO NOT TURN IT INTO AN INSTRUCTION. Put the row's own words in "ignored" followed by " — no year tag stated", so a person sees exactly what was left alone and can decide for themselves.

The rest:
- Rewrite each row as a plain imperative sentence that stands on its own, so it makes sense with none of the others.
- Keep the sheet's own wording for brands, product names, tags, years and numbers. Never round a number, never rename a brand, never tidy a tag.
- A row whose note says the work is already done ("ALREADY DONE", "ex demo skis already have clearance tag") is still an instruction. The page checks whether anything actually needs changing and says so.
- A heading, a date, a column header, a page number or a note to the reader is not an instruction. Put those in "ignored" so a person can check nothing was missed.
- Two changes to the same products are still two entries. A row naming several brands is one entry when it is one change, and several when the sheet gives each brand a different number.
- If part of the sheet asks for something you cannot express as a change to products, say so in "unclear" rather than guessing at it.

Never invent a change the sheet does not ask for, and never merge two different discounts into an average.`;

/**
 * Split a document into the separate instructions it contains.
 *
 * A PDF is passed through as a PDF rather than as the text pulled out of it, because these sheets
 * are tables and a text layer does not survive being one. The real sheet that exposed this is a
 * four-page grid — year tag, category, which brands, what to do, and a yes/no metafield column —
 * and pulling the text out returned all forty-odd rows first and then a loose run of "yes" and
 * "no" with nothing to attach them to. Read as a document the columns stay with their rows.
 */
export async function splitInstructions(input: string | { pdf: Buffer } | { image: Buffer; mediaType: string }): Promise<SplitInstructions | null> {
  if (!planningAvailable()) return null;
  let content: Anthropic.ContentBlockParam[];
  if (typeof input === "string") {
    if (!input.trim()) return null;
    content = [{ type: "text", text: input.slice(0, 60_000) }];
  } else if ("pdf" in input) {
    content = [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: input.pdf.toString("base64") } }];
  } else {
    content = [{ type: "image", source: { type: "base64", media_type: input.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: input.image.toString("base64") } }];
  }

  const response = await getClient().messages.stream({
    model: EXTRACTION_MODEL,
    max_tokens: 8000,
    system: SPLIT_SYSTEM,
    output_config: { format: zodOutputFormat(SplitSchema), effort: "low" },
    messages: [{ role: "user", content }],
  }).finalMessage();

  const body = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
  if (!body) return null;
  const parsed = SplitSchema.safeParse(JSON.parse(body));
  if (!parsed.success) return null;
  return {
    instructions: parsed.data.instructions.map((i) => i.trim()).filter(Boolean),
    ignored: parsed.data.ignored.map((i) => i.trim()).filter(Boolean),
    unclear: parsed.data.unclear.trim(),
  };
}

/**
 * Read a photographed or scanned instruction sheet.
 *
 * A buyer's list is as likely to arrive as a phone photo of a printed page as it is a proper PDF.
 * A scan has no text layer, so it is read as a picture and turned back into the words on it —
 * transcribed rather than interpreted, because the splitting that follows is where the meaning is
 * worked out, and two passes of interpretation compound their mistakes.
 */
export async function readInstructionImage(buffer: Buffer, mimeType: string): Promise<string> {
  if (!planningAvailable()) return "";
  const isPdf = mimeType === "application/pdf";
  const response = await getClient().messages.stream({
    model: EXTRACTION_MODEL,
    max_tokens: 4000,
    system: "Transcribe this document. Write out the text on it, in order, keeping every brand, product name, tag, year, percentage and price exactly as printed. Keep the line and list structure. Do not summarise, explain or reorder, and do not add anything that is not on the page. If part of it is handwritten, transcribe that too and mark it (handwritten).",
    messages: [{
      role: "user",
      content: [{
        type: isPdf ? "document" : "image",
        source: { type: "base64", media_type: isPdf ? "application/pdf" : (mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp"), data: buffer.toString("base64") },
      } as Anthropic.ContentBlockParam],
    }],
  }).finalMessage();
  return response.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
}
