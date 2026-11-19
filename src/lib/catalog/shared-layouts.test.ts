import { describe, expect, it } from "vitest";
import { addReading, bestReading, shareable, shareableHeaders } from "./shared-layouts";
import { headerHash, type Mapping } from "./mapping";

const headers = ["Style", "Description", "Colour", "Size", "Qty", "Unit Price"];
const reading: Mapping = { Style: "modelCode", Description: "title", Colour: "colour", Size: "size", Qty: "quantity", "Unit Price": "costPrice" };

describe("shareable", () => {
  it("keeps headings and the field each is, and nothing else", () => {
    const out = shareable(headers, { ...reading, Junk: "not-a-field" as never });
    expect(out?.headers).toEqual(headers);
    expect(out?.mappings).toEqual(reading);
  });

  it("drops a heading that holds a value: a long cell or a number", () => {
    const out = shareable([...headers, "149.95", "x".repeat(81)], reading);
    expect(out?.headers).toEqual(headers);
  });

  it("shares nothing where nothing is mapped, or there is no layout to speak of", () => {
    expect(shareable(headers, {})).toBeNull();
    expect(shareable(["Description"], { Description: "title" })).toBeNull();
  });

  it("names a layout the same on both sides, whatever was dropped", () => {
    const sent = shareable([...headers, "12.00"], reading)!;
    expect(headerHash(sent.headers)).toBe(headerHash(shareableHeaders([" Style", ...headers.slice(1), "12.00"])));
  });
});

describe("readings", () => {
  const other: Mapping = { ...reading, "Unit Price": "rrp" };

  it("counts shops that agree, and keeps a shop's different reading beside it", () => {
    let v = addReading([], reading, "a");
    v = addReading(v, reading, "b");
    v = addReading(v, other, "c");
    expect(v.map((x) => x.contributors)).toEqual([["a", "b"], ["c"]]);
  });

  it("moves a shop that changes its mind rather than counting it twice", () => {
    let v = addReading([], reading, "a");
    v = addReading(v, other, "a");
    expect(v).toEqual([{ mappings: other, contributors: ["a"] }]);
  });

  it("offers the reading most shops agree on, and never a shop its own", () => {
    let v = addReading([], reading, "a");
    v = addReading(v, reading, "b");
    v = addReading(v, other, "c");
    expect(bestReading(v, "z")).toEqual({ mappings: reading, shops: 2 });
    expect(bestReading(v, "c")).toEqual({ mappings: reading, shops: 2 });
    expect(bestReading(addReading([], reading, "a"), "a")).toBeNull();
  });

  it("never says which shops taught it", () => {
    const answer = bestReading(addReading([], reading, "client_123"), "z");
    expect(JSON.stringify(answer)).not.toContain("client_123");
  });
});

describe("counting", () => {
  it("counts only the other shops", () => {
    let v = addReading([], { Description: "title", Qty: "quantity" }, "a");
    v = addReading(v, { Description: "title", Qty: "quantity" }, "b");
    expect(bestReading(v, "a")?.shops).toBe(1);
    expect(bestReading(v, "z")?.shops).toBe(2);
  });
});
