/**
 * What a ski package costs and says beyond the ski and the binding: the shop's mounting charges
 * and the wording of the two fittings. Each shop sets its own on Settings; nothing is built in but
 * plain words and no charge. Kept in force process-wide alongside the rest of the shop's
 * conventions (shop-profile.ts loads them with the settings).
 */

import { DEFAULT_PACKAGE_TERMS, type PackageTerms } from "../../types";

let terms: PackageTerms = DEFAULT_PACKAGE_TERMS;

export function setPackageTerms(next: Partial<PackageTerms> | null | undefined): void {
  const n = next ?? {};
  terms = {
    drillMountFee: Math.max(0, Number(n.drillMountFee) || 0),
    systemMountFee: Math.max(0, Number(n.systemMountFee) || 0),
    fittingMount: String(n.fittingMount ?? "").trim() || DEFAULT_PACKAGE_TERMS.fittingMount,
    fittingNoMount: String(n.fittingNoMount ?? "").trim() || DEFAULT_PACKAGE_TERMS.fittingNoMount,
  };
}

export function packageTerms(): PackageTerms {
  return terms;
}
