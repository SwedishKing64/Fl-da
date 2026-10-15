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
import { retailer } from "./shop-profile";
import { anthropicClient, cachedSystem, LIGHT_MODEL, WORKING_MODEL, aiAvailable } from "./anthropic";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import type { Operation, Plan } from "./adjust";
import { describeApiError, isTransient, retrying } from "./api-errors";

const ScopeSchema = z.object({
  vendors: z.array(z.string()).describe("Vendor names exactly as the file spells them. Empty unless the instruction names a brand."),
  types: z.array(z.string()).describe("Shopify Type values exactly as the file spells them. Empty unless the instruction names one."),
  tags: z.array(z.string()).describe("Tags the product must ALL carry at once, exactly as the file spells them. Use this only for 'X and Y'. Empty otherwise."),
  anyTags: z.array(z.string()).describe("Tags where carrying ANY ONE is enough. This is what a list means: 'items tagged 2024 or 2025 or 2999' goes here, never in tags. Empty otherwise."),
  excludeTags: z.array(z.string()).describe("Tags that rule a product out however well it matches. 'but not the 2027s', 'except anything tagged clearance'. Empty otherwise."),
  excludeVendors: z.array(z.string()).describe("Vendors ruled out the same way. Empty otherwise."),
  handles: z.array(z.string()).describe("Exact product handles, when the instruction lists specific products. Otherwise empty."),
  titleContains: z.string().describe("A word from the product title to match on, when nothing else narrows it. Empty otherwise."),
  fitting: z.enum(["flat", "package", ""]).describe("For skis and snowboards only: \"flat\" for the ones sold WITHOUT a binding, \"package\" for the ones sold WITH one. Empty unless the instruction says which."),
});

const OperationSchema = z.object({
  kind: z.enum(["discount", "endSale", "setPrice", "addTags", "removeTags", "setStatus", "setType", "setVendor", "setQuantity", "setTitleYear", "renameTitle", "setMountPrice", "setCost", "changeCost"]),
  percent: z.number().nullable().describe("For discount: the percentage off, 1-95. For changeCost: the percentage the cost moves by, positive up and negative down, e.g. 5 or -10. Null otherwise."),
  from: z.enum(["rrp", "current"]).nullable().describe("For discount: 'rrp' (the default, off the recommended retail in Compare At) or 'current' only when the instruction plainly means off today's price."),
  value: z.number().nullable().describe("For setPrice: the new price. For setQuantity: the stock on hand. For setMountPrice: the mounting charge in dollars, e.g. 59. For setCost: the cost per item in dollars. Null otherwise."),
  raiseOnly: z.boolean().describe("For setMountPrice only: true only when the instruction says to ONLY increase, never lower — 'at least $59', 'raise any that are under $59', 'don't lower any'. False when it says the difference should be $59, is going up to $59, or is now $59: then every package is set to that difference, up or down. False otherwise."),
  bindings: z.enum(["drill", "system", ""]).describe("For setMountPrice only: \"drill\" when the instruction means the packages whose binding is drilled onto the ski (touring bindings, Griffon, Squire, Strive, Jester, Pivot, Attack, SPX — 'bindings that need a drill mount', 'flat bindings', 'flat drill mount bindings'); \"system\" when it means skis that come with a binding on a track (Xpress, NX Konect, PR, Joy SLR, M 12, Z12, RS, TPX — 'skis that come with a binding', 'system bindings', 'track bindings', 'integrated bindings'); empty when it means every package. Empty otherwise."),
  bindingNames: z.array(z.string()).describe("For setMountPrice only: the binding models the instruction names, one per entry, spelled as it spells them — 'including Marker FDT 7, M7.0, SPX 15, NX7' is [\"Marker FDT 7\", \"M7.0\", \"SPX 15\", \"NX7\"]. Packages on these bindings are always included, whichever kind they would otherwise count as. Names of bindings never go in the scope. Empty otherwise."),
  tags: z.array(z.string()).describe("For addTags/removeTags: the tags, spelled as this shop spells them. Empty otherwise."),
  status: z.enum(["active", "draft", "archived"]).nullable().describe("For setStatus. Null otherwise."),
  text: z.string().describe("For setType/setVendor: the new value. For setTitleYear: the four-digit season, e.g. \"2027\". For renameTitle: the wording to put IN. Empty otherwise."),
  find: z.string().describe("For renameTitle only: the wording in the title to replace. Empty otherwise."),
  seo: z.boolean().describe("For setTitleYear/renameTitle: true when the SEO title should get the same edit. Set it when the instruction mentions the SEO title, the search title, or says both. False otherwise."),
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
  /** The product group this change belongs to, as the loaded files spell it. Empty when it names none. */
  category: string;
}

/** What differs by shop, after each fixed prompt so the fixed prompt is the same bytes for every shop. */
const SHOP = () => `The shop is ${retailer()}.`;

const SYSTEM = `You turn an instruction from a shop's staff into edits to a Shopify product export.

The shop's rules, which you follow without being told:
- The recommended retail price lives in the Compare At column. Putting something "on sale", "on clearance" or "X% off" means the discount comes off the RECOMMENDED RETAIL, not off whatever the price happens to be today, so a product marked down twice does not compound. Use from: "rrp" unless the instruction plainly says otherwise.
- "Into clearance" or "on clearance" means a discount AND the clearance tag. If the instruction gives no percentage, do the tag only and say in "unclear" that no percentage was given. An instruction that plainly says which tags to ADD is exactly that and nothing more: do the tags, add no discount, and leave "unclear" empty — it is not missing a percentage.
- Tags are lower case. A tag to ADD is spelled exactly as the instruction spells it — never change its letters to match something in the file, because the file can contain typos and copying one spreads it. The only change allowed is spacing and hyphens: if the instruction says "snow sale" and the file writes "snow-sale", use "snow-sale".
- A season in the product title is setTitleYear: put the four digits in "text" and nothing else. The page works out where in the title it goes. Use renameTitle only for wording that is not a year. Neither one changes a product's URL, and nothing here ever edits a Handle. If the instruction also names the SEO title, the search title, or says "and the SEO title" or "both", set seo: true on that operation — one operation covers both columns, never two.
- "Put the price back to the RRP", "bring it to RRP", "price them at the recommended retail", "take them off sale", "remove the discount", "back to full price" all mean endSale: the price returns to the recommended retail in Compare At and Compare At clears. Use it whenever the instruction says to price at the RRP WITHOUT giving a number. setPrice is only for an instruction that states an actual figure.
- "Set the stock to 0", "mark them out of stock", "we have 12 left" is setQuantity. Stock is per variant, so it applies to every length or size the scope matched.
- The COST (also "cost per item", "cost price", "wholesale", "what we pay", "buy price") is what the shop pays, never the selling price. "Set the cost to $450", "cost per item is 450" is setCost with value 450. "Costs are up 5%", "wholesale went up 3.5%", "cost price down 10%" is changeCost with percent 5, 3.5 or -10. Neither touches the price or the Compare At; a cost change is not a discount and not setPrice.
- A ski or snowboard is sold two ways and the shop prices them separately: FLAT means the ski on its own, PACKAGE means the ski with a binding on it. When an instruction says flat, "flat only", "no bindings", "ski only", "board only", set fitting: "flat". When it says package, "pakage" (they misspell it), "package only", "with bindings", "inc bindings", "binding package", set fitting: "package". When it says "flat and package", or says neither, leave fitting empty — that means both. This matters more than it looks: their sale sheet has "2027 snow skis flat 15%" on one line and "2027 snow skis package 20%" on the next, and without it each line takes in the other's products and whichever runs second sets the price of both.

- The MOUNTING charge (also "mount price", "fitting price", "binding fitting", "fitting charge") is what a package's "Please Mount My Bindings" variant costs over its "Please Do Not Mount My Bindings" variant. "Increase the mount price to $59", "mounting is now $59", "please mount should be $59 more than do not mount" is setMountPrice with value 59 and fitting: "package" — ALWAYS "package", because only a package has the two options; the word "flat" in a mounting instruction describes the BINDING (sold flat, so it is drilled on), never the ski, so "flat bindings", "flat drill mount bindings", "all flat bindings" is bindings: "drill" with fitting: "package", not fitting: "flat". Which packages: "skis with touring bindings / Griffon / Squire / Strive / SPX / flat bindings / bindings that need a drill mount" is bindings: "drill"; "skis that come with a binding / system bindings / integrated bindings / track bindings / Xpress" is bindings: "system"; neither said means every package. When the instruction names binding models — "including Marker FDT 7, M7.0, SPX 15, NX7, Freeflex 11" — put each one in bindingNames exactly as written; those packages are included on top of the kind, and the names never go in the scope (not titleContains, not tags). An instruction like this is complete and clear: return the operation and leave "unclear" empty. Two different charges for the two kinds are two setMountPrice operations. The difference is set to the amount, up or down — a package charging $60 comes to $59 — unless the instruction says to only increase or never lower (raiseOnly: true). It is not a discount and not setPrice.

How to read a list of values. "Items tagged 2999 or 2026 or 2025" is ANY ONE of them, so it goes in anyTags. The tags field means ALL AT ONCE, and no product carries five different years, so putting a list there matches nothing. Getting this backwards is the single worst thing you can do here.

How to read an exclusion. "Therefore items tagged 2027 should not be edited", "everything except the Oakleys", "but leave the 2027s alone" — that is excludeTags or excludeVendors. An exclusion is never a reason to widen the scope, and saying which things to leave out does not mean every other thing is in.

Only ever name a vendor, type or tag that appears in the list of what the file contains. If the instruction names something the file does not have, leave that field empty and say so in "unclear" — a scope that matches nothing is much better than one that matches everything.

If the instruction does not narrow the products at all, leave every scope field empty and say so in "unclear". Never invent a scope to make an instruction fit, and NEVER fall back to an empty scope because the right one was hard to express — an empty scope edits the whole shop. If you cannot express the SCOPE, return no operations and say why in "unclear".

"The products you just edited", "the ones you just added", "those products", "the delivery", "them" — said right after a delivery was applied on this page — means the products just touched, which the context lists by handle. Put exactly those handles in scope.handles and nothing in the other scope fields; the change then applies to them and to nothing else. If the context lists no such products, return no operations and say in "unclear" that nothing has been edited on this page yet.

That last rule is about the scope and nothing else. When the instruction says plainly what to do — add a tag, take 30% off — always return that operation. Whether it turns out to change anything is not your decision: the products it matches may already be that way, and the page works that out for itself and says so.`;

/**
 * More patience than the SDK's default of two retries.
 *
 * A season's sheet is seventy rows, each its own call. Two quick retries is not enough to ride out
 * the API saying it is overloaded, and a row that gives up is a row that silently is not applied —
 * which is what "things were missing" turned out to be. The SDK backs off exponentially and honours
 * the server's retry-after, so more attempts cost time on a bad minute and nothing on a good one.
 */
const getClient = (): Anthropic => anthropicClient(6);

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
    case "setQuantity": return typeof raw.value === "number" && raw.value >= 0 ? { kind: "setQuantity", value: raw.value } : null;
    case "setCost": return typeof raw.value === "number" && raw.value >= 0 ? { kind: "setCost", value: raw.value } : null;
    case "changeCost": return typeof raw.percent === "number" && raw.percent !== 0 && raw.percent > -100 ? { kind: "changeCost", percent: raw.percent } : null;
    // A year is four digits or it is nothing. A title edit is the one change here that a person
    // cannot check at a glance across 500 products, so a half-read instruction is dropped.
    case "setTitleYear": return /^\d{4}$/.test(raw.text.trim()) ? { kind: "setTitleYear", year: raw.text.trim(), ...(raw.seo ? { seo: true } : {}) } : null;
    case "renameTitle": return raw.find.trim() ? { kind: "renameTitle", find: raw.find.trim(), replace: raw.text, ...(raw.seo ? { seo: true } : {}) } : null;
    case "setMountPrice": return typeof raw.value === "number" && raw.value > 0 && raw.value < 1000
      ? { kind: "setMountPrice", amount: raw.value, ...(raw.bindings === "drill" || raw.bindings === "system" ? { bindings: raw.bindings } : {}), ...(named(raw.bindingNames).length ? { named: named(raw.bindingNames) } : {}), ...(raw.raiseOnly ? { raiseOnly: true } : {}) }
      : null;
  }
}

/** The binding models an instruction names, trimmed and de-duplicated. */
function named(names: string[]): string[] {
  return [...new Set(names.map((n) => n.trim()).filter(Boolean))];
}

/**
 * A tag to add is spelled the way the person spelled it.
 *
 * Asked for "snow sale", the page added "snwo sale", every time. Nothing in the code has that
 * typo; the loaded export did — a product or two somebody once tagged by hand — and the reader was
 * told to prefer the file's spelling "when the file has something close". So it found something
 * close, and copied the typo onto every product in the shop. A catalogue's typo is not a spelling.
 *
 * The prompt now says so, and this makes it so whatever the reader does. Each tag it wants to add
 * is compared with the instruction's own words: a tag the instruction does not contain, but that
 * is within two letters of a run of words it does, is put back to the instruction's spelling. The
 * one change still allowed is spacing and hyphens — "snow sale" asked for, "snow-sale" in the file
 * — because that is the same word written the shop's way, which is why the rule existed at all.
 */
export function respellAddedTags(operations: Operation[], instruction: string, fileTags: string[]): Operation[] {
  const words = instruction.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/[\s,]+/).filter(Boolean);
  const loose = (value: string) => value.toLowerCase().replace(/[-_\s]+/g, " ").trim();
  const runs = new Set<string>();
  for (let i = 0; i < words.length; i++) {
    for (let n = 1; n <= 4 && i + n <= words.length; n++) runs.add(loose(words.slice(i, i + n).join(" ")));
  }
  const byLoose = new Map(fileTags.map((t) => [loose(t), t]));

  const fix = (tag: string): string => {
    const want = loose(tag);
    if (runs.has(want)) return tag;                                  // the instruction's own word
    // Same number of words, at most two letters apart: a respelling, not a different tag.
    const size = want.split(" ").length;
    const said = [...runs].find((r) => r.split(" ").length === size && editDistance(r, want) <= 2);
    if (!said) return tag;
    // Written the shop's way where the shop writes the same word with a hyphen.
    return byLoose.get(said) ?? said;
  };

  return operations.map((op) =>
    op.kind === "addTags" ? { ...op, tags: [...new Set(op.tags.map(fix))] } : op,
  );
}

/** Letters to change, add or remove to turn one string into the other. */
function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;                   // too far apart to matter here
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const was = row[j];
      // Two neighbouring letters swapped — "snwo" for "snow" — is two changes here, inside the limit.
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = was;
    }
  }
  return row[b.length];
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
): { scope: Plan["scope"]; dropped: string[]; blocked: string[]; category: string } {
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

  /**
   * A brands cell holds BRANDS, plural, and the sheet writes them with nothing between them.
   *
   * "Dalbello Head" is two brands and "Atomic Lange" is two more, and matched whole against the
   * vendor list they are neither — so the whole condition emptied and the row was blocked. Which is
   * safe and useless: the rule was written for two brands and applied to none.
   *
   * Splitting on spaces alone is worse than not splitting, because a brand can BE two words:
   * "Helly Hansen", "Black Crows", "Backcountry Access", "One Planet" — seven of this shop's
   * thirty-eight vendors have a space in them. So the longest run of words that is a real vendor
   * wins, left to right, and a word that starts no vendor is passed over. "helly hansen mens only"
   * is Helly Hansen; "black crows" is Black Crows and not Black Diamond; "Dalbello Head" is both.
   *
   * Nothing here can invent a brand: a run is kept only if the loaded file HAS that vendor, and a
   * cell where none of it matches still empties the field and still blocks the instruction.
   */
  const vendorsIn = (value: string, have: string[]): string[] => {
    const words = norm(value).split(" ").filter(Boolean);
    const byName = new Map(have.map((h) => [norm(h), h]));
    const found: string[] = [];
    // Four words is past the longest vendor this shop has and well past any it is likely to get.
    const LONGEST = 4;
    for (let i = 0; i < words.length;) {
      let took = 0;
      for (let n = Math.min(words.length - i, LONGEST); n >= 1; n--) {
        const hit = byName.get(words.slice(i, i + n).join(" "));
        if (!hit) continue;
        if (!found.includes(hit)) found.push(hit);
        took = n;
        break;
      }
      i += took || 1;
    }
    return found;
  };

  const keepVendors = (wanted: string[], have: string[]): string[] => {
    const out: string[] = [];
    for (const w of wanted) {
      if (!w.trim()) continue;
      const whole = have.find((h) => norm(h) === norm(w));
      if (whole) { if (!out.includes(whole)) out.push(whole); continue; }
      const found = vendorsIn(w, have);
      if (found.length === 0) { dropped.push(`vendor "${w.trim()}" is not in this file`); continue; }
      for (const f of found) if (!out.includes(f)) out.push(f);
      // Said out loud, and it says the rest was passed over rather than leaving that to be noticed:
      // "Dalbello Head" comes back as Head alone when the boots export is not one of the loaded
      // files, and that reads like the sheet was understood unless it says what it left behind.
      const rest = norm(w).split(" ").filter(Boolean).length - found.reduce((n, f) => n + norm(f).split(" ").length, 0);
      dropped.push(
        `read "${w.trim()}" as ${found.length === 1 ? "the brand" : "the brands"} ${found.join(" and ")}`
        + (rest > 0 ? ` — the rest of it matches no brand in the loaded files` : ""),
      );
    }
    return out;
  };

  const vendors = keepVendors(scope.vendors, file.vendors);
  let tags = keep(scope.tags, file.tags, "tag");
  let anyTags = keep(scope.anyTags, file.tags, "tag");

  // The category column of a buyer's sheet names a shelf in the shop's menu, and this shop keeps
  // some of those shelves in Type and others in tags — "Snowboard Bindings" is a Type, "ski-helmets"
  // is a tag, and the sheet spells both the same way. So a category that is not a Type is looked
  // for among the tags before it is given up on.
  const types: string[] = [];
  let category = "";
  for (const wanted of scope.types) {
    if (!wanted.trim()) continue;
    const asType = file.types.find((t) => norm(t) === norm(wanted));
    if (asType) { types.push(asType); category ||= asType; continue; }
    const asTag = file.tags.find((t) => norm(t) === norm(wanted));
    if (asTag) { tags.push(asTag); category ||= asTag; dropped.push(`matched "${wanted.trim()}" on the tag rather than the type`); continue; }
    dropped.push(`type "${wanted.trim()}" is not in this file`);
  }

  // An exclusion the file has never heard of is harmless — it simply excludes nothing — so it is
  // kept rather than dropped, and never reported as a problem.
  const excludeTags = scope.excludeTags.map((t) => t.trim()).filter(Boolean);
  // Same reading for an exclusion — "but not Dalbello Head" leaves out both — except that a brand
  // the file has never heard of is kept rather than dropped: it simply excludes nothing.
  const excludeVendors = scope.excludeVendors
    .map((v) => v.trim())
    .filter(Boolean)
    .flatMap((v) => (file.vendors.some((h) => norm(h) === norm(v)) ? [v] : vendorsIn(v, file.vendors).length > 0 ? vendorsIn(v, file.vendors) : [v]));
  const handles = scope.handles.map((h) => h.trim()).filter(Boolean);
  const titleContains = scope.titleContains.trim();
  const fitting = scope.fitting === "flat" || scope.fitting === "package" ? scope.fitting : undefined;

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
      ...(fitting ? { fitting } : {}),
    },
    dropped,
    blocked,
    category,
  };
}

/**
 * Read an instruction into a plan.
 *
 * Returns null only when there is no API key — the caller says so on screen rather than guessing
 * at what someone meant with a pile of regular expressions, which is how a price change becomes
 * the wrong price change.
 */
/** What was just done on the page, so "the products you just edited" has something to mean. */
export interface Recent { what: string; handles: string[] }

export async function planAdjustment(
  instruction: string,
  file: { products: number; vendors: string[]; types: string[]; tags: string[]; recent?: Recent | null },
): Promise<PlannedChange | null> {
  if (!planningAvailable() || !instruction.trim()) return null;

  const recent = file.recent && file.recent.handles.length > 0 ? file.recent : null;
  const context = [
    `The file holds ${file.products} products.`,
    `Vendors in it: ${file.vendors.join(", ") || "(none)"}`,
    `Types in it: ${file.types.join(", ") || "(none)"}`,
    `Tags in it: ${file.tags.slice(0, 400).join(", ") || "(none)"}`,
    recent
      ? `Products just touched on this page (${recent.what}), ${recent.handles.length} of them, by handle: ${recent.handles.slice(0, 400).join(", ")}`
      : "Nothing has been edited on this page yet.",
    "",
    `Instruction: ${instruction.trim()}`,
  ].join("\n");

  const response = await retrying(() => getClient().messages.stream({
    model: WORKING_MODEL,
    max_tokens: 32_000,
    system: cachedSystem(SYSTEM, SHOP()),
    output_config: { format: zodOutputFormat(PlanSchema), effort: "low" },
    messages: [{ role: "user", content: context }],
  }).finalMessage());

  const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
  if (!text) return null;
  const parsed = PlanSchema.safeParse(JSON.parse(text));
  if (!parsed.success) return null;

  const { scope, dropped, blocked, category } = groundScope(parsed.data.scope, file);
  const operations = blocked.length ? [] : respellAddedTags(parsed.data.operations.map(toOperation).filter((op): op is Operation => op !== null), instruction, file.tags);
  const unclear = [parsed.data.unclear.trim(), ...dropped].filter(Boolean).join(" ");
  return { plan: { scope: withPackages(scope, operations), operations }, understood: parsed.data.understood.trim(), unclear, blocked, category };
}

/**
 * A mounting charge lives on packages, so a plan that sets one is scoped to them whatever the
 * reader made of the scope. "All flat drill mount bindings" read as fitting: "flat" matched no
 * package and did nothing; the "flat" there is the binding, not the ski.
 */
export function withPackages(scope: Plan["scope"], operations: Operation[]): Plan["scope"] {
  return operations.some((op) => op.kind === "setMountPrice") ? { ...scope, fitting: "package" } : scope;
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
  if (s.fitting) parts.push(s.fitting === "flat" ? "sold flat, with no binding on it" : "sold as a package, with a binding on it");
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
      case "setQuantity": lines.push(`Set the stock on hand to ${Math.round(op.value)}.`); break;
      case "setCost": lines.push(`Set the cost per item to $${op.value.toFixed(2)} on every variant.`); break;
      case "changeCost": lines.push(`${op.percent > 0 ? "Put the cost per item up" : "Bring the cost per item down"} by ${Math.abs(op.percent)}% on every variant that has one. The price is not touched.`); break;
      case "setMountPrice": {
        const kind = op.bindings === "drill" ? " on packages whose binding is drilled on (Griffon, Squire, Strive, Pivot, Attack, SPX, every touring binding)" : op.bindings === "system" ? " on skis that come with a track binding (Xpress, NX Konect, PR, Joy SLR, M 12, Z12, RS, TPX)" : op.named?.length ? "" : " on every package";
        const names = op.named?.length ? `${kind ? ", and on any package" : " on packages"} whose binding is ${op.named.join(", ")}` : "";
        lines.push(`Set the mounting charge to $${op.amount.toFixed(2)}${kind}${names}: each "Please Mount My Bindings" variant is priced that much over its "Do Not Mount" twin — the recommended retail by the full amount, the price by the same share, so a sale stays the sale it was.${op.raiseOnly ? " A package already charging that or more keeps its charge." : " A package charging more comes down to it."}`);
        break;
      }
      case "setTitleYear": lines.push(`Put ${op.year} in the product title${op.seo ? " and the SEO title" : ""} — replacing the season already there, or in front of the length and binding wording where there is none. The URL does not change.`); break;
      case "renameTitle": {
        const where = `the product title${op.seo ? " and the SEO title" : ""}`;
        lines.push(op.replace.trim()
          ? `In ${where}, replace "${op.find}" with "${op.replace}". The URL does not change.`
          : `Remove "${op.find}" from ${where}. The URL does not change.`);
        break;
      }
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

const SPLIT_SYSTEM = `You are reading a sheet of instructions from the shop's buyer. It lists the changes to make to products the shop already sells — what moves into clearance, what goes on sale and by how much, what comes off the site, what gets retagged.

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

  const response = await retrying(() => getClient().messages.stream({
    model: WORKING_MODEL,
    max_tokens: 32_000,
    system: cachedSystem(SPLIT_SYSTEM, SHOP()),
    output_config: { format: zodOutputFormat(SplitSchema), effort: "low" },
    messages: [{ role: "user", content }],
  }).finalMessage());

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
  const response = await retrying(() => getClient().messages.stream({
    model: WORKING_MODEL,
    max_tokens: 32_000,
    output_config: { effort: "low" },
    system: "Transcribe this document. Write out the text on it, in order, keeping every brand, product name, tag, year, percentage and price exactly as printed. Keep the line and list structure. Do not summarise, explain or reorder, and do not add anything that is not on the page. If part of it is handwritten, transcribe that too and mark it (handwritten).",
    messages: [{
      role: "user",
      content: [{
        type: isPdf ? "document" : "image",
        source: { type: "base64", media_type: isPdf ? "application/pdf" : (mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp"), data: buffer.toString("base64") },
      } as Anthropic.ContentBlockParam],
    }],
  }).finalMessage());
  return response.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
}

/**
 * Which of a sheet's instructions could touch the files that are actually loaded.
 *
 * A season's sheet covers the whole shop — skis, boots, bindings, helmets, goggles — and a Shopify
 * export is usually one corner of it. Loading the goggles export and being walked through the ski
 * rows one at a time is most of the work of doing it by hand, so the sheet and the files are read
 * against each other first and the rows that cannot match are set aside.
 *
 * This is one call for the whole sheet rather than one per row, because it is a matching question,
 * not a planning question: the answer for every row comes out of the same two lists.
 *
 * Nothing is thrown away. A row set aside is shown with the reason, so loading the missing export
 * brings it straight back.
 */
const ScreenSchema = z.object({
  items: z.array(z.object({
    index: z.number().describe("The number of the instruction, exactly as it was given."),
    group: z.string().describe("The product group this instruction is about, in the words the loaded files use: a Type or a tag from the lists. Empty if it names none."),
    relevant: z.boolean().describe("True if any product in the loaded files could possibly match this instruction."),
    why: z.string().describe("For an instruction that cannot match, the one thing that is missing: 'no ski bindings in the loaded files'. Empty when it is relevant."),
  })),
});

export interface Screened {
  instruction: string;
  index: number;
  group: string;
  relevant: boolean;
  why: string;
}

const SCREEN_SYSTEM = `You are matching a sheet of seasonal changes from a shop against the Shopify exports they have actually loaded.

For each numbered instruction, say whether any product in those exports could possibly match it.

Judge it on the product group and the brand, and nothing else:
- The group an instruction names must exist in the loaded files, either as a Type or as a tag. This shop keeps some shelves in Type ("Snowboard Bindings") and others in tags ("ski-helmets", "goggles", "ski poles"), and spells them with spaces where a tag uses hyphens — "snow goggles" and "goggles", "ski helmets" and "ski-helmets", "snowboard bindings" and "snowboard-bindings" are the same shelf. Match across that.
- If the group is nowhere in either list, the instruction is not relevant. Say so in "why" naming the group: "no ski bindings in the loaded files".
- If the instruction names a brand and that brand is in neither the vendor list nor the tags, it is not relevant either.
- Always fill in "group" with the word the loaded files use, so rows about the same shelf can be worked through together. Where the files have both a Type and a tag for it, use the Type.

Two things are NOT reasons to call something irrelevant. Whether the products are already tagged the way the instruction asks — that is worked out later against the file itself, and a row that turns out to be already done is still a row that matched. And a year tag: a year that is not in the file simply matches no products, which is a normal, safe outcome, so judge only the group and the brand.

When you cannot tell, say relevant. A row shown and skipped costs a moment; a row hidden is work that silently does not happen.`;

export async function screenInstructions(
  instructions: string[],
  file: { vendors: string[]; types: string[]; tags: string[] },
): Promise<Screened[]> {
  const all = instructions.map((instruction, index) => ({ instruction, index, group: "", relevant: true, why: "" }));
  if (!planningAvailable() || all.length === 0) return all;

  const context = [
    `Types in the loaded files: ${file.types.join(", ") || "(none)"}`,
    `Vendors in them: ${file.vendors.join(", ") || "(none)"}`,
    `Tags in them: ${file.tags.slice(0, 400).join(", ") || "(none)"}`,
    "",
    "The instructions:",
    ...instructions.map((line, i) => `${i}. ${line}`),
  ].join("\n");

  /**
   * The screen is an optimisation, so it is never allowed to be the reason nothing happens.
   *
   * It is ONE call over the whole sheet, made before any row is planned, and when the service was
   * overloaded it threw — which failed the entire sheet with the API's JSON on screen, before the
   * row-by-row retries below had a chance to run. Without it every row is simply treated as
   * relevant, which is safe: each is still grounded against the loaded files, and a row about
   * goggles planned against a ski export matches nothing and says so.
   */
  let response: Anthropic.Message;
  try {
    response = await retrying(() => getClient().messages.stream({
      model: LIGHT_MODEL,
      max_tokens: 32_000,
      system: cachedSystem(SCREEN_SYSTEM, SHOP()),
      output_config: { format: zodOutputFormat(ScreenSchema), effort: "low" },
      messages: [{ role: "user", content: context }],
    }).finalMessage());
  } catch (err) {
    if (!isTransient(err)) throw err;
    for (const row of all) row.why = "not sorted by shelf — the reading service was busy, so every row was kept";
    return all;
  }

  const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
  if (!text) return all;
  const parsed = ScreenSchema.safeParse(JSON.parse(text));
  if (!parsed.success) return all;

  // A row the screen forgot to mention stays in. Silence is not a decision to leave work out.
  for (const item of parsed.data.items) {
    const row = all[item.index];
    if (!row) continue;
    row.group = item.group.trim();
    row.relevant = item.relevant;
    row.why = item.why.trim();
  }
  return all;
}

/**
 * Read many instructions at once.
 *
 * Next dispatches server actions one at a time per client, so a sheet planned a row at a time from
 * the browser is a queue of round trips however fast each one is — forty of them is most of an
 * afternoon. The whole sheet is read in one action instead, several at a time inside it, which is
 * the difference between forty waits and one.
 */
/**
 * Run a job per item, a few at a time, keeping the order of the answers.
 *
 * A failure belongs to its own item. One row of a forty-row sheet that cannot be read is one row
 * reported on its own line, not a sheet that failed.
 */
export async function mapWithConcurrency<In, Out>(
  items: In[],
  limit: number,
  job: (item: In, index: number) => Promise<Out>,
  onError: (err: unknown, item: In, index: number) => Out,
): Promise<Out[]> {
  const out = new Array<Out>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      try {
        out[i] = await job(items[i], i);
      } catch (err) {
        out[i] = onError(err, items[i], i);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}

/**
 * Read many instructions at once.
 *
 * Next dispatches server actions one at a time per client, so a sheet planned a row at a time from
 * the browser is a queue of round trips however fast each one is — forty of them is most of an
 * afternoon, which is the whole of the time this page was meant to save. The sheet is read inside
 * one action instead, several rows at a time, which is the difference between forty waits and one.
 */
export async function planAdjustments(
  instructions: string[],
  file: { products: number; vendors: string[]; types: string[]; tags: string[] },
  concurrency = 4,
): Promise<Array<{ instruction: string; planned: PlannedChange | null; failed: string }>> {
  const one = async (instruction: string) => {
    const planned = await planAdjustment(instruction, file);
    return planned
      ? { instruction, planned, failed: "" }
      : { instruction, planned: null, failed: "Could not make sense of this one." };
  };
  // Which rows the SERVICE turned away, as opposed to rows it could not make sense of — classified
  // from the typed error while it is still an error, not guessed at from its text afterwards.
  const turnedAway = new Set<number>();
  const failure = (err: unknown, instruction: string, index: number) => {
    if (isTransient(err)) turnedAway.add(index);
    return { instruction, planned: null, failed: describeApiError(err) ?? (err instanceof Error ? err.message : String(err)) };
  };

  // Four at a time rather than eight: eight was a burst the API answered with "overloaded" on a
  // big sheet, and a row that fails there is a row that is quietly not applied.
  const first = await mapWithConcurrency(instructions, concurrency, one, failure);

  // Then one more pass over whatever the service itself refused, ONE AT A TIME, after a pause.
  // A refusal for load is about the moment, not the row. A row it could not understand is not
  // retried: asking again would get the same answer.
  if (turnedAway.size > 0) await new Promise((resolve) => setTimeout(resolve, RETRY_PAUSE_MS));
  for (const i of [...turnedAway]) {
    turnedAway.delete(i);
    try { first[i] = await one(instructions[i]); } catch (err) { first[i] = failure(err, instructions[i], i); }
  }
  return first;
}

/**
 * How long to let an overloaded service recover before the second pass.
 *
 * Long enough to be past a burst, short enough that the whole sheet still finishes inside the
 * time the page gives one request.
 */
const RETRY_PAUSE_MS = 8_000;
