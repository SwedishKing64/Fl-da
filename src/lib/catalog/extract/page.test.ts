import { describe, expect, it } from "vitest";
import { basicDetails, decodeEntities, distillPage, extractFromPage, fetchHtml, readProductPage } from "./page";
import { cleanProductUrl, flatHandleOf } from "../page-types";

const PAGE = `<!doctype html><html><head>
<title>Hero GS R22 SPX 12 | Rossignol Australia</title>
<meta name="description" content="Race-bred giant slalom ski.">
<meta property="og:image" content="//cdn.example.com/hero/main.jpg?w=1200">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Hero GS R22","brand":{"@type":"Brand","name":"Rossignol"},"description":"Made for racers &amp; the fast.","image":["https://cdn.example.com/hero/main.jpg","https://cdn.example.com/hero/side.jpg"]}</script>
<script>var tracking = "<img src='x.jpg'>";</script>
<style>.a{color:red}</style>
</head><body>
<header><img src="/img/logo.png" alt="Rossignol logo"></header>
<nav><a href="/skis">Skis</a><a href="/boots">Boots</a></nav>
<main>
  <h1>Hero GS R22</h1>
  <p>The Hero GS R22 is built for the gates.</p><p>Sidecut tuned for 21 m turns.</p>
  <img src="/img/hero-top.jpg" srcset="/img/hero-top-400.jpg 400w, /img/hero-top-1600.jpg 1600w" alt="Hero GS R22 top">
  <img data-src="https://cdn.example.com/hero/tail.webp" alt="Tail">
  <img src="/img/pixel.gif" width="1" height="1">
  <img src="/img/tiny.jpg" width="40" height="40" alt="">
  <img src="/img/icon-cart.svg" alt="cart">
  <h2>Details</h2>
  <ul><li>Radius: 21 m</li><li>Core: Woodcore</li></ul>
  <table><tr><td>Weight</td><td>3.1 kg</td></tr><tr><td>Lengths</td><td>170, 175, 182</td></tr></table>
</main>
<footer>Copyright Rossignol <a href="/privacy">Privacy</a></footer>
</body></html>`;

describe("a link as somebody pastes it", () => {
  it("is made into an https address, or refused with a reason", () => {
    expect(cleanProductUrl("www.rossignol.com/au/hero")).toEqual({ url: "https://www.rossignol.com/au/hero" });
    expect(cleanProductUrl(" <http://shop.example.com/a#top> ")).toEqual({ url: "https://shop.example.com/a" });
    expect(cleanProductUrl("")).toEqual({ error: "" });
    for (const bad of ["ftp://x.com/a", "https://localhost/a", "https://127.0.0.1/a", "https://10.0.0.5/a", "https://[::1]/a", "https://intranet/a", "https://user:pw@x.com/a", "https://x.com:8443/a", "https://db.internal/a"]) {
      expect(cleanProductUrl(bad), bad).toHaveProperty("error");
    }
  });

  it("finds the flat ski a package is made from", () => {
    expect(flatHandleOf("m7-mantra-2027-inc-marker-griffon-binding-package")).toBe("m7-mantra-2027");
    expect(flatHandleOf("m7-mantra-2027")).toBe("m7-mantra-2027");
  });
});

describe("boiling a page down", () => {
  const d = distillPage(PAGE, "https://www.rossignol.com/au/hero-gs");

  it("keeps the product's words and its details, label beside value", () => {
    expect(d.title).toBe("Hero GS R22 SPX 12 | Rossignol Australia");
    expect(d.text).toContain("## Hero GS R22");
    expect(d.text).toContain("The Hero GS R22 is built for the gates.");
    expect(d.text).toContain("## Details");
    expect(d.text).toContain("- Radius: 21 m");
    expect(d.text).toMatch(/Weight \| 3\.1 kg/);
    expect(d.text).toMatch(/Lengths \| 170, 175, 182/);
  });

  it("drops navigation, footers, scripts and styles", () => {
    expect(d.text).not.toContain("Privacy");
    expect(d.text).not.toContain("Boots");
    expect(d.text).not.toContain("tracking");
    expect(d.text).not.toContain("color:red");
  });

  it("reads what the page declares about itself", () => {
    expect(d.structured).toMatchObject({ name: "Hero GS R22", brand: "Rossignol", description: "Made for racers & the fast." });
    expect(d.metaDescription).toBe("Race-bred giant slalom ski.");
  });

  it("lists the product's pictures, declared ones first, and none of the furniture", () => {
    const urls = d.images.map((c) => c.url);
    expect(urls.slice(0, 2)).toEqual(["https://cdn.example.com/hero/main.jpg", "https://cdn.example.com/hero/side.jpg"]);
    expect(urls).toContain("https://www.rossignol.com/img/hero-top-1600.jpg");   // the widest of the srcset
    expect(urls).toContain("https://cdn.example.com/hero/tail.webp");              // lazy-loaded
    expect(urls.some((u) => /logo|pixel|tiny|icon/.test(u))).toBe(false);
    // The og:image is the same picture as the first one, once.
    expect(urls.filter((u) => u.startsWith("https://cdn.example.com/hero/main.jpg"))).toHaveLength(1);
  });

  it("reads character references", () => {
    expect(decodeEntities("Rossignol&reg; &amp; &#8211; &#x2019;s &nbsp;")).toBe("Rossignol® & – ’s  ");
  });
});

describe("reading the page", () => {
  const d = distillPage(PAGE, "https://www.rossignol.com/au/hero-gs");
  const hint = { title: "HERO GS R22 SPX12", brand: "Rossignol" };

  it("tells the model the colour ordered and passes back the colour the pictures show", async () => {
    const seen: string[] = [];
    const out = await extractFromPage(d, { ...hint, colours: ["Black"] }, async (_system, content) => {
      seen.push(content);
      return JSON.stringify({ confident: true, pageTitle: "Hero GS R22", description: "x", features: [], imageNumbers: [1], pictureColour: "Black", note: "ok" });
    });
    expect(seen[0]).toContain("Colour ordered: Black");
    expect(out.pictureColour).toBe("Black");
    const two = await extractFromPage(d, { ...hint, colours: ["Black", "White"] }, async (_system, content) => { seen.push(content); return JSON.stringify({ confident: true, pageTitle: "x", description: "", features: [], imageNumbers: [], note: "" }); });
    expect(seen[1]).toContain("Colours ordered: Black, White");
    expect(two.pictureColour).toBe("");
  });

  it("takes the description, the details and the pictures the model picked, by number", async () => {
    const seen: string[] = [];
    const out = await extractFromPage(d, hint, async (_system, content) => {
      seen.push(content);
      return JSON.stringify({ confident: true, pageTitle: "Hero GS R22", description: "The Hero GS R22 is built for the gates.\n\nSidecut tuned for 21 m turns.", features: ["Radius: 21 m", "Core: Woodcore", "Weight: 3.1 kg"], imageNumbers: [2, 1, 2, 99, 0], note: "Description, 3 details and 2 pictures." });
    });
    expect(seen[0]).toContain("Product ordered: HERO GS R22 SPX12");
    expect(seen[0]).toContain("1. https://cdn.example.com/hero/main.jpg");
    expect(out.images).toEqual(["https://cdn.example.com/hero/side.jpg", "https://cdn.example.com/hero/main.jpg"]);   // by number, once each, none invented
    expect(out).toMatchObject({ confident: true, via: "ai", features: ["Radius: 21 m", "Core: Woodcore", "Weight: 3.1 kg"] });
    expect(out.description).toContain("\n\n");
  });

  it("falls back to what the page declares when the model's answer is unusable", async () => {
    const out = await extractFromPage(d, hint, async () => "not json".slice(0, 0) || undefined);
    expect(out.via).toBe("basic");
    expect(out.description).toBe("Made for racers & the fast.");
    expect(out.images).toEqual(["https://cdn.example.com/hero/main.jpg", "https://cdn.example.com/hero/side.jpg"]);
  });

  it("with no API key still gives the description and pictures the page declares", () => {
    expect(basicDetails(d)).toMatchObject({ via: "basic", confident: true, pageTitle: "Hero GS R22" });
  });
});

describe("fetching it", () => {
  const ok = (body: string, init: ResponseInit = {}) => new Response(body, { status: 200, headers: { "content-type": "text/html" }, ...init });

  it("follows a redirect, and checks every hop", async () => {
    const calls: string[] = [];
    const out = await fetchHtml("https://a.example.com/x", async (u) => {
      calls.push(String(u));
      return String(u).endsWith("/x") ? new Response(null, { status: 301, headers: { location: "/y" } }) : ok("<html>hi</html>");
    });
    expect(calls).toEqual(["https://a.example.com/x", "https://a.example.com/y"]);
    expect(out.html).toBe("<html>hi</html>");
    await expect(fetchHtml("https://a.example.com/x", async () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } }))).rejects.toThrow(/not a public website/);
    await expect(fetchHtml("https://a.example.com/x", async () => new Response(null, { status: 302, headers: { location: "https://localhost/admin" } }))).rejects.toThrow(/not a public website/);
  });

  it("says plainly why a page could not be had", async () => {
    await expect(fetchHtml("https://a.example.com/x", async () => new Response("no", { status: 403 }))).rejects.toThrow(/refused an automated visit/);
    await expect(fetchHtml("https://a.example.com/x", async () => new Response("no", { status: 404 }))).rejects.toThrow(/404/);
    await expect(fetchHtml("https://a.example.com/x", async () => new Response("%PDF", { status: 200, headers: { "content-type": "application/pdf" } }))).rejects.toThrow(/not a web page/);
    await expect(fetchHtml("https://a.example.com/x", async () => { throw new Error("ECONNREFUSED"); })).rejects.toThrow(/could not be reached/);
  });

  it("tries the API's own fetch when the site turns this server away, and says so when that fails too", async () => {
    const blocked = async () => new Response("no", { status: 403 });
    const found = { description: "Built for the gates.", features: ["Radius: 21 m"], images: [], pageTitle: "Hero", confident: true, sourceUrl: "https://a.example.com/x", via: "ai" as const, note: "read through the API" };
    expect(await readProductPage("https://a.example.com/x", { title: "X" }, { fetcher: blocked, viaModel: async () => found })).toEqual(found);
    await expect(readProductPage("https://a.example.com/x", { title: "X" }, { fetcher: blocked, viaModel: async () => null })).rejects.toThrow(/refused an automated visit/);
    // A page that does not exist, or an address that is not a website, is not worth a second try.
    let asked = 0;
    await expect(readProductPage("https://a.example.com/x", { title: "X" }, { fetcher: async () => new Response("no", { status: 404 }), viaModel: async () => { asked++; return found; } })).rejects.toThrow(/404/);
    await expect(readProductPage("https://localhost/x", { title: "X" }, { viaModel: async () => { asked++; return found; } })).rejects.toThrow(/not a public website/);
    expect(asked).toBe(0);
  });

  it("refuses an empty shell that only a browser can fill", async () => {
    await expect(readProductPage("https://a.example.com/x", { title: "X" }, { fetcher: async () => ok("<html><head><title>App</title></head><body><div id=root></div><script src=a.js></script></body></html>"), viaModel: async () => null })).rejects.toThrow(/until a browser runs it/);
  });

  it("reads a whole page end to end", async () => {
    const out = await readProductPage("https://www.rossignol.com/au/hero-gs", { title: "HERO GS R22 SPX12" }, {
      fetcher: async () => ok(PAGE),
      ask: async () => JSON.stringify({ confident: true, pageTitle: "Hero GS R22", description: "Built for the gates.", features: ["Radius: 21 m"], imageNumbers: [1], note: "ok" }),
    });
    expect(out).toMatchObject({ description: "Built for the gates.", features: ["Radius: 21 m"], images: ["https://cdn.example.com/hero/main.jpg"], sourceUrl: "https://www.rossignol.com/au/hero-gs" });
  });
});
