import { describe, expect, it } from "vitest";
import { expandShorthand } from "./shorthand";

describe("a supplier's shorthand, written out", () => {
  it("reads Burton's trailing SO as Step On, once", () => {
    expect(expandShorthand("STEP ON SO")).toBe("STEP ON");
    expect(expandShorthand("HIGHSHOT SO")).toBe("HIGHSHOT STEP ON");
    expect(expandShorthand("GENESIS SO")).toBe("GENESIS STEP ON");
    expect(expandShorthand("HIGHSHOT XPRO SO")).toBe("HIGHSHOT X PRO STEP ON");
  });

  it("writes out the trade's garment shorthand", () => {
    expect(expandShorthand("WKND MWT 2PK SK")).toBe("WEEKEND MIDWEIGHT 2 PACK SOCKS");
    expect(expandShorthand("GORE DELUXE GL")).toBe("GORE DELUXE GLOVES");
    expect(expandShorthand("AK GORE CYCLC JK")).toBe("AK GORE CYCLC JACKET");
    expect(expandShorthand("RSRV STRCH INS JK")).toBe("RESERVE STRETCH INSULATED JACKET");
    expect(expandShorthand("EMBER FLC NCKWMR")).toBe("EMBER FLEECE NECK WARMER");
  });

  it("leaves a name a person wrote, and whole words, alone", () => {
    expect(expandShorthand("Men's Step On Re:Flex")).toBe("Men's Step On Re:Flex");
    expect(expandShorthand("SOFT SAGE PT")).toBe("SOFT SAGE PANTS");
    expect(expandShorthand("M7 MANTRA")).toBe("M7 MANTRA");
  });
});
