import { describe, expect, it } from "vitest";
import { writeOutColour } from "./colour";

describe("a two-tone colour written out from the sheet's own full names", () => {
  const names = ["RUM RAISIN", "CHINCHILLA GRAY", "NIGHTSHADE PURPLE", "TRUE BLACK", "AIRSTREAM BLUE", "GREEN VOLTAGE", "GRAY", "GRAY HEATHER"];
  it("writes out each part it can place on exactly one name, and leaves the rest as written", () => {
    expect(writeOutColour("RUMRSN/CHLGRY", names)).toBe("Rum Raisin / Chinchilla Gray");
    expect(writeOutColour("NTSHPR/PRPVLT", names)).toBe("Nightshade Purple / Prpvlt");
    expect(writeOutColour("TRUBLK/DRDMSS", names)).toBe("True Black / Drdmss");
    expect(writeOutColour("TRUBLK/DRDMSS", names)).toBe("True Black / Drdmss");
    expect(writeOutColour("BLACK/WHITE", names)).toBe("Black / White");
  });
  it("writes a goggle's colour as the frame, then the lens as the sheet writes it", () => {
    expect(writeOutColour("BLACK/PRCV SUN ONYX", names, true)).toBe("Black w/ Prcv Sun Onyx");
    expect(writeOutColour("ARSTBL/PRCV VRBL BLUE", names, true)).toBe("Arstbl w/ Prcv Vrbl Blue");
    expect(writeOutColour("WHITE/PRCV SUN ONYX", names, true)).toBe("White w/ Prcv Sun Onyx");
    expect(writeOutColour("BLACK", names, true)).toBe("Black");
  });

  it("leaves a plain colour to colourName", () => {
    expect(writeOutColour("TRUE BLACK", names)).toBe("True Black");
    expect(writeOutColour("627 BRIGHT BLUE", names)).toBe("Bright Blue");
  });
});
