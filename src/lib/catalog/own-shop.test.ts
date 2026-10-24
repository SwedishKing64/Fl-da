import { describe, expect, it } from "vitest";
import { isOwnShop } from "./shop-profile";

describe("the shop's own name on its paperwork", () => {
  it("is recognised however the invoice prints it, so it is never the supplier or the brand", () => {
    for (const read of ["Alpsport", "ALPSPORT", "Alpsport Pty Ltd", "Alp-Sport", "alpsports"]) expect(isOwnShop(read, "Alpsport")).toBe(true);
    for (const read of ["Burton", "Burton Snowboards Pty Ltd", ""]) expect(isOwnShop(read, "Alpsport")).toBe(false);
  });

  it("does not mistake a brand for a shop whose name is short or unset", () => {
    expect(isOwnShop("Ski Trab", "Ski")).toBe(false);
    expect(isOwnShop("Ski", "Ski")).toBe(true);
    expect(isOwnShop("Burton", "")).toBe(false);
  });
});
