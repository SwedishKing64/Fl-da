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
}

const SYSTEM = `You turn an instruction from a ski shop's staff into edits to a Shopify product export.

The shop's rules, which you follow without being told:
- The recommended retail price lives in the Compare At column. Putting something "on sale", "on clearance" or "X% off" means the discount comes off the RECOMMENDED RETAIL, not off whatever the price happens to be today, so a product marked down twice does not compound. Use from: "rrp" unless the instruction plainly says otherwise.
- "Into clearance" or "on clearance" means a discount AND the clearance tag. If the instruction gives no percentage, do the tag only and say in "unclear" that no percentage was given.
- Tags are lower case. Use the spelling the file already uses when the file has something close.

How to read a list of values. "Items tagged 2999 or 2026 or 2025" is ANY ONE of them, so it goes in anyTags. The tags field means ALL AT ONCE, and no product carries five different years, so putting a list there matches nothing. Getting this backwards is the single worst thing you can do here.

How to read an exclusion. "Therefore items tagged 2027 should not be edited", "everything except the Oakleys", "but leave the 2027s alone" — that is excludeTags or excludeVendors. An exclusion is never a reason to widen the scope, and saying which things to leave out does not mean every other thing is in.

Only ever name a vendor, type or tag that appears in the list of what the file contains. If the instruction names something the file does not have, leave that field empty and say so in "unclear" — a scope that matches nothing is much better than one that matches everything.

If the instruction does not narrow the products at all, leave every scope field empty and say so in "unclear". Never invent a scope to make an instruction fit, and NEVER fall back to an empty scope because the right one was hard to express — an empty scope edits the whole shop. If you cannot express what was meant, return no operations at all and say why in "unclear".`;

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

/** Keep only the scope values the file really has, so a typo narrows to nothing rather than all. */
function groundScope(scope: z.infer<typeof ScopeSchema>, file: { vendors: string[]; types: string[]; tags: string[] }): { scope: Plan["scope"]; dropped: string[] } {
  const dropped: string[] = [];
  const keep = (wanted: string[], have: string[], what: string): string[] => {
    const out: string[] = [];
    for (const w of wanted) {
      const match = have.find((h) => h.toLowerCase() === w.trim().toLowerCase());
      if (match) out.push(match);
      else if (w.trim()) dropped.push(`${what} "${w.trim()}" is not in this file`);
    }
    return out;
  };
  const vendors = keep(scope.vendors, file.vendors, "vendor");
  const types = keep(scope.types, file.types, "type");
  let tags = keep(scope.tags, file.tags, "tag");
  let anyTags = keep(scope.anyTags, file.tags, "tag");
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

  const { scope, dropped } = groundScope(parsed.data.scope, file);
  const operations = parsed.data.operations.map(toOperation).filter((op): op is Operation => op !== null);
  const unclear = [parsed.data.unclear.trim(), ...dropped].filter(Boolean).join(" ");
  return { plan: { scope, operations }, understood: parsed.data.understood.trim(), unclear };
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
