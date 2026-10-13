/**
 * What the model says is checked before any of it is used.
 *
 * It is asked only about the lines the rules left over, and may answer only with a code on the
 * reference sheet. Anything else it says is dropped — a wrong join puts another product's
 * description on this one, which is worse than none.
 */

import { describe, expect, it } from "vitest";
import { askToJoin } from "./reference-ai";
import { emptyLineItem, type CanonicalLineItem } from "./types";

const item = (over: Partial<CanonicalLineItem>): CanonicalLineItem => ({ ...emptyLineItem(), ...over });
const specs = [
  item({ modelCode: "30361", title: "Mystery Process Snowboard" }),
  item({ modelCode: "10688", title: "Men's Custom Camber Snowboard" }),
];
const lines = [{ index: 4, line: item({ title: "MYS PROCESS NEW GRAPHIC" }) }, { index: 7, line: item({ title: "DEEP THINKER" }) }];
const answer = (joins: Array<{ line: number; code: string }>) => async () => JSON.stringify({ joins: joins.map((j) => ({ ...j, why: "" })) });

describe("the model's joins", () => {
  it("takes an answer that names a row on the sheet", async () => {
    const out = await askToJoin(lines, specs, answer([{ line: 4, code: "30361" }, { line: 7, code: "" }]));
    expect([...out.keys()]).toEqual([4]);
    expect(out.get(4)!.title).toBe("Mystery Process Snowboard");
  });

  it("drops a code that is not on the sheet", async () => {
    expect((await askToJoin(lines, specs, answer([{ line: 4, code: "99999" }]))).size).toBe(0);
  });

  it("drops an answer about a line it was not asked about", async () => {
    // Line 2 was placed by the rules. The model does not get to move it.
    expect((await askToJoin(lines, specs, answer([{ line: 2, code: "10688" }]))).size).toBe(0);
  });

  it("survives an answer that is not what was asked for", async () => {
    expect((await askToJoin(lines, specs, async () => '{"something":"else"}')).size).toBe(0);
    expect((await askToJoin(lines, specs, async () => undefined)).size).toBe(0);
  });
});
