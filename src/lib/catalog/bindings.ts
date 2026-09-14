/**
 * Telling an alpine binding from a touring one.
 *
 * The difference is mechanical: an alpine binding holds the heel down and releases only in a fall,
 * which is what you want on a lift-served mountain. A touring binding frees the heel and pivots at
 * the toe so you can walk uphill, then locks down to ski. Hybrids — Shift, Duke PT, Kingpin,
 * Tecton — do both, and are bought by people who tour, so they file as touring.
 *
 * This reads the product's own words rather than guessing from the category, and says when it is
 * not sure. A touring binding filed onto the alpine page is not a cosmetic error: someone buys a
 * binding that will not do what they need it to.
 */

export type BindingKind = "Alpine Bindings" | "Touring Bindings";

/**
 * Snowboard bindings split a different way. Nothing about walking uphill comes into it: a Step On
 * binding takes only Step On boots, and everything else — Re:Flex, EST, channel, disc — takes an
 * ordinary boot, so it is traditional. This is the same question the boots answer from the other
 * side, and the two have to agree or a customer ends up with a boot and binding that do not meet.
 */
export type SnowboardBindingTag = "step-on-bindings" | "traditional-bindings";

const STEP_ON = /\bstep[\s-]?on\b/i;

export function classifySnowboardBinding(...parts: Array<string | undefined>): {
  tag: SnowboardBindingTag;
  why: string;
} {
  const text = parts.filter(Boolean).join(" ");
  return STEP_ON.test(text)
    ? { tag: "step-on-bindings", why: "says Step On" }
    : { tag: "traditional-bindings", why: "not a Step On binding, so it takes an ordinary boot" };
}

export interface BindingVerdict {
  kind?: BindingKind;
  /** What in the text decided it, so a person can check the reasoning rather than the outcome. */
  why: string;
  /** False when nothing in the text settled it, or the signals disagreed. Send those for review. */
  confident: boolean;
}

/** Words and model names that only appear on bindings you can walk uphill in. */
const TOURING = [
  "touring", "tour ", "randonn", "skimo", "alpine touring", " at binding", "at binding",
  "tech binding", "pin binding", "low tech", "backcountry", "splitboard", "uphill", "walk mode",
  // Makers who only build touring bindings
  "dynafit", "atk ", "plum ", "fritschi",
  // Models, including the hybrids that tour and ski
  "alpinist", "kingpin", "duke pt", "shift", "tecton", "vipec", "backland", "superlite",
  "speed radical", "speed turn", "haute route", "helio", "tlt", "rotation",
];

/** Words and model names that only appear on bindings for lift-served skiing. */
const ALPINE = [
  "alpine binding", "downhill", "resort", "din ", "system binding", "race binding",
  "grip walk", "gripwalk",
  "griffon", "squire", "jester", "pivot", "spx", "warden", "strive", "attack", "protector",
  "xpress", "tyrolia", "z12", "z10", "nx 12",
];

const hits = (text: string, needles: string[]): string[] => needles.filter((n) => text.includes(n));

/**
 * Decide from a product's title, description and any supplier category text.
 * Pass everything you have: the more words, the better the call.
 */
export function classifyBinding(...parts: Array<string | undefined>): BindingVerdict {
  const text = ` ${parts.filter(Boolean).join(" ").toLowerCase()} `;
  const touring = hits(text, TOURING);
  const alpine = hits(text, ALPINE);

  if (touring.length && !alpine.length) {
    return { kind: "Touring Bindings", why: `mentions ${touring.slice(0, 3).join(", ")}`, confident: true };
  }
  if (alpine.length && !touring.length) {
    return { kind: "Alpine Bindings", why: `mentions ${alpine.slice(0, 3).join(", ")}`, confident: true };
  }
  if (touring.length && alpine.length) {
    // A hybrid reads as both. It tours, so it files as touring — but say so, because a person
    // may want it on the alpine page instead.
    return {
      kind: "Touring Bindings",
      why: `reads as both (${touring[0]} and ${alpine[0]}) — likely a hybrid, filed as touring`,
      confident: false,
    };
  }
  return { kind: undefined, why: "nothing in the text says whether the heel frees for walking", confident: false };
}
