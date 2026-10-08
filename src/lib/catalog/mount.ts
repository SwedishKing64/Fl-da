/**
 * Which bindings mount on a track and which have to be drilled.
 *
 * The shop charges to fit a binding, and charges differently for the two kinds. A SYSTEM binding
 * comes with the ski and clicks onto a rail the factory put there — Rossignol's Xpress and NX
 * Konect, Look's Lowride, Head's PR, JRS, Joy and SLR, Tyrolia's PR and PRD, Atomic's M 10/M 12,
 * C 5, L 6 and Colt, Salomon's Z10/Z12, M11 and L10, Fischer's RS, Blizzard and Nordica's TPX/TPC
 * and TP2, Elan's EL, ELX and EMX, Marker's FDT track, K2's M3 Quikclik, Head's Evo for juniors —
 * no holes, a few minutes' work. Everything else — Marker's Griffon, Squire, Strive and Jester,
 * Look's Pivot and SPX, Tyrolia's Attack, every touring binding (ATK, Fritschi, Shift, Kingpin,
 * Duke, Alpinist) — is a DRILL mount: the ski is drilled for it, which is the dearer job.
 *
 * Told by the binding's name, as the shop writes it in the package's Binding Option or its title.
 * Anything it cannot place is taken as a drill mount, which is what nearly everything is.
 *
 * The numbers are matched whole ("NX 10" is "nx" and then "10", not "nx 1" with a "0" after it),
 * and a plain letter-and-number only where that letter is a binding family: "C 5 GW" and "L 6 GW"
 * are Atomic's junior rail bindings, "M 12 GW" and "MI 12 GW" Atomic's, "M11" Salomon's.
 *
 * The binding's own name is believed before the package's title: a Pivot sold on a ski whose title
 * names the NX it usually comes with is still drilled. And a name that is plainly a drill-mount
 * family — a touring binding, a Pivot, a Griffon — is a drill mount whatever else it says, since
 * "Vipec Evo 12" is not Head's Evo and "Alpinist" on an "XP 120" ski is not an Xpress.
 */
const SYSTEM_BINDING = new RegExp(
  "\\b(" +
    [
      // Rossignol, Look, Dynastar
      "xpress", "xp\\s?(w\\s?)?1[01]", "xp\\s?jr\\s?\\d+", "nx\\s?\\d+", "konect", "lowride",
      // Head, Tyrolia
      "freeflex", "slr", "joy\\s?\\d+", "evo\\s?\\d+", "jrs", "pr[dw]?\\s?\\d+", "protector", "tpx", "tpc", "tcx",
      // Atomic, Salomon
      "z\\s?1[0-3]", "mi?\\s?1[0-2](\\s?gw)?", "c\\s?\\d+\\s?gw", "l\\s?\\d+\\s?gw", "colt\\s?\\d+",
      // Fischer
      "rs\\s?\\d+",
      // Nordica, Blizzard
      "tp2",
      // Elan
      "el\\s?\\d+(\\.\\d+)?", "elx", "elw", "emx", "fusionx", "fx\\s?emx",
      // Marker's track, K2's
      "fdt", "m3\\s?\\d+", "quikclik", "quickclick",
      // Völkl
      "vmotion",
    ].join("|") +
    ")\\b",
  "i",
);

/** A name that is a drill mount whatever else it says. Konect is the one rail SPX. */
const DRILL_BINDING = /\b(atk|fritschi|vipec|tecton|raider|crest|dynafit|rottefella|nnn\w*|xplore|alpinist|kingpin|duke|pivot|griffon|squire|strive|jester|warden|attack|spx\s?\d*|rockerace|mnc|s\/lab|shift\s?2|kid\s?\d+|comp\s?j)\b/i;

function place(name: string): boolean | null {
  if (!name.trim()) return null;
  if (/konect/i.test(name)) return true;
  if (DRILL_BINDING.test(name)) return false;
  if (SYSTEM_BINDING.test(name)) return true;
  return null;
}

/** Whether a name alone says system binding. The binding's name, or the package's title. */
export function isSystemBinding(name: string): boolean {
  return place(name) === true;
}

/**
 * Whether a package is on a system binding, told first by its Binding Option and only then, when
 * that says nothing either way, by its title.
 */
export function isSystemMount(binding: string, title: string): boolean {
  return place(binding) ?? place(title) ?? false;
}
