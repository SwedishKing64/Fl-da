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
