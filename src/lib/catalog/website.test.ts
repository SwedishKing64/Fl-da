import { describe, expect, it } from "vitest";
import { isKindOfProduct, parseMenuLinks, parseShopifyCollections, siteOrigin } from "./website";

describe("a website address", () => {
  it("becomes the site's origin however it was typed", () => {
    expect(siteOrigin("aussieskier.com.au")).toBe("https://aussieskier.com.au");
    expect(siteOrigin("  https://www.example.com/collections/skis?x=1 ")).toBe("https://www.example.com");
    expect(siteOrigin("http://localhost:3000")).toBeUndefined();
    expect(siteOrigin("not a site")).toBeUndefined();
    expect(siteOrigin("")).toBeUndefined();
  });
});

describe("what counts as a kind of product", () => {
  it("keeps categories and drops promotions, brands and pages about the shop", () => {
    for (const yes of ["Skis", "Ski Boots", "Women's Jackets", "Packs & Bags", "2 Person Tents"]) expect(isKindOfProduct(yes)).toBe(true);
    for (const no of ["Sale", "Brands", "Gift Cards", "New Arrivals", "Contact Us", "All", "Home page", "Login", "Blog", "Frontpage", ""]) expect(isKindOfProduct(no)).toBe(false);
  });
});

describe("a Shopify store's collections", () => {
  it("become categories, once each, without the merchandising ones", () => {
    const json = {
      collections: [
        { title: "Frontpage", handle: "frontpage" },
        { title: "Skis", handle: "skis" },
        { title: "Ski Boots", handle: "ski-boots" },
        { title: "SKIS", handle: "skis-2" },
        { title: "Sale", handle: "sale" },
        { title: "Packs &amp; Bags", handle: "packs-bags" },
        { title: "", handle: "empty" },
      ],
    };
    expect(parseShopifyCollections(json)).toEqual([
      { title: "Skis", path: "/collections/skis" },
      { title: "Ski Boots", path: "/collections/ski-boots" },
      { title: "Packs & Bags", path: "/collections/packs-bags" },
    ]);
    expect(parseShopifyCollections({ nope: 1 })).toEqual([]);
  });
});

describe("a site's menu", () => {
  it("reads collection links on a Shopify page and nothing else", () => {
    const html = `
      <header><nav>
        <a href="/">Home</a>
        <a href="/collections/skis">Skis</a>
        <a href="https://shop.example/collections/ski-boots?sort=new">Ski <span>Boots</span></a>
        <a href="/collections/all">All</a>
        <a href="/collections/sale">Sale</a>
        <a href="/products/mantra-88">Mantra 88</a>
        <a href="/pages/about">About us</a>
        <a href="https://instagram.com/x">Instagram</a>
        <a href="/collections/skis">Skis</a>
      </nav></header>`;
    expect(parseMenuLinks(html, "https://shop.example")).toEqual([
      { title: "Skis", path: "/collections/skis" },
      { title: "Ski Boots", path: "/collections/ski-boots" },
    ]);
  });

  it("reads same-site menu links on any other kind of site", () => {
    const html = `
      <nav>
        <a href="/">Home</a>
        <a href="/bikes/">Bikes</a>
        <a href="/parts/wheels">Wheels</a>
        <a href="/catalog?category=helmets">Helmets</a>
        <a href="/cart">Cart</a>
        <a href="/contact">Contact</a>
        <a href="/logo.png">Logo</a>
        <a href="https://other.example/bikes">Bikes elsewhere</a>
      </nav>`;
    expect(parseMenuLinks(html, "https://bikes.example")).toEqual([
      { title: "Bikes", path: "/bikes" },
      { title: "Wheels", path: "/parts/wheels" },
      { title: "Helmets", path: "/catalog?category=helmets" },
    ]);
  });
});
