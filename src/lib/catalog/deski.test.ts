import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { STILL_OUTSIDE } from "./trades/snow/still-outside";

/** Words that are the snow trade's, or the ski shop's brands. */
const SKI_WORDS = /\b(skis?|snowboards?|snowboarding|bindings?|burton|v[öo]lkl|helly|freeride|mondopoint)\b/i;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("the snow trade stays in its pack", () => {
  const mentioning = sources("src")
    .filter((f) => !f.startsWith(join("src", "lib", "catalog", "trades")) && !f.endsWith("schema-sql.ts"))
    .filter((f) => SKI_WORDS.test(readFileSync(f, "utf8")))
    .sort();

  it("adds no new file outside the pack that mentions skis, boards, bindings or the ski shop's brands", () => {
    const added = mentioning.filter((f) => !STILL_OUTSIDE.includes(f));
    expect(added, "Put a ski's own code in trades/snow/, or word it for any trade").toEqual([]);
  });

  it("keeps the list honest: a file cleaned of them comes off it", () => {
    const cleaned = STILL_OUTSIDE.filter((f) => !mentioning.includes(f));
    expect(cleaned, "These no longer mention the snow trade: take them off trades/snow/still-outside.ts").toEqual([]);
  });
});
