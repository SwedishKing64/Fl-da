import { afterEach, describe, expect, it, vi } from "vitest";
import { isKindOfProduct, kindsFromTypes, parseMenuLinks, parseShopifyCollections, parseShopifyProducts, readWebsite, siteOrigin, withoutBrandsAndSeasons } from "./website";

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

describe("a Shopify store's own Product Types", () => {
  const products = [
    { product_type: "Skis", vendor: "Atomic" }, { product_type: "Skis", vendor: "Volkl" }, { product_type: "Ski Boots", vendor: "Atomic" },
    { product_type: "Gift Card", vendor: "Alpsport" }, { product_type: "", vendor: "Smith" }, { product_type: "Goggles", vendor: "Smith" },
  ];

  it("are read off the listings with how many each holds, the most used first", () => {
    const page = parseShopifyProducts({ products })!;
    expect(page.products).toBe(6);
    expect([...page.vendors].sort()).toEqual(["Alpsport", "Atomic", "Smith", "Volkl"]);
    expect(kindsFromTypes(page.types)).toEqual([
      { title: "Skis", path: "", count: 2 },
      { title: "Goggles", path: "", count: 1 },
      { title: "Ski Boots", path: "", count: 1 },
    ]);
    expect(parseShopifyProducts({ nope: true })).toBeNull();
  });

  it("leave a brand's and a season's collections out where collections are all there is", () => {
    const list = [{ title: "Skis", path: "/collections/skis" }, { title: "Atomic", path: "/collections/atomic" }, { title: "Winter 2026", path: "/collections/w26" }, { title: "25/26 Boots", path: "/collections/2526" }];
    expect(withoutBrandsAndSeasons(list, new Set(["Atomic"])).map((c) => c.title)).toEqual(["Skis"]);
  });
});

describe("reading a Shopify store", () => {
  afterEach(() => vi.unstubAllGlobals());

  const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });

  it("takes the Product Types the listings use, not thousands of automated collections", async () => {
    const collections = Array.from({ length: 250 }, (_, i) => ({ title: `Mens Atomic Skis ${i}`, handle: `c-${i}` }));
    const fetched: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      fetched.push(url);
      if (url.includes("/products.json")) return json({ products: url.includes("page=1") ? [{ product_type: "Skis", vendor: "Atomic" }, { product_type: "Ski Poles", vendor: "Leki" }] : [] });
      if (url.includes("/collections.json")) return json({ collections });
      return new Response("", { status: 404 });
    }));
    const read = await readWebsite("alpsport.example");
    expect(read.source).toBe("types");
    expect(read.categories.map((c) => c.title)).toEqual(["Ski Poles", "Skis"]);
    expect(fetched.some((u) => u.includes("/collections.json"))).toBe(false);
  });

  it("reads the menu, not the collections, when a store without Product Types has too many to be its menu", async () => {
    const collections = Array.from({ length: 200 }, (_, i) => ({ title: `Collection ${i}`, handle: `c-${i}` }));
    const html = '<nav><a href="/collections/skis">Skis</a><a href="/collections/boots">Ski Boots</a><a href="/collections/goggles">Goggles</a><a href="/collections/atomic">Atomic</a></nav>';
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/products.json")) return json({ products: [{ product_type: "", vendor: "Atomic" }] });
      if (url.includes("/collections.json")) return json({ collections: url.includes("page=1") ? collections : [] });
      return new Response(html, { headers: { "content-type": "text/html" } });
    }));
    const read = await readWebsite("shop.example");
    expect(read.source).toBe("menu");
    expect(read.categories.map((c) => c.title)).toEqual(["Skis", "Ski Boots", "Goggles"]);
  });
});
