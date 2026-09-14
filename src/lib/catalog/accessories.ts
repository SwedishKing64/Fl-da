/**
 * Filing an accessory.
 *
 * The two sports keep parallel but differently named shelves. A snowboard helmet is filed under
 * "Helmets" and a ski helmet under "Ski Helmets"; gloves are "Gloves" on one side and "Ski Gloves"
 * on the other. Two shelves exist on one side only: body protection is snowboard-side, ski poles
 * are ski-side. So the kind of thing an accessory is has to be worked out first, and only then
 * turned into a name, which is what the two steps here do.
 *
 * Anything that is not one of the named shelves lands in "Other", which is where the shop's stomp
 * pads, tools, locks, laces and replacement hardware all live.
 */

export type AccessoryKind =
  | "goggles" | "helmets" | "gloves" | "body-protection" | "bags" | "tuning" | "poles" | "other";

export type Sport = "Ski" | "Snowboard";

export interface AccessoryVerdict {
  kind: AccessoryKind;
  /**
   * The Shopify Type: the accessories heading, not the shelf. An accessory is the one place the
   * catalogue keeps the heading as the Type — a glove is "Ski Accessories" and the shelf it lands
   * on rides along as a tag.
   */
  type: string;
  /** The shelf tag: ski-gloves, body protection, snowboard-bags, other snowboard accessories. */
  shelf: string;
  why: string;
  /** False when nothing matched and it fell through to Other. */
  confident: boolean;
}

const SIGNALS: Array<{ kind: AccessoryKind; test: RegExp }> = [
  { kind: "goggles", test: /\bgoggles?\b|\blens(es)?\b/i },
  { kind: "helmets", test: /\bhelmets?\b/i },
  { kind: "body-protection", test: /\bimpact\b|\bwrist ?guard|\bknee ?pad|\bbody ?armou?r|\bback ?protect|\bcrash ?pad|\bpadded short/i },
  { kind: "gloves", test: /\bgloves?\b|\bmitten?s?\b|\bmitts?\b/i },
  { kind: "bags", test: /\bbags?\b|\bsleeve\b|\bsack\b|\bwheelie\b|\bluggage\b/i },
  { kind: "tuning", test: /\btuning\b|\bwax\b|\bscraper\b|\bedge tool\b|\bfile\b|\bsharpen|\bdetun/i },
  { kind: "poles", test: /\bpoles?\b/i },
];

/** The shelf each kind lands on, per sport. Undefined where that sport has no such shelf. */
const LEAF: Record<AccessoryKind, Partial<Record<Sport, string>>> = {
  goggles: { Ski: "Goggles", Snowboard: "Goggles" },
  helmets: { Ski: "Ski Helmets", Snowboard: "Helmets" },
  gloves: { Ski: "Ski Gloves", Snowboard: "Gloves" },
  "body-protection": { Snowboard: "Body Protection" },
  bags: { Ski: "Ski & Boot Bags", Snowboard: "Snowboard Bags" },
  tuning: { Ski: "Ski Tuning", Snowboard: "Snowboard Tuning" },
  poles: { Ski: "Ski Poles" },
  other: { Ski: "Other Ski Accessories", Snowboard: "Other Snowboard Accessories" },
};

/** What kind of accessory this is, read from its name and description. */
export function accessoryKind(...parts: Array<string | undefined>): AccessoryKind {
  const text = parts.filter(Boolean).join(" ");
  // Body protection is tested before gloves on purpose: a wrist guard is protection, not a glove.
  for (const { kind, test } of SIGNALS) if (test.test(text)) return kind;
  return "other";
}

/**
 * The kinds that genuinely serve both sports. A glove, a goggle, a helmet and a tin of wax do not
 * care what is on your feet, and the catalogue files all of them on the ski side whatever the
 * brand. Everything else is tied to its sport: a board bag, a stomp pad and a pair of impact
 * shorts are snowboard things, and poles are a ski thing.
 */
const SHARED = new Set<AccessoryKind>(["goggles", "helmets", "gloves", "tuning"]);

export function sportsFor(kind: AccessoryKind, from: Sport): Sport[] {
  if (kind === "poles") return ["Ski"];
  return SHARED.has(kind) ? ["Ski", "Snowboard"] : [from];
}

/**
 * File an accessory: which accessories heading it belongs to, and which shelf within it.
 *
 * The heading follows what the thing serves rather than which brand made it. Gloves, goggles,
 * helmets and tuning work for either sport, and the catalogue files all of them under Ski
 * Accessories — Burton gloves included. Only what is snowboard-specific, a stomp pad or a board
 * bag or impact shorts, sits under Snowboard Accessories.
 */
export function classifyAccessory(sport: Sport, ...parts: Array<string | undefined>): AccessoryVerdict {
  const kind = accessoryKind(...parts);
  const serves = sportsFor(kind, sport);
  // Serves both -> the ski heading; snowboard-only -> the snowboard heading.
  const heading: Sport = serves.length > 1 ? "Ski" : serves[0];
  const shelf = LEAF[kind][heading] ?? LEAF.other[heading]!;
  return {
    kind,
    type: heading === "Ski" ? "Ski Accessories" : "Snowboard Accessories",
    shelf,
    why: kind === "other" ? "no named shelf matched, so Other" : `reads as ${kind.replace("-", " ")}`,
    confident: kind !== "other",
  };
}

