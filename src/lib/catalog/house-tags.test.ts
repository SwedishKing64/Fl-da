import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { houseTags } from "./product-tags";
import { DEFAULT_TAG_RULES } from "./rules";

/**
 * How a tag is spelled, settled against the shop's own catalogue.
 *
 * Of the 334 distinct tags across the 827 products in their nine Shopify exports, not one contains
 * an uppercase letter. Seeded tag rules were nonetheless adding "Mens", "Womens" and "New Season",
 * and because rules run after the categoriser their additions reached the column unchecked — so a
 * jacket went out tagged "mens, womens, Womens, Mens": the same two tags twice.
 *
 * Note that hyphenation is per-tag and is NOT normalised here: the catalogue writes "snow-clothing"
 * with a hyphen and "snow jackets" with a space, and both are correct because that is what the
 * shop's own products carry.
 */
describe("house tag spelling", () => {
  it("lower-cases, because the catalogue has no capitals anywhere", () => {
    expect(houseTags(["Mens", "New Season", "Snow-Clothing"])).toEqual(["mens", "new season", "snow-clothing"]);
  });

  it("treats a tag that differs only by case as the same tag", () => {
    expect(houseTags(["mens", "womens", "Womens", "Mens"])).toEqual(["mens", "womens"]);
  });

  it("keeps the first spelling's position and drops blanks", () => {
    expect(houseTags(["snow jackets", "", "  ", "2026", "SNOW JACKETS"])).toEqual(["snow jackets", "2026"]);
  });

  it("leaves per-tag hyphenation alone", () => {
    // Both are real: 70 products carry "snow-clothing", 24 carry "snow jackets".
    expect(houseTags(["snow-clothing", "snow jackets"])).toEqual(["snow-clothing", "snow jackets"]);
  });

  it("ships no seeded rule that adds a tag the shop does not write", () => {
    for (const rule of DEFAULT_TAG_RULES) {
      for (const tag of rule.addTags.split(",").map((t) => t.trim()).filter(Boolean)) {
        expect(tag, `rule "${rule.name}" adds ${tag}`).toBe(tag.toLowerCase());
      }
    }
  });
});

/**
 * Correcting the defaults in code does nothing for a database that already has the old rows.
 *
 * The seeded rules were fixed to spell tags as the shop does, and the repair that rewrites rows
 * already stored was called from the seeder — which runs once on an empty database, and from a
 * button that only appears when there are no rules at all. So every shop that had ever seeded the
 * old rules kept them, and went on being given a "new season" tag that its catalogue has never
 * carried. The repair has to run where the rules are read, which is the same lesson the category
 * repair two functions below it had already learned.
 */
describe("where the tag repair is called from", () => {
  const pipeline = readFileSync(new URL("./pipeline.ts", import.meta.url), "utf8");

  it("runs wherever tag rules are loaded, not only when they are seeded", () => {
    const fn = pipeline.slice(pipeline.indexOf("export async function loadTagRules"));
    expect(fn.slice(0, fn.indexOf("\n}"))).toContain("repairTagRuleSpelling");
  });

  it("has the same shape as the category repair it sits beside", () => {
    const fn = pipeline.slice(pipeline.indexOf("export async function loadCategoryRules"));
    expect(fn.slice(0, fn.indexOf("\n}"))).toContain("repairCategoryRules");
  });
});

/**
 * The web lookup does not run in the tail of the upload request.
 *
 * It did, and half-running was worse than not running: it shares one sixty-second function with a
 * vision call over a photographed invoice, so it reached a product or two and stamped them with a
 * status that made every later pass skip them. The batch then settled with no descriptions and
 * nothing said why.
 */
describe("where the lookup is called from", () => {
  const pipeline = readFileSync(new URL("./pipeline.ts", import.meta.url), "utf8");

  it("is not started by applyMappings", () => {
    const fn = pipeline.slice(pipeline.indexOf("export async function applyMappings"));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    expect(body).not.toContain("lookupBatch");
    expect(body).not.toContain("AUTOMATIC_BUDGET_MS");
  });

  it("is given a budget that fits inside the function running it", () => {
    const enrich = readFileSync(new URL("./enrich.ts", import.meta.url), "utf8");
    const match = /REQUESTED_BUDGET_MS = ([\d_]+)/.exec(enrich);
    expect(match).not.toBeNull();
    const budget = Number(match![1].replace(/_/g, ""));
    // The review page declares maxDuration = 60; a budget over that is killed mid-pass.
    const page = readFileSync(new URL("../../app/(catalog)/(app)/batches/[id]/review/page.tsx", import.meta.url), "utf8");
    const limit = Number(/export const maxDuration = (\d+)/.exec(page)![1]);
    expect(budget).toBeLessThan(limit * 1000);
    // And with room to finish the lookup it had already started, and reply.
    expect(limit * 1000 - budget).toBeGreaterThanOrEqual(10_000);
  });

  it("retries a lookup that failed, and does not re-ask for one that found nothing", () => {
    const enrich = readFileSync(new URL("./enrich.ts", import.meta.url), "utf8");
    const fn = enrich.slice(enrich.indexOf("export async function lookupBatch"));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    // FAILED is absent from the skip list on purpose: it is not an answer.
    expect(body).toMatch(/in:\s*\["FOUND",\s*"UNSURE",\s*"NOT_FOUND"\]/);
    expect(body).not.toContain('not: "NONE"');
  });
});

/**
 * Correcting the rule does nothing for the products already built.
 *
 * A product's tags are written once, at build time, and nothing reads them back afterwards. So the
 * seeded rule was fixed, and the rule rows already in the database were fixed where they are read,
 * and a batch built before either still showed "new season" in the grid and wrote it into the CSV
 * — which from outside is indistinguishable from the fix never having landed. It is reported
 * as still happening because it still was.
 *
 * The tags stripped are only the ones the shop has never written. Anything a person typed stays.
 */
describe("tags the shop has never written are taken off products too", () => {
  const seed = readFileSync(new URL("./seed.ts", import.meta.url), "utf8");
  const pipeline = readFileSync(new URL("./pipeline.ts", import.meta.url), "utf8");

  it("strips exactly the tags the rule repair maps to nothing", () => {
    // One list, derived from the other, so the two can never disagree about what is not a tag.
    expect(seed).toContain("const STRIP_FROM_PRODUCTS = Object.entries(TAG_SPELLING).filter(([, to]) => to === \"\")");
    expect(seed).toMatch(/"new season": ""/);
  });

  it("runs where a batch is read, so the grid and the CSV both see it", () => {
    const fn = pipeline.slice(pipeline.indexOf("export async function loadReview"));
    expect(fn.slice(0, fn.indexOf("\n  const products"))).toContain("repairProductTags");
  });

  it("only ever removes tags, never renames or adds one", () => {
    const fn = seed.slice(seed.indexOf("export async function repairProductTags"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body).toContain("filter((t) => !STRIP_FROM_PRODUCTS.includes(t.toLowerCase()))");
    expect(body).not.toMatch(/TAG_SPELLING\[/); // renaming is the rules' job, not the products'
  });
});
