import { describe, expect, it } from "vitest";
import { replacementsIn, wordDiff } from "./word-diff";

describe("words compared", () => {
  it("shows what stayed, went and came, in runs", () => {
    expect(wordDiff("a premium alpine jacket", "a technical alpine shell")).toEqual([
      { kind: "same", text: "a" }, { kind: "removed", text: "premium" }, { kind: "added", text: "technical" }, { kind: "same", text: "alpine" }, { kind: "removed", text: "jacket" }, { kind: "added", text: "shell" },
    ]);
    expect(wordDiff("same words", "same words")).toEqual([{ kind: "same", text: "same words" }]);
  });

  it("reads the words a person swapped, and not what they merely cut or added", () => {
    expect(replacementsIn("A premium jacket for the color-conscious, built tough.", "A technical jacket for the colour-conscious, built tough and light.")).toEqual([
      { from: "premium", to: "technical" }, { from: "color-conscious", to: "colour-conscious" },
    ]);
    expect(replacementsIn("Red jacket.", "Red Jacket.")).toEqual([]);
    expect(replacementsIn("one two three four five six", "something else entirely written again here now")).toEqual([]);
  });
});
