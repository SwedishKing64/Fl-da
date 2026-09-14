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
  /** The menu leaf to file it under, for the sport asked about. */
  type: string;
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

/** File an accessory onto the right shelf for a sport. */
export function classifyAccessory(sport: Sport, ...parts: Array<string | undefined>): AccessoryVerdict {
  const kind = accessoryKind(...parts);
  // A kind with no shelf on this side — body protection on the ski side, poles on the snowboard
  // side — still has to go somewhere, and Other is where it goes.
  const type = LEAF[kind][sport] ?? LEAF.other[sport]!;
  return {
    kind,
    type,
    why: kind === "other" ? "no named shelf matched, so Other" : `reads as ${kind.replace("-", " ")}`,
    confident: kind !== "other",
  };
}

/**
 * Which sports an accessory serves. The shop's catalogue tags gloves, goggles, body protection,
 * bags and tuning into both sides — a glove does not care what is on your feet — while a pole is
 * ski-only and anything filed as Other stays with the sport it came from.
 */
export function sportsFor(kind: AccessoryKind, from: Sport): Sport[] {
  if (kind === "poles") return ["Ski"];
  if (kind === "other") return [from];
  return ["Ski", "Snowboard"];
}
