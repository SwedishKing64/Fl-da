/**
 * Boot tags.
 *
 * Ski boots and snowboard boots both use the word BOA, and it means different things.
 *
 * On a **ski** boot, BOA versus buckle is how the boot closes, and the shop tags which.
 * On a **snowboard** boot it is not the closure that matters but the binding: Step On boots clip
 * into Step On bindings and nothing else, so everything that is not Step On — BOA, lace, speed
 * lace alike — is "traditional". The shop's own catalogue is unambiguous on this: every BOA
 * snowboard boot it sells is tagged traditional-boots.
 *
 * Getting that backwards would put BOA snowboard boots on the Step On page, where the one thing a
 * buyer needs to know is which bindings the boot will clip into.
 */

export type SnowboardBootTag = "step-on-boots" | "traditional-boots";

/** Discipline first, then closure. A boot can be several at once. */
export const SKI_BOOT_TAGS = ["alpine-boots", "race-boots", "touring-boots", "buckle-ski-boots", "boa-ski-boots"] as const;
export type SkiBootTag = (typeof SKI_BOOT_TAGS)[number];

export interface BootVerdict<T> {
  tags: T[];
  why: string;
  confident: boolean;
}

const STEP_ON = /\bstep[\s-]?on\b/i;

/**
 * A snowboard boot is Step On or it is traditional. Closure does not enter into it.
 */
export function classifySnowboardBoot(...parts: Array<string | undefined>): BootVerdict<SnowboardBootTag> {
  const text = parts.filter(Boolean).join(" ");
  if (STEP_ON.test(text)) {
    return { tags: ["step-on-boots"], why: "says Step On", confident: true };
  }
  const closure = /\bboa\b/i.test(text) ? "BOA" : /\bspeed\s?zone\b|\blace\b/i.test(text) ? "laces" : "";
  return {
    tags: ["traditional-boots"],
    // Worth spelling out, because BOA reads like a category of its own and is not one here.
    why: closure ? `${closure}, which takes ordinary bindings` : "not a Step On boot",
    confident: true,
  };
}

const SKI_SIGNALS: Array<{ tag: SkiBootTag; test: RegExp; label: string }> = [
  { tag: "race-boots", test: /\brace\b|\bworld ?cup\b|\bredster\b|\bdobermann\b|\bfischer rc4\b/i, label: "race" },
  { tag: "touring-boots", test: /\btouring\b|\btour\b|\bat boot\b|\bwalk mode\b|\btech fitting\b|\bpin insert\b|\bhike\b|\bbackland\b|\bzero ?g\b|\bhawx ultra xtd\b|\bxtd\b|\bmaestrale\b|\bf1\b|\btlt\b|\bhoji\b/i, label: "touring" },
  { tag: "boa-ski-boots", test: /\bboa\b/i, label: "BOA closure" },
];

/**
 * Boots that ski the resort and tour, and are sold as both. They carry the alpine and the touring
 * tag together rather than being forced onto one shelf — a Cochise belongs on both, and a customer
 * shopping either page should find it.
 */
const HYBRID_BOOTS = /\bcochise\b|\blupo\b|\bmtn lab\b|\bmtn explore\b|\bshift pro\b|\bxt3\b|\bmindbender\b|\bkore\b|\bstrider\b|\bunlimited\b|\branger\b|\b4-?quattro\b|\balltrack\b|\bcosmos\b|\btranslator\b/i;

export function isHybridBoot(text: string): boolean {
  return HYBRID_BOOTS.test(text);
}

/**
 * Ski boots carry what they are for and how they close, and can carry several at once —
 * a touring boot with a BOA dial is both.
 */
export function classifySkiBoot(...parts: Array<string | undefined>): BootVerdict<SkiBootTag> {
  const text = parts.filter(Boolean).join(" ");
  const tags: SkiBootTag[] = [];
  const why: string[] = [];

  for (const { tag, test, label } of SKI_SIGNALS) {
    if (test.test(text)) {
      tags.push(tag);
      why.push(label);
    }
  }

  // A hybrid is both, and is sold as both.
  const hybrid = isHybridBoot(text);
  if (hybrid && !tags.includes("touring-boots")) {
    tags.push("touring-boots");
    why.push("a hybrid that tours");
  }

  // Alpine is the default discipline: a boot that is not for racing or touring is a resort boot.
  // A hybrid gets it too, on top of touring, because it genuinely skis the resort.
  const hasDiscipline = tags.some((t) => t === "race-boots" || t === "touring-boots");
  if (!hasDiscipline || hybrid) {
    tags.unshift("alpine-boots");
    why.unshift(hybrid ? "a hybrid, so a resort boot as well" : "neither race nor touring, so a resort boot");
  }

  // Closure is a two-way choice, so anything not BOA closes with buckles.
  if (!tags.includes("boa-ski-boots")) {
    tags.push("buckle-ski-boots");
    why.push("no BOA, so buckles");
  }

  return { tags, why: why.join("; "), confident: hasDiscipline || hybrid || /\balpine\b|\bresort\b|\ball.?mountain\b/i.test(text) };
}
