import { describe, expect, it } from "vitest";
import { cachedSystem, LIGHT_MODEL, READING_MODEL, WORKING_MODEL } from "./anthropic";

describe("the models by tier", () => {
  it("names three, the reading one strongest", () => {
    expect(READING_MODEL).toMatch(/opus/);
    expect(WORKING_MODEL).toMatch(/sonnet/);
    expect(LIGHT_MODEL).toMatch(/haiku/);
  });
  it("marks the fixed part of a prompt for keeping and puts what varies after it", () => {
    expect(cachedSystem("fixed")).toEqual([{ type: "text", text: "fixed", cache_control: { type: "ephemeral" } }]);
    expect(cachedSystem("fixed", " The shop is X. ")).toEqual([
      { type: "text", text: "fixed", cache_control: { type: "ephemeral" } },
      { type: "text", text: "The shop is X." },
    ]);
    expect(cachedSystem("fixed", "  ")).toHaveLength(1);
  });
});
