// Pure helpers shared by the DB pipeline and the offline/regression pipeline.

import { metafieldColumns } from "./categorize";
import { categoryForKind, fillsCategory, headingsFor } from "./taxonomy";
import { categoryById, type TaxonomyCategory } from "./shopify-taxonomy";
import type { CsvProduct } from "./csv";
import type { ReviewProduct } from "./review-types";

/**
 * The value the Type column takes: the menu heading, never the shelf under it.
 *
 * Every one of the 673 typed products in the shop's own exports carries a heading — 46 of the 47
 * jackets and pants read "Snow Clothing", and "Snow Jackets" appears as a Type nowhere at all. The
 * categoriser names the shelf, which is right for tags and for reading the grid, but writing that
 * shelf into Type is how a Spyder jacket came out filed somewhere the shop does not have.
 *
 * Where a shelf hangs under two headings — Gloves under both Clothing Accessories and Snowboard
 * Accessories — the product's own collection decides, and failing that the first one does.
 */
/**
 * The Type as the shop's own column spells it: the menu draws an ampersand, the catalogue writes
 * it out — "Packs and Bags" on all forty-six of its packs, "Climbing and Abseiling" on all forty.
 */
export function spellType(productType: string): string {
  return productType.trim().replace(/\s*&\s*/g, " and ");
}

export function csvType(productType: string, collections: string[]): string {
  const headings = headingsFor(productType);
  if (headings.length === 0) return productType.trim();
  const named = headings.find((h) => collections.some((c) => c.trim().toLowerCase() === h.toLowerCase()));
  return named ?? headings[0];
}

/**
 * Shopify's Product Category, where the shop fills one in.
 *
 * Read off the shop's own exports: most of the catalogue is left "Uncategorized", but its boards,
 * downhill skis and sleeping bags mostly carry the full path, and a new board written as
 * Uncategorized sat beside twelve that were not. Only those are filled in; everything else stays
 * as the shop leaves it.
 */
const PRODUCT_CATEGORY: Record<string, string> = {
  Snowboards: "sg-4-17-2-17", // Sporting Goods > … > Skiing & Snowboarding > Snowboards
  Skis: "sg-4-17-2-13-2", // Sporting Goods > … > Skiing & Snowboarding > Skis > Downhill Skis
  "Sleeping Bags": "sg-4-2-14", // Sporting Goods > Outdoor Recreation > Camping & Hiking > Sleeping Bags
};

/** A product's Shopify category, where it goes out with one. */
export function productCategoryOf(csvProductType: string, title = ""): TaxonomyCategory | null {
  // Every shop but the ski shop gets the category Shopify asks for. See TradePack.fillsCategory.
  if (fillsCategory()) return categoryForKind(csvProductType.trim());
  // A package is a board or ski with bindings on it; the shop leaves those uncategorised.
  if (/\binc\b|\bpackage\b/i.test(title)) return null;
  const id = PRODUCT_CATEGORY[csvProductType.trim()];
  return id ? categoryById(id) : null;
}

/** The category as the CSV's Product Category column writes it: its full path. */
export function productCategoryFor(csvProductType: string, title = ""): string | undefined {
  return productCategoryOf(csvProductType, title)?.path;
}

export function toCsvProducts(products: ReviewProduct[]): CsvProduct[] {
  return products.map((p) => {
    const productImages = p.images; // every image belongs to the product gallery; variant images also link via Variant Image
    const variantImage = new Map(p.images.filter((i) => i.variantId).map((i) => [i.variantId!, i.url]));
    // A picture put on one variant of a colour is that colour's picture: the other sizes of the
    // same colour show it too, so every black binding in the drop-down is the black one.
    const colourAt = [p.option1Name, p.option2Name, p.option3Name].findIndex((n) => /colou?r/i.test(n ?? ""));
    const colourOf = (v: { option1Value: string | null; option2Value: string | null; option3Value: string | null }) => (colourAt < 0 ? "" : ([v.option1Value, v.option2Value, v.option3Value][colourAt] ?? "").trim().toLowerCase());
    const byColour = new Map<string, string>();
    for (const v of p.variants) {
      const url = variantImage.get(v.id);
      const colour = colourOf(v);
      if (url && colour && !byColour.has(colour)) byColour.set(colour, url);
    }
    return {
      handle: p.handle,
      title: p.title,
      bodyHtml: p.bodyHtml,
      vendor: p.vendor,
      productType: csvType(p.productType, p.collections.split(",")),
      productCategory: productCategoryFor(csvType(p.productType, p.collections.split(",")), p.title),
      tags: p.tags.split(",").map((t) => t.trim()).filter(Boolean),
      published: false, // drafts, always — see csv.ts
      status: "draft",
      seoTitle: p.seoTitle,
      seoDescription: p.seoDescription,
      option1Name: p.option1Name,
      option2Name: p.option2Name,
      option3Name: p.option3Name,
      collection: p.collections.split(",").map((c) => c.trim()).filter(Boolean)[0] ?? "",
      metafields: metafieldColumns(p.metafields),
      images: productImages.map((i, idx) => ({ url: i.url, position: idx + 1, altText: p.title })),
      variants: p.variants.map((v) => ({
        sku: v.sku,
        barcode: v.barcode,
        option1Value: v.option1Value,
        option2Value: v.option2Value,
        option3Value: v.option3Value,
        grams: v.grams,
        quantity: v.quantity,
        price: v.retailPrice,
        compareAtPrice: v.compareAtPrice,
        costPerItem: v.landedCostHome,
        imageUrl: variantImage.get(v.id) ?? byColour.get(colourOf(v)) ?? null,
      })),
    };
  });
}

