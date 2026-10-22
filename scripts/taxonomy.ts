/**
 * Rebuild src/lib/catalog/data/shopify-taxonomy.ts from a release of Shopify's Standard Product
 * Taxonomy: `npx tsx scripts/taxonomy.ts 2026-08`. Keeps each category's id and its own name; the
 * resolver rebuilds the paths from the ids.
 */
import { writeFileSync } from "node:fs";

const release = process.argv[2];
if (!release || !/^\d{4}-\d{2}(-[a-z0-9]+)?$/.test(release)) {
  console.error("Name the release, e.g. 2026-08.");
  process.exit(1);
}

async function main(): Promise<void> {
const res = await fetch(`https://raw.githubusercontent.com/Shopify/product-taxonomy/v${release}/dist/en/categories.txt`);
if (!res.ok) throw new Error(`Shopify's taxonomy ${release} could not be fetched: ${res.status}`);
const rows = (await res.text()).split("\n").filter((l) => l.startsWith("gid://")).map((line) => {
  const [gid, path] = line.split(" : ");
  return `${gid.trim().split("/").pop()}\t${path.trim().split(" > ").pop()}`;
});
if (rows.some((r) => /[`\\]|\$\{/.test(r))) throw new Error("A category name would break the template string.");

writeFileSync("src/lib/catalog/data/shopify-taxonomy.ts", `/**
 * Shopify's Standard Product Taxonomy, release ${release}, as each category's id and its own name.
 * From https://github.com/Shopify/product-taxonomy (dist/en/categories.txt, MIT licence), cut down
 * to what the resolver needs: a category's parent is its id less the last "-n", so the full path
 * is rebuilt rather than stored. Regenerate with \`npx tsx scripts/taxonomy.ts <release>\`.
 */
export const TAXONOMY_RELEASE = "${release}";

export const TAXONOMY_ROWS = \`${rows.join("\n")}\`;
`);
console.log(`${rows.length} categories from release ${release}.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
