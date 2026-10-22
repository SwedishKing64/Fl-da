/**
 * Check a trade pack's files before they are loaded: `npx tsx scripts/check-pack.ts <folder>`.
 * The folder holds pack.json and, where the trade has them, kinds.json, sizes.json, colours.json
 * and reader-examples.json (see src/lib/catalog/trades/knowledge.ts and docs/KNOWLEDGE-PROMPT.md).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkPack, kindsOf, PackFile } from "../src/lib/catalog/trades/knowledge";

const dir = process.argv[2];
if (!dir || !existsSync(join(dir, "pack.json"))) {
  console.error("Name a folder with a pack.json in it: npx tsx scripts/check-pack.ts knowledge/bike");
  process.exit(1);
}
const read = (name: string): unknown => (existsSync(join(dir, name)) ? JSON.parse(readFileSync(join(dir, name), "utf8")) : undefined);
const files = { pack: read("pack.json"), kinds: read("kinds.json"), sizes: read("sizes.json"), colours: read("colours.json"), readerExamples: read("reader-examples.json") };
const problems = checkPack(files);
if (problems.length) {
  console.log(`${problems.length} thing${problems.length === 1 ? "" : "s"} to fix:`);
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(1);
}
const pack = PackFile.parse(files.pack);
const kinds = (files.kinds as unknown[] | undefined)?.length ?? 0;
console.log(`${pack.name} checks out: ${kindsOf(pack.tree).length} kinds on the menu, all placed in Shopify's taxonomy; ${kinds} described in kinds.json.`);
console.log(pack.verified ? "Marked verified." : "Not verified yet: score it on real documents from a pilot shop in the trade (docs/PILOT.md), with and without it.");
if (existsSync(join(dir, "documents"))) console.log(`Its sample documents: npm run eval:read -- --dir ${join(dir, "documents")}`);
