// Pure helpers shared by the DB pipeline and the offline/regression pipeline.

import { metafieldColumns } from "./categorize";
import type { CsvProduct } from "./csv";
import type { ReviewProduct } from "./review-types";

export function toCsvProducts(products: ReviewProduct[], publishOnExport: boolean): CsvProduct[] {
  return products.map((p) => {
    const productImages = p.images; // every image belongs to the product gallery; variant images also link via Variant Image
    const variantImage = new Map(p.images.filter((i) => i.variantId).map((i) => [i.variantId!, i.url]));
    return {
      handle: p.handle,
      title: p.title,
      bodyHtml: p.bodyHtml,
      vendor: p.vendor,
      productType: p.productType,
      tags: p.tags.split(",").map((t) => t.trim()).filter(Boolean),
      published: publishOnExport,
      status: publishOnExport ? "active" : "draft",
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

