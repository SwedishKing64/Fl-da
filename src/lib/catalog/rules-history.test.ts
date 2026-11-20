import { describe, expect, it } from "vitest";
import { KEEP, pushSnapshot, type RulesSnapshot } from "./rules-history";
import { RULES_FILE_KIND } from "./rules-file";

describe("the rules before each change", () => {
  it("keeps the newest first and no more than ten", () => {
    const file = { kind: RULES_FILE_KIND, version: 1, shop: "S", exportedAt: "" } as const;
    let h: RulesSnapshot[] = [];
    for (let i = 0; i < 12; i++) h = pushSnapshot(h, { label: `change ${i}`, file }, new Date(2026, 10, 20, 0, i));
    expect(h).toHaveLength(KEEP);
    expect(h[0].label).toBe("change 11");
    expect(h[KEEP - 1].label).toBe("change 2");
    expect(new Set(h.map((e) => e.id)).size).toBe(KEEP);
  });
});
