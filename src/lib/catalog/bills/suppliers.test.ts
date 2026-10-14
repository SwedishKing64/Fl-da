import { describe, expect, it } from "vitest";
import type { Bill } from "./quickbooks";
import { matchSupplier, nameFromList, nameWords, parseSupplierList } from "./suppliers";

// The shape of QuickBooks' supplier contact export, written out by hand: two title rows, a blank,
// the headings, then a supplier a row. Contact details are left empty — they are never kept.
const EXPORT = [
  ["Alpsport Pty Ltd", "", "", "", "", ""],
  ["Supplier Contact List", "", "", "", "", ""],
  ["", "", "", "", "", ""],
  ["Supplier", "Phone numbers", "Email", "Full name", "Billing address", "Account No."],
  ["Burton Australia Pty Ltd", "", "", "Burton Australia Pty Ltd", "", ""],
  ["Head Oceania Pty Ltd", "", "", "Head  Oceania", "", ""],
  ["Outdoor Agencies", "", "", "Outdoor  Agencies", "", ""],
  ["Outdoor Accessories", "", "", "", "", ""],
  ["Attvest Finance", "", "", "Atvest  Finance", "", ""],
  ["Bunnings Hardware", "", "", "", "", ""],
  ["Bunnings Warehouse", "", "", "", "", ""],
  ["Boardriders/Quiksilver (Torquay)", "", "", "Quiksilver  (Torquay)", "", ""],
  ["Australia Post", "", "", "", "", ""],
  ["Post", "", "", "", "", ""],
  ["", "", "", "", "", ""],
];
const list = parseSupplierList(EXPORT);

describe("the shop's supplier list", () => {
  it("reads the names out of QuickBooks' export, with the full name as another name for the same supplier", () => {
    expect(list.map((e) => e.name)).toEqual(["Burton Australia Pty Ltd", "Head Oceania Pty Ltd", "Outdoor Agencies", "Outdoor Accessories", "Attvest Finance", "Bunnings Hardware", "Bunnings Warehouse", "Boardriders/Quiksilver (Torquay)", "Australia Post", "Post"]);
    expect(list[1].aliases).toEqual(["Head Oceania"]);
    expect(list[0].aliases).toEqual([]);
    expect(parseSupplierList([["Name", "Phone"], ["X", "1"]])).toEqual([]);
  });

  it("compares names without Pty Ltd, Australia or punctuation", () => {
    expect(nameWords("Helly Hansen (Australia) Pty. Ltd.")).toEqual(["helly", "hansen"]);
    expect(nameWords("Ocean & Earth P/L")).toEqual(["ocean", "earth"]);
  });

  it("finds the list's name for the name an invoice prints", () => {
    expect(matchSupplier("Burton Snowboards Australia Pty Ltd", list)).toEqual({ kind: "close", name: "Burton Australia Pty Ltd" });
    expect(matchSupplier("HEAD OCEANIA PTY LIMITED", list)).toEqual({ kind: "exact", name: "Head Oceania Pty Ltd" });
    expect(matchSupplier("Outdoor Agencies Pty Ltd", list)).toEqual({ kind: "exact", name: "Outdoor Agencies" });
    expect(matchSupplier("Atvest Finance Limited", list)).toEqual({ kind: "exact", name: "Attvest Finance" });
    expect(matchSupplier("Quiksilver", list)).toEqual({ kind: "exact", name: "Boardriders/Quiksilver (Torquay)" });
    expect(matchSupplier("Australia Post", list)).toEqual({ kind: "exact", name: "Australia Post" });
  });

  it("says when it cannot tell between two, and leaves a stranger alone", () => {
    expect(matchSupplier("Bunnings", list)).toEqual({ kind: "unsure", names: ["Bunnings Hardware", "Bunnings Warehouse"] });
    expect(matchSupplier("Rossignol Australia Pty Ltd", list)).toEqual({ kind: "none" });
    expect(matchSupplier("Outdoor Supplies", list)).toEqual({ kind: "none" });
    // A one-word name on the list is taken only where the invoice's name starts with it.
    expect(matchSupplier("Mountain Post Supplies", list)).toEqual({ kind: "none" });
  });

  it("names the bill as the list does, keeping what the invoice printed, and matches again from that", () => {
    const bill = { supplier: "Burton Snowboards Australia Pty Ltd" } as Bill;
    const named = nameFromList(bill, list);
    expect(named.supplier).toBe("Burton Australia Pty Ltd");
    expect(named.printedSupplier).toBe("Burton Snowboards Australia Pty Ltd");
    expect(nameFromList(named, list.filter((e) => !e.name.startsWith("Burton"))).supplier).toBe("Burton Snowboards Australia Pty Ltd");
    expect(nameFromList({ supplier: "Rossignol" } as Bill, list)).toMatchObject({ supplier: "Rossignol", printedSupplier: "Rossignol" });
  });
});
