import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { generateCsvParts, type CsvProduct } from "./csv";

/**
 * A download rebuilds its CSV when the saved file is gone — the normal case on a deployment with
 * no blob storage, where the file was written to one instance's /tmp and the download is served
 * by another. Rebuilding is only safe if building twice gives back the same bytes.
 */
describe("rebuilding an exported CSV", () => {
  const ski: CsvProduct = {
    handle: "atomic-bent-90-2026",
    title: "Atomic Bent 90 2026",
    bodyHtml: "<p>All-mountain ski.</p>",
    vendor: "Atomic",
    productType: "Skis",
    tags: ["skis", "2026"],
    published: false,
    status: "draft",
    option1Name: "Length",
    images: [],
    variants: [{ sku: "", price: 1099.95, quantity: 2, option1Value: "172" }, { sku: "", price: 1099.95, quantity: 1, option1Value: "180" }],
  };
  const products: CsvProduct[] = [
    ski,
    { ...ski, handle: "atomic-bent-100-2026", title: "Atomic Bent 100 2026" },
    { ...ski, handle: "volkl-mantra-88-2026", title: "Volkl Mantra 88 2026", vendor: "Volkl" },
  ];

  it("produces identical bytes when run again on the same batch", () => {
    const once = generateCsvParts(products, { metafieldColumns: [] });
    const twice = generateCsvParts(products, { metafieldColumns: [] });
    expect(twice.map((p) => p.content)).toEqual(once.map((p) => p.content));
    expect(twice.map((p) => p.bytes)).toEqual(once.map((p) => p.bytes));
  });

  it("numbers the parts from one, so partIndex still names the same file", () => {
    const parts = generateCsvParts(products, { metafieldColumns: [] });
    expect(parts.map((p) => p.index)).toEqual(parts.map((_, i) => i + 1));
  });

  it("groups by brand in the same order twice, which is what partIndex counts through", () => {
    const split = () => {
      const groups = new Map<string, CsvProduct[]>();
      for (const p of products) {
        const key = p.vendor || "unbranded";
        groups.set(key, [...(groups.get(key) ?? []), p]);
      }
      return [...groups].map(([group, list]) => [group, generateCsvParts(list, { metafieldColumns: [] }).map((part) => part.content)] as const);
    };
    const first = split();
    expect(split()).toEqual(first);
    // Two brands in, two files out — the thing a rebuilt partIndex indexes into.
    expect(first.map(([group]) => group)).toEqual(["Atomic", "Volkl"]);
  });
});


/**
 * A download that does nothing is the worst kind of failure: identical from the outside whether
 * the file was missing, the batch changed, or the browser declined it. Every path now says which.
 */
describe("a failed download explains itself", () => {
  it("never reports a failure without a reason", async () => {
    const pipeline = readFileSync(new URL("./pipeline.ts", import.meta.url), "utf8");
    const body = pipeline.slice(pipeline.indexOf("export async function readExportFile"));
    const fn = body.slice(0, body.indexOf("\n}\n") + 3);
    // Every failure carries a reason, and nothing is swallowed into a bare null.
    expect(fn).not.toMatch(/return null/);
    for (const match of fn.matchAll(/ok: false[^}]*/g)) expect(match[0]).toContain("reason");
    // Both the stored read and the rebuild report what went wrong rather than discarding it.
    expect(fn).toContain("Could not read the saved file");
    expect(fn).not.toMatch(/\}\s*catch\s*\{\s*\}/);
  });

  it("is surfaced by the route rather than logged and forgotten", () => {
    const route = readFileSync(new URL("../../app/api/catalog/exports/[id]/route.ts", import.meta.url), "utf8");
    expect(route).toContain("file.reason");
    expect(route).toContain("console.error");
  });
});


/**
 * Nothing but a structural problem stops a CSV being produced.
 *
 * This has now been the same complaint twice. The first time a missing price was an error and the
 * export refused outright. It was downgraded to a warning — and warnings gated the export too, so
 * the button simply greyed out instead, under a scrolling list of forty warnings with the release
 * checkbox buried at the bottom. From the operator's side both are the same thing: no CSV.
 *
 * A missing price, image or description is something to finish in Shopify. Only what Shopify
 * itself would reject on import — no title, a bad or duplicate handle, a duplicate SKU, a missing
 * option value — is allowed to stop the file being built.
 */
describe("warnings never stop the export", () => {
  const pipeline = readFileSync(new URL("./pipeline.ts", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../../app/(catalog)/(app)/batches/[id]/export/ExportPanel.tsx", import.meta.url), "utf8");
  const exportFn = (() => {
    const body = pipeline.slice(pipeline.indexOf("export async function exportBatch"));
    return body.slice(0, body.indexOf("\n}\n") + 3);
  })();

  it("refuses for nothing except having nothing to export", () => {
    // The refusals that used to sit here, in every shape they could be written. Warnings went
    // first; then the errors, once it was clear each one had a single obvious repair — a supplier
    // codes a colourway, not a size, so one SKU on six sizes is the normal case, not a mistake.
    expect(exportFn).not.toMatch(/warnings\.length\s*&&\s*!/);
    expect(exportFn).not.toMatch(/overrideWarnings/);
    expect(exportFn).not.toMatch(/blockingErrors/);
    expect(exportFn).not.toMatch(/if\s*\(errors\.length\)\s*return/);
    // The one thing that is genuinely not exportable.
    expect(exportFn).toContain("Nothing to export");
    // And what replaced the refusal: a repair, reported.
    expect(exportFn).toContain("plan.repairs");
  });

  it("does not grey the button out on the client when a batch has warnings", () => {
    const button = panel.slice(panel.indexOf("Generate Shopify CSV") - 200, panel.indexOf("Generate Shopify CSV"));
    expect(button).toContain("disabled={pending || blocked}");
    expect(button).not.toContain("Override");
    expect(button).not.toContain("warnings");
  });

  it("keeps the live-store push behind its own confirmation", () => {
    // The CSV is a file on the operator's machine; the push writes to the real shop. Only one of
    // those needs a checkbox, and it is not this one.
    expect(panel).toContain("I understand this writes to the live store");
    expect(panel).toMatch(/pushNeedsOverride/);
  });

  it("lets a download fail loudly instead of being disabled by unrelated work", () => {
    // Sharing one `pending` across the page meant a slow refresh elsewhere left Download greyed
    // out reading "Saving…" — which looks exactly like a download that does nothing.
    const row = panel.slice(panel.indexOf("onClick={() => doDownload"));
    expect(row.slice(0, 400)).not.toContain("disabled={pending}");
    expect(panel).toContain("downloading === f.id");
    // And a server action that throws puts the reason on screen rather than stopping silently.
    const handler = panel.slice(panel.indexOf("const doDownload"), panel.indexOf("const doExport"));
    expect(handler).toMatch(/catch\s*\(/);
    expect(handler).toContain("setDownloading(null)");
  });
});
