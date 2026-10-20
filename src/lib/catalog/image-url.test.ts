import { describe, expect, it } from "vitest";
import { fullSizePicture } from "./image-url";

describe("a picture at its full size", () => {
  it("takes a Shopify store's cut off", () => {
    expect(fullSizePicture("https://cdn.shopify.com/s/files/1/0123/products/boot-pack_600x.jpg?v=1700")).toBe("https://cdn.shopify.com/s/files/1/0123/products/boot-pack.jpg?v=1700");
    expect(fullSizePicture("https://www.dakine.com/cdn/shop/files/10001455_BLACK_01.jpg?v=1712&width=533")).toBe("https://www.dakine.com/cdn/shop/files/10001455_BLACK_01.jpg?v=1712");
    expect(fullSizePicture("https://cdn.shopify.com/s/files/1/x/heli_1024x1024_crop_center@2x.png")).toBe("https://cdn.shopify.com/s/files/1/x/heli.png");
  });

  it("takes other stores' cuts off", () => {
    expect(fullSizePicture("https://res.cloudinary.com/brand/image/upload/w_400,h_400,c_fill/v1699/packs/heli.jpg")).toBe("https://res.cloudinary.com/brand/image/upload/v1699/packs/heli.jpg");
    expect(fullSizePicture("https://brand.com/dw/image/v2/AAA/on/demandware.static/pack.jpg?sw=500&sh=500&sm=fit")).toBe("https://brand.com/dw/image/v2/AAA/on/demandware.static/pack.jpg");
    expect(fullSizePicture("https://shop.com/media/catalog/product/cache/0123456789abcdef0123456789abcdef/b/o/boot.jpg")).toBe("https://shop.com/media/catalog/product/b/o/boot.jpg");
  });

  it("leaves an address with no cut in it alone", () => {
    expect(fullSizePicture("https://brand.com/images/pack-large-front.jpg")).toBe("https://brand.com/images/pack-large-front.jpg");
    expect(fullSizePicture("not a url")).toBe("not a url");
  });
});
