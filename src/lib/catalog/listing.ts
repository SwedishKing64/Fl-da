/**
 * How a new product starts: as a draft, or live.
 *
 * Most shops want a built product to sit as a draft until someone has looked at it on the
 * store; some want it live the moment it is pushed. The shop's choice (`settings.newProductStatus`)
 * is put in force when the conventions load and read at build, so every product in a batch
 * starts the way the shop wants, and the push sends that status. Pure apart from the one value
 * in force.
 */

export type NewProductStatus = "draft" | "active";

export const DEFAULT_NEW_PRODUCT_STATUS: NewProductStatus = "draft";

export function cleanNewProductStatus(v: unknown): NewProductStatus {
  return v === "active" ? "active" : "draft";
}

let active: NewProductStatus = DEFAULT_NEW_PRODUCT_STATUS;

export function setNewProductStatus(status: NewProductStatus): void {
  active = status;
}

export function newProductStatus(): NewProductStatus {
  return active;
}

/** The setting as a sentence for Teach Snaben. */
export function describeNewProductStatus(status: NewProductStatus): string {
  return status === "active"
    ? "A new product is built live: it is on the store the moment it is pushed."
    : "A new product is built as a draft: nothing is on the store until someone publishes it there.";
}
