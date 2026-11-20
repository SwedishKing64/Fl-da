import { describe, expect, it } from "vitest";
import { batchListing, describeOp, onlyKnown, Op } from "./batch-chat";
import type { ReviewProduct } from "./review-types";

const product = (id: string, over: Partial<ReviewProduct> = {}): ReviewProduct => ({
  id, handle: id, title: `Talon ${id}`, bodyHtml: "", vendor: "Osprey", productType: "Backpacks", category: "other", tags: "Hiking, Packs", collections: "", status: "draft", published: false, seoTitle: "", seoDescription: "",
  lookupStatus: "NONE", lookupSource: "", option1Name: null, option2Name: null, option3Name: null, metafields: {}, reconcileStatus: "NEW", shopifyProductId: null, matchCandidates: [], matchDecided: false,
  images: [], variants: [], flags: [], confidence: { title: 1, tags: 1, image: 1, price: 1, lowest: 1 } as never, ...over,
});

describe("asking the batch", () => {
  it("lists one product per line as the model sees it", () => {
    const line = batchListing([product("p1", { variants: [{ retailPrice: 199 } as never, { retailPrice: 249 } as never], flags: [{ code: "NO_IMAGE", severity: "warning", message: "" }] })]);
    expect(line).toBe("p1 | Talon p1 | Osprey | Backpacks | tags: Hiking, Packs | draft | 2 variants | $199–249 | 0 pics | NO_IMAGE");
  });

  it("keeps only the products the batch has", () => {
    const steps = onlyKnown([
      { sentence: "Tag two", op: { kind: "retag", productIds: ["p1", "ghost"], add: ["Sale"], remove: [] } },
      { sentence: "Drop a ghost", op: { kind: "drop", productIds: ["ghost"] } },
      { sentence: "Rename", op: { kind: "retitle", productId: "p2", title: "Talon 22" } },
    ], new Set(["p1", "p2"]));
    expect(steps).toHaveLength(2);
    expect(steps[0].op).toEqual({ kind: "retag", productIds: ["p1"], add: ["Sale"], remove: [] });
  });

  it("says each step as a sentence and refuses a shape it does not know", () => {
    expect(describeOp({ kind: "retag", productIds: ["a", "b"], add: ["Hiking"], remove: ["Sale"] })).toBe("Tag 2 products Hiking; take Sale off 2 products.");
    expect(describeOp({ kind: "drop", productIds: ["a"] })).toBe("Drop 1 product from the batch.");
    expect(Op.safeParse({ kind: "delete-batch" }).success).toBe(false);
    expect(Op.safeParse({ kind: "set-status", productIds: ["a"], status: "archived" }).success).toBe(false);
  });
});
