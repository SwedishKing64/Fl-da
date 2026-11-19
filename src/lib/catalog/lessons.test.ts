import { describe, expect, it } from "vitest";
import { decideLesson, lessonSentence, lessonsFromEdit, noteLessons, ripeLessons, wordReplacement, type Lesson } from "./lessons";

describe("a word replaced in a title", () => {
  it("is the one short span that changed", () => {
    expect(wordReplacement("Beta Jacket 2026", "Beta Shell 2026")).toEqual({ from: "Jacket", to: "Shell" });
    expect(wordReplacement("Beta AR Jacket Men's", "Beta AR Shell Men's")).toEqual({ from: "Jacket", to: "Shell" });
    // A word slipped in is not a word replaced.
    expect(wordReplacement("Men's Beta AR Jacket", "Men's Beta AR Shell Jacket")).toBeNull();
    expect(wordReplacement("Custom Longboard", "Custom")).toBeNull();
    expect(wordReplacement("Beta Jacket", "Alpha Shell Hooded Thing")).toBeNull();
    expect(wordReplacement("Beta jacket", "Beta Jacket")).toBeNull();
    expect(wordReplacement("Beta Jacket", "Beta Jacket")).toBeNull();
  });
});

describe("lessons from one edit", () => {
  const before = { title: "Beta Jacket 2026", tags: "Jackets, Sale, Alpine", vendor: "Arc'teryx", productType: "Jackets" };
  it("finds the word, the tags added and the tags removed", () => {
    expect(lessonsFromEdit(before, { title: "Beta Shell 2026" })).toEqual([{ kind: "title-word", from: "Jacket", to: "Shell", brand: "Arc'teryx", productType: "Jackets" }]);
    expect(lessonsFromEdit(before, { tags: "Jackets, Alpine, Gore-Tex" })).toEqual([
      { kind: "tag-added", from: "", to: "Gore-Tex", brand: "Arc'teryx", productType: "Jackets" },
      { kind: "tag-removed", from: "Sale", to: "", brand: "Arc'teryx", productType: "Jackets" },
    ]);
    expect(lessonsFromEdit(before, { bodyHtml: "<p>x</p>" } as never)).toEqual([]);
  });

  it("is counted, ripens at three, and is asked as a question until decided", () => {
    const edit = lessonsFromEdit(before, { title: "Beta Shell 2026" });
    let list: Lesson[] = noteLessons([], edit, "Beta Jacket 2026", new Date("2026-11-19T01:00:00Z"));
    list = noteLessons(list, lessonsFromEdit({ ...before, title: "Alpha jacket" }, { title: "Alpha Shell" }), "Alpha jacket");
    expect(list).toHaveLength(1);
    expect(list[0].count).toBe(2);
    expect(ripeLessons(list)).toEqual([]);
    list = noteLessons(list, edit, "Gamma Jacket");
    const ripe = ripeLessons(list);
    expect(ripe).toHaveLength(1);
    expect(lessonSentence(ripe[0])).toBe(`You replace "Jacket" with "Shell" in titles on Arc'teryx products, 3 times. Always?`);
    expect(ripe[0].examples).toEqual(["Beta Jacket 2026", "Alpha jacket", "Gamma Jacket"]);
    const decided = decideLesson(list, "title-word|jacket|shell|arc'teryx", "dismissed");
    expect(ripeLessons(decided)).toEqual([]);
    // Counted still, never asked again.
    expect(ripeLessons(noteLessons(decided, edit, "Delta"))).toEqual([]);
  });
});
