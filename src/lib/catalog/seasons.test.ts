import { describe, expect, it } from "vitest";
import { cleanSeasons, currentSeason, describeSeasons, seasonTag } from "./seasons";

describe("the shop's seasons", () => {
  const vocab = cleanSeasons({ seasons: [{ name: "Summer", starts: "11-01" }, { name: "Winter", starts: "05-01" }, { name: "Bad", starts: "13-40" }], tag: "{season} {yy}" });
  it("is cleaned and sorted by start", () => {
    expect(vocab.seasons).toEqual([{ name: "Winter", starts: "05-01" }, { name: "Summer", starts: "11-01" }]);
    expect(cleanSeasons(null)).toEqual({ seasons: [], tag: "{season} {year}" });
  });
  it("knows the season on a date, wrapping to last year's last season", () => {
    expect(currentSeason(vocab, new Date(2026, 6, 15))).toEqual({ name: "Winter", year: 2026 });
    expect(currentSeason(vocab, new Date(2026, 11, 1))).toEqual({ name: "Summer", year: 2026 });
    expect(currentSeason(vocab, new Date(2027, 1, 10))).toEqual({ name: "Summer", year: 2026 });
    expect(seasonTag(vocab, new Date(2027, 1, 10))).toBe("Summer 26");
    expect(seasonTag(cleanSeasons({ seasons: vocab.seasons }), new Date(2026, 6, 15))).toBe("Winter 2026");
    expect(seasonTag(cleanSeasons({}), new Date())).toBe("");
  });
  it("says itself", () => {
    expect(describeSeasons(vocab, new Date(2026, 6, 15))).toBe("The seasons are Winter from 1 May, Summer from 1 November; it is Winter 26 now, and that is the tag a product on a seasonal shelf carries.");
  });
});
