// Pure helpers shared by the DB pipeline and the offline/regression pipeline.

import { metafieldColumns } from "./categorize";
import { headingsFor } from "./taxonomy";
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
  Snowboards: "Sporting Goods > Outdoor Recreation > Winter Sports & Activities > Skiing & Snowboarding > Snowboards",
  Skis: "Sporting Goods > Outdoor Recreation > Winter Sports & Activities > Skiing & Snowboarding > Skis > Downhill Skis",
  "Sleeping Bags": "Sporting Goods > Outdoor Recreation > Camping & Hiking > Sleeping Bags",
};

export function productCategoryFor(csvProductType: string, title = ""): string | undefined {
  // A package is a board or ski with bindings on it; the shop leaves those uncategorised.
  if (/\binc\b|\bpackage\b/i.test(title)) return undefined;
  return PRODUCT_CATEGORY[csvProductType.trim()];
}

export function toCsvProducts(products: ReviewProduct[]): CsvProduct[] {
  return products.map((p) => {
    const productImages = p.images; // every image belongs to the product gallery; variant images also link via Variant Image
    const variantImage = new Map(p.images.filter((i) => i.variantId).map((i) => [i.variantId!, i.url]));
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
        costPerItem: v.landedCostAud,
        imageUrl: variantImage.get(v.id) ?? null,
      })),
    };
  });
}

