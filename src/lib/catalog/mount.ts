/**
 * Which bindings mount on a track and which have to be drilled.
 *
 * The shop charges to fit a binding, and charges differently for the two kinds. A SYSTEM binding
 * comes with the ski and clicks onto a rail the factory put there — Rossignol's Xpress and NX
 * Konect, Head's PR and Joy SLR, Tyrolia's PR, Atomic's M 10/M 12, Salomon's Z10/Z12, Fischer's
 * RS, Blizzard and Nordica's TPX/TPC, Elan's EL, Head's Evo for juniors — no holes, a few
 * minutes' work. Everything else
 * — Marker's Griffon, Squire, Strive and Jester, Look's Pivot and SPX, Tyrolia's Attack, every
 * touring binding (ATK, Fritschi, Shift, Kingpin, Duke, Alpinist) — is a DRILL mount: the ski is
 * drilled for it, which is the dearer job.
 *
 * Told by the binding's name, as the shop writes it in the package's Binding Option or its title.
 * Anything it cannot place is taken as a drill mount, which is what nearly everything is.
 */
const SYSTEM_BINDING = /\b(xpress|xp\s?1\d|nx\s?\d|konect|freeflex|slr|joy\s?\d|evo\s?\d|pr\s?1\d|prd\s?\d|prw\s?\d|protector|z\s?1[02]\b|m\s?1[02]\s?gw|rs\s?1[01]|tpx|tpc|tcx|el\s?1[0-9]|elw|vmotion)\b/i;

export function isSystemBinding(name: string): boolean {
  return SYSTEM_BINDING.test(name);
}
