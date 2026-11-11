/**
 * What the Teach page shows of the snow trade: the shop's packages, read for package-words.ts to
 * put into sentences. Server only (it reads the database).
 */

import type { PackageTerms } from "../../types";
import { getBindingList } from "./binding-store";
import type { PackageTeaching } from "./package-words";

/** The shop's packages as the Teach page describes them: its binding list and its terms. */
export async function packagesForTeaching(terms: PackageTerms): Promise<PackageTeaching> {
  const list = await getBindingList().catch(() => null);
  return { offered: (list?.entries ?? []).map((e) => e.name), terms };
}
