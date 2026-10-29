/**
 * What Teach Flöda says about ski packages: the bindings the shop offers and its terms, in
 * sentences. Here rather than in teaching.ts so the snow trade's words stay in its pack. Pure:
 * the page reads the list (binding-store.ts `packagesForTeaching`) and hands it in.
 */

import type { PackageTerms } from "../../types";

export interface PackageTeaching {
  /** The bindings on the shop's list, by name. */
  offered: string[];
  terms: PackageTerms;
}

const andList = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

export function describeOffered(p: PackageTeaching): string {
  if (!p.offered.length) return "No bindings to package skis with yet: every ski is built flat until you list some.";
  return `A new ski can be packaged with ${andList(p.offered.slice(0, 6))}${p.offered.length > 6 ? ` and ${p.offered.length - 6} more` : ""}; you pick which under each ski, and a ski with none picked has no package.`;
}

export function describeTerms(p: PackageTeaching): string {
  const t = p.terms;
  const charge = t.drillMountFee || t.systemMountFee ? `$${t.drillMountFee} for a drill mount and $${t.systemMountFee} for a system binding` : "nothing";
  return `A package's fittings are "${t.fittingNoMount}" and "${t.fittingMount}"; mounting adds ${charge} to the retail.`;
}
