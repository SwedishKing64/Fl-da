import { describe, expect, it } from "vitest";
import { writeOutColour } from "./colour";

describe("a two-tone colour written out from the sheet's own full names", () => {
  const names = ["RUM RAISIN", "CHINCHILLA GRAY", "NIGHTSHADE PURPLE", "TRUE BLACK", "AIRSTREAM BLUE", "GREEN VOLTAGE", "GRAY", "GRAY HEATHER"];
  it("writes out each part it can place on exactly one name, and leaves the rest as written", () => {
    expect(writeOutColour("RUMRSN/CHLGRY", names)).toBe("Rum Raisin / Chinchilla Gray");
    expect(writeOutColour("NTSHPR/PRPVLT", names)).toBe("Nightshade Purple / Prpvlt");
    expect(writeOutColour("TRUBLK/DRDMSS", names)).toBe("True Black / Drdmss");
    expect(writeOutColour("ARSTBL/PRCV SUN ONYX", names)).toBe("Airstream Blue / Prcv Sun Onyx");
    expect(writeOutColour("BLACK/WHITE", names)).toBe("Black / White");
  });
  it("leaves a plain colour to colourName", () => {
    expect(writeOutColour("TRUE BLACK", names)).toBe("True Black");
    expect(writeOutColour("627 BRIGHT BLUE", names)).toBe("Bright Blue");
  });
});
