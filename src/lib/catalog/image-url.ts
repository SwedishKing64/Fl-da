/**
 * A product picture's address at its full size (asked 2026-10-20: "it needs to do bigger").
 *
 * A brand's page shows its pictures cut down to fit the page — a Shopify store's "_600x" or
 * "?width=600", a Cloudinary "w_400,c_fill", a Salesforce store's "?sw=500&sh=500", a Magento
 * "/cache/<hash>/" — and the same address without the cut is the picture as the brand uploaded
 * it. The shop's listings want that one. An address none of these fits is left as it is.
 */

const SIZE_PARAMS = /^(width|height|w|h|sw|sh|wid|hei|size|resize|fit|crop|dpr|scale|sm|imwidth|imheight)$/i;

export function fullSizePicture(raw: string): string {
  let u: URL;
  try { u = new URL(raw); } catch { return raw; }
  const shopify = /(^|\.)cdn\.shopify\.com$/i.test(u.hostname) || /\/cdn\/shop\//i.test(u.pathname) || /\/s\/files\//i.test(u.pathname);
  if (shopify) {
    // product_1024x1024.jpg, product_600x.jpg, product_x600@2x.jpg, product_grande.jpg, _crop_center
    u.pathname = u.pathname.replace(/_(?:\d+x\d*|\d*x\d+|pico|icon|thumb|small|compact|medium|large|grande|original|master)(?:_crop_[a-z]+)?(?:@\dx)?(?=\.[a-z0-9]+$)/i, "");
  }
  // Cloudinary: /image/upload/w_400,h_400,c_fill/v123/name.jpg -> /image/upload/v123/name.jpg
  if (/\/image\/upload\//i.test(u.pathname)) {
    u.pathname = u.pathname.replace(/(\/image\/upload)((?:\/(?:[a-z]{1,3}_[^/,]+)(?:,[a-z]{1,3}_[^/,]+)*)+)(?=\/)/i, (_m, head: string, steps: string) =>
      head + steps.split("/").filter((s) => s && !/^([a-z]{1,3}_[^,]+)(,[a-z]{1,3}_[^,]+)*$/i.test(s)).map((s) => `/${s}`).join(""));
  }
  // Magento's resized copy: /media/catalog/product/cache/<hash>/a/b/name.jpg
  u.pathname = u.pathname.replace(/(\/media\/catalog\/product)\/cache\/[0-9a-f]{16,}(?=\/)/i, "$1");
  for (const key of [...u.searchParams.keys()]) if (SIZE_PARAMS.test(key)) u.searchParams.delete(key);
  const out = u.toString();
  return out.endsWith("?") ? out.slice(0, -1) : out;
}
