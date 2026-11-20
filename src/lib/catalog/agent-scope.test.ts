import { describe, expect, it } from "vitest";
import { agentScopePrompt, cleanAgentMay, describeAgentMay, mayFix } from "./agent-scope";

describe("what the batch check may change", () => {
  it("defaults to everything and narrows field by field", () => {
    const may = cleanAgentMay({ title: false, drop: false, nonsense: true });
    expect(mayFix(may, "title")).toBe(false);
    expect(mayFix(may, "tags")).toBe(true);
    expect(mayFix(may, "nonsense")).toBe(false);
    expect(describeAgentMay(may)).toBe("After a build, the batch check may change its Type, its brand, its tags and its collections on its own; a product's name and dropping a product wait for a person.");
    expect(describeAgentMay(cleanAgentMay({}))).toBe("After a build, the batch check may change a product's name, its Type, its brand, its tags and its collections, and drop a product that should not have been built on its own.");
    expect(agentScopePrompt(cleanAgentMay({}))).toBe("");
    expect(agentScopePrompt(may)).toContain("a product's name and dropping a product");
  });
});
