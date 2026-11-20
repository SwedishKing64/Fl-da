import { describe, expect, it } from "vitest";
import { applyShelves, cleanShelves, describeShelves } from "./shelves";

const shelves = cleanShelves([
  { name: "Packs", kind: "tag", becomes: "Backpacks" },
  { name: "Daypacks", kind: "tag", becomes: "Backpacks" },
  { name: "Trail shoes", kind: "tag", under: "Footwear" },
  { name: "Footwear", kind: "tag", under: "Gear" },
  { name: "Rain jackets", kind: "tag", seasonal: true },
  { name: "Sale", kind: "collection", becomes: "Outlet" },
  { name: "Nothing", kind: "tag" },
  { name: "Same", kind: "tag", becomes: "same" },
]);

describe("the shop's shelves", () => {
  it("keeps only shelves that change something", () => {
    expect(shelves.map((s) => s.name)).toEqual(["Packs", "Daypacks", "Trail shoes", "Footwear", "Rain jackets", "Sale"]);
  });
  it("renames, merges, adds parents all the way up, and tags the season on a seasonal shelf", () => {
    const r = applyShelves(["Packs", "Daypacks", "Hiking", "Trail shoes"], ["Sale"], shelves, "Winter 2026");
    expect(r.tags).toEqual(["Backpacks", "Hiking", "Trail shoes", "Footwear", "Gear"]);
    expect(r.collections).toEqual(["Outlet"]);
    expect(applyShelves(["Rain jackets"], [], shelves, "Winter 2026").tags).toEqual(["Rain jackets", "Winter 2026"]);
    expect(applyShelves(["Rain jackets"], [], shelves, "").tags).toEqual(["Rain jackets"]);
    expect(applyShelves(["A"], ["B"], [], "x")).toEqual({ tags: ["A"], collections: ["B"] });
  });
  it("says each shelf as a sentence", () => {
    expect(describeShelves(shelves)[2]).toBe('The tag "Trail shoes" sits under "Footwear", which every product on it carries too.');
    expect(describeShelves(shelves)[4]).toBe('The tag "Rain jackets" is seasonal: its products carry the season\'s tag.');
  });
});
