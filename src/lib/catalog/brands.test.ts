import { describe, expect, it } from "vitest";
import { brandsAsked } from "./brands";

describe("which of an order's brands an instruction keeps", () => {
  const onOrder = ["Burton", "Anon"];
  it("keeps the brand named with only / just / start with, and the others when one is left out", () => {
    expect(brandsAsked("only Burton", onOrder)).toEqual(["Burton"]);
    expect(brandsAsked("just the burton products for now", onOrder)).toEqual(["Burton"]);
    expect(brandsAsked("I want to start with Burton and do Anon separately", onOrder)).toEqual(["Burton"]);
    expect(brandsAsked("leave out the Anon", onOrder)).toEqual(["Burton"]);
    expect(brandsAsked("not the anon ones", onOrder)).toEqual(["Burton"]);
    expect(brandsAsked("only Burton, not Anon", onOrder)).toEqual(["Burton"]);
    expect(brandsAsked("only Burton, Anon separately", onOrder)).toEqual(["Burton"]);
    expect(brandsAsked("Burton first, then Anon", onOrder)).toEqual(["Burton"]);
  });
  it("is nothing to do when the order has one brand, or the instruction names none, or keeps them all", () => {
    expect(brandsAsked("only Burton", ["Burton"])).toBeNull();
    expect(brandsAsked("put everything 30% off", onOrder)).toBeNull();
    expect(brandsAsked("only Burton and Anon", onOrder)).toBeNull();
    expect(brandsAsked("only Volkl", onOrder)).toBeNull();
  });
});
