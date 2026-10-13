import { describe, expect, it } from "vitest";
import { fitWithin, fitsUpload, readableSize, MAX_EDGE } from "./image-size";

describe("fitting a picture inside what will actually be read", () => {
  it("scales the long edge down to 1568 and keeps the shape", () => {
    // A phone screenshot, portrait.
    expect(fitWithin(1290, 2796)).toEqual({ width: 723, height: MAX_EDGE });
    // A scan, landscape.
    expect(fitWithin(4032, 3024)).toEqual({ width: MAX_EDGE, height: 1176 });
  });

  it("leaves anything already small alone rather than scaling it up", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1568, 1000)).toEqual({ width: 1568, height: 1000 });
  });

  it("never rounds a dimension away to nothing", () => {
    expect(fitWithin(10000, 3).height).toBe(1);
  });

  it("survives a zero, rather than dividing by it", () => {
    expect(fitWithin(0, 0)).toEqual({ width: 0, height: 0 });
  });

  it("knows what will not fit in a request body", () => {
    expect(fitsUpload(2 * 1024 * 1024)).toBe(true);
    expect(fitsUpload(6 * 1024 * 1024)).toBe(false);
    expect(readableSize(6 * 1024 * 1024)).toBe("6.0MB");
    expect(readableSize(40 * 1024)).toBe("40KB");
  });
});
