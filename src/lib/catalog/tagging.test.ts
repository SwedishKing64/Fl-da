import { describe, expect, it } from "vitest";
import { backcountryShelfTags, isBackcountryShelf, isSkin, skinType, sectionsFor, productTypeFor, headingTags, spellHeading, BACKCOUNTRY_BINDING_TAG, BACKCOUNTRY_BOOT_TAG, BOARD_DISCIPLINES, crossShelfTags, DEFAULT_TAGGING, EVERGREEN_SEASON, SKI_DISCIPLINES, BAG_TAGS, MANUAL_SEASON, TOURING_SKI_TAG, bagTags, clothingContextTags, isSkinAccessory, bindingType, bootTags, disciplinesFor, snowboardBindingTags, needsBindingKind, TAG_SPELLING, generalTags, isHardgood, isManualTag, isNotOurs, isNotLearnable, isRuleGenerated, isShopifyGenerated, needsSectionChoice, normaliseGenders, seasonFor, slugTag, tagsFor, withoutGenerated, houseTagFor, initialsFrom } from "./tagging";
import { SNOW_OUTDOOR_TAXONOMY, resolveType } from "./taxonomy";

describe("the six general tags", () => {
  it("writes them in the shop's order: type, section, season, house, vendor, gender", () => {
    expect(generalTags({ type: "Snowboard Boots", vendor: "Burton", genders: ["mens"] })).toEqual([
      "snowboard-boots",
      "snowboard",
      "2026",
      "123abc",
      "burton",
      "mens",
    ]);
  });

  it("runs boards and skis a season ahead, and nothing else", () => {
    expect(seasonFor("Snowboards")).toBe(2027);
    expect(seasonFor("Skis")).toBe(2027);
    expect(seasonFor("Ski Packages")).toBe(2027);
    // Boots and bindings stay on the current season: the shop has fourteen bindings and eight
    // boots on 2026 and none on 2027, against ten boards on 2027.
    expect(seasonFor("Snowboard Bindings")).toBe(2026);
    expect(seasonFor("Snowboard Boots")).toBe(2026);
    expect(seasonFor("Ski Boots")).toBe(2026);
    expect(seasonFor("Snow Jackets")).toBe(2026);
    expect(seasonFor("Ski Poles")).toBe(2026);
  });

  it("does not treat a bag or a tuning tool as a hardgood just because it says snowboard", () => {
    expect(isHardgood("Snowboard Bags")).toBe(false);
    expect(isHardgood("Snowboard Tuning")).toBe(false);
    expect(isHardgood("Ski & Boot Bags")).toBe(false);
    expect(isHardgood("Other Snowboard Accessories")).toBe(false);
  });

  it("leaves a unisex product with no gender tag at all", () => {
    const tags = generalTags({ type: "Snowboard Accessories", vendor: "Burton", genders: [], section: "Snowboard" });
    expect(tags).not.toContain("mens");
    expect(tags).not.toContain("womens");
    expect(tags).toEqual(["snowboard-accessories", "snowboard", "2026", "123abc", "burton"]);
  });

  it("gives a unisex garment both genders, because it belongs on both pages", () => {
    // All seventy snow garments in the exports carry a gender and none carries none, so a garment
    // is never left bare the way a stomp pad above is. Eight of them carry both.
    const tags = generalTags({ type: "Snow Socks", vendor: "Burton", genders: [] });
    expect(tags).toContain("mens");
    expect(tags).toContain("womens");
  });

  it("still leaves a hardgood alone when it has no gender", () => {
    expect(generalTags({ type: "Ski Tuning", vendor: "Swix", genders: [] })).not.toContain("mens");
  });

  it("tags socks both ways, because the shop asked for both", () => {
    // The twelve pairs in the exports carry "socks" and the menu calls the shelf "Snow Socks".
    // Asked for directly: carry both rather than pick, so the product is on either page.
    const tags = generalTags({ type: "Snow Socks", vendor: "Burton", genders: ["mens"] });
    expect(tags).toContain("socks");
    expect(tags).toContain("snow socks");
    expect(tags).toContain("snow-clothing");
    // The live spelling leads; the menu's name follows it.
    expect(tags.indexOf("socks")).toBeLessThan(tags.indexOf("snow socks"));
  });

  it("carries both spellings of a shelf the shop already writes two ways", () => {
    // 26 products tagged "hiking boots" and 2 tagged "hiking-boots"; 40 "ski packages" and 1
    // "ski-packages". Picking one would leave the others' page short, so both go on.
    expect(tagsFor("Hiking Boots")).toEqual(["hiking boots", "hiking-boots"]);
    expect(tagsFor("Ski Packages")).toEqual(["ski packages", "ski-packages"]);
  });

  it("gives a shelf with one spelling exactly one tag", () => {
    expect(tagsFor("Snow Jackets")).toEqual(["snow jackets"]);
    expect(tagsFor("Snowboard Boots")).toEqual(["snowboard-boots"]);
  });

  it("types a garment as its heading, since Apparel is not a Type this shop has", () => {
    expect(productTypeFor("Snow Socks")).toBe("Snow Clothing");
    expect(productTypeFor("Snow Jackets")).toBe("Snow Clothing");
  });

  it("carries both genders when a product is sold to both", () => {
    const tags = generalTags({ type: "Snowboards", vendor: "Burton", genders: ["mens", "womens"] });
    expect(tags.slice(-2)).toEqual(["mens", "womens"]);
  });

  it("asks for a section only where a type really sits in two menus", () => {
    expect(needsSectionChoice("Goggles")).toBe(true); // Ski and Snowboard
    // Gaiters appears under Clothing and Outdoor but is one product on both shelves, so there is
    // nothing to ask: it takes both.
    expect(needsSectionChoice("Gaiters")).toBe(false);
    expect(needsSectionChoice("Snowboard Boots")).toBe(false);
    // Given the choice, it is honoured rather than guessed.
    expect(generalTags({ type: "Goggles", vendor: "Burton", genders: [], section: "Snowboard" })[1]).toBe("snowboard");
  });

  it("slugs a type the way the catalogue does", () => {
    expect(slugTag("Snowboard Boots")).toBe("snowboard-boots");
    expect(slugTag("Ski & Boot Bags")).toBe("ski-and-boot-bags");
    expect(slugTag("3+ Person Tents")).toBe("3-person-tents");
  });

  it("lets a year be forced for old stock", () => {
    expect(generalTags({ type: "Snowboards", vendor: "Burton", genders: [], year: 2025 })).toContain("2025");
  });

  /**
   * The marker names whoever built the listing, and the default names nobody.
   *
   * It used to default to "123abc-js" — one real person's initials, stamped on everything. Across
   * the 967 products in the shop's ten exports the marker takes eleven forms (zb on 453, bj on 229,
   * js on 120, ay on 98, and seven rarer), mixed together inside every single export, so it is not
   * derivable from the product and a constant was right 12% of the time.
   */
  it("carries whoever built the listing, and defaults to nobody in particular", () => {
    expect(DEFAULT_TAGGING.houseTag).toBe("123abc");
    expect(DEFAULT_TAGGING.houseTag).not.toMatch(/-[a-z]{2}$/);
    expect(houseTagFor("js")).toBe("123abc-js");
    expect(houseTagFor("ZB")).toBe("123abc-zb");
    expect(houseTagFor("")).toBe("123abc");
    const tags = generalTags({ type: "Snow Jackets", vendor: "Burton", genders: [] }, { houseTag: houseTagFor("bj"), currentYear: 2026 });
    expect(tags).toContain("123abc-bj");
  });

  it("reads initials from a name the way the shop writes them", () => {
    expect(initialsFrom("Zoe Bell")).toBe("zb");
    expect(initialsFrom("justin sam")).toBe("js");
    expect(initialsFrom("Anna May Wright")).toBe("aw");
    expect(initialsFrom("Dee")).toBe("de");
    expect(initialsFrom("  ")).toBe("");
  });

  it("never repeats a tag", () => {
    const tags = generalTags({ type: "Snowboards", vendor: "Snowboards", genders: [] });
    expect(new Set(tags).size).toBe(tags.length);
  });
});

describe("clothing", () => {
  it("tags a womens snow jacket with gender and garment", () => {
    expect(generalTags({ type: "Snow Jackets", vendor: "Burton", genders: ["womens"], section: "Clothing" })).toEqual([
      "snow jackets",
      "snow-clothing",
      "clothing",
      "2026",
      "123abc",
      "burton",
      "womens",
    ]);
  });

  it("hyphenates every garment name", () => {
    expect(generalTags({ type: "Snow Pants", vendor: "Burton", genders: ["mens"], section: "Clothing" })).toContain("snow pants");
    expect(generalTags({ type: "Down Jackets", vendor: "Burton", genders: ["womens"], section: "Clothing" })).toContain("down-jackets");
    expect(generalTags({ type: "Rainwear", vendor: "Burton", genders: ["mens"], section: "Clothing" })).toContain("rainwear");
    // The spellings are not a rule to be derived but a record of what the catalogue contains, so
    // the map holds one entry per shelf the shop spells differently from its menu name.
    expect(TAG_SPELLING["Snow Jackets"]).toBe("snow jackets");
    expect(TAG_SPELLING["Backcountry Gear"]).toBe("back-country-gear");
    expect(TAG_SPELLING["Trekking Poles"]).toBeUndefined(); // hyphenated live, so the slug is right
  });

  it("tags a kids item kids, with no gender beside it", () => {
    const tags = generalTags({ type: "Snow Jackets", vendor: "Burton", genders: ["kids"], section: "Clothing" });
    expect(tags).toContain("kids");
    expect(tags).not.toContain("mens");
    expect(tags).not.toContain("womens");
  });

  it("drops mens and womens the moment a product is a kids one", () => {
    expect(normaliseGenders(["mens", "kids"])).toEqual(["kids"]);
    expect(normaliseGenders(["mens", "womens"])).toEqual(["mens", "womens"]);
  });
});

describe("tags Shopify maintains for itself", () => {
  it("recognises price bands, sizes and colours", () => {
    for (const tag of ["500-600", "100-200", "under-50", "size-medium", "size-9", "length-156", "length-156w", "colour-true-black", "color-black"]) {
      expect(isShopifyGenerated(tag), tag).toBe(true);
    }
  });

  it("leaves the shop's own tags alone", () => {
    for (const tag of ["snow jackets", "burton", "2026", "123abc", "mens", "clearance", "snow-sale"]) {
      expect(isShopifyGenerated(tag), tag).toBe(false);
    }
  });

  it("does not mistake a year or a model number for a price band", () => {
    expect(isShopifyGenerated("2026")).toBe(false);
    expect(isShopifyGenerated("step-on-boots")).toBe(false);
  });

  it("strips them from a list in one go", () => {
    expect(withoutGenerated(["snow jackets", "size-medium", "burton", "500-600", "colour-true-black"]))
      .toEqual(["snow jackets", "burton"]);
  });

  it("never writes one itself", () => {
    const tags = generalTags({ type: "Snow Jackets", vendor: "Burton", genders: ["womens"], section: "Clothing" });
    expect(tags.filter(isShopifyGenerated)).toEqual([]);
  });
});

describe("tags a person applies by hand", () => {
  it("knows the sale and stocktake tags", () => {
    for (const tag of ["snow sale", "snow-sale", "clearance", "snow clearance", "bonus10", "bonus15", "scan"]) {
      expect(isManualTag(tag), tag).toBe(true);
    }
  });

  it("does not mistake a product tag for a promotion", () => {
    for (const tag of ["snow jackets", "snowboards", "burton", "mens", "2026", "snow-socks"]) {
      expect(isManualTag(tag), tag).toBe(false);
    }
  });

  it("treats Shopify's and the shop's own hand-applied tags as equally off limits", () => {
    expect(isNotOurs("size-medium")).toBe(true);
    expect(isNotOurs("clearance")).toBe(true);
    // A garment tag is the importer's to write, even though a template must not learn it.
    expect(isNotOurs("snow jackets")).toBe(false);
    expect(isNotLearnable("snow jackets")).toBe(true);
  });

  it("never writes one itself", () => {
    const tags = generalTags({ type: "Snow Jackets", vendor: "Burton", genders: ["mens"], section: "Clothing" });
    expect(tags.filter(isNotOurs)).toEqual([]);
  });
});

describe("products that do not change from year to year", () => {
  it("carries the evergreen marker instead of a season, never as well", () => {
    const tags = generalTags({ type: "Snowboard Accessories", vendor: "Burton", genders: [], evergreen: true, section: "Snowboard" });
    expect(tags).toContain(EVERGREEN_SEASON);
    expect(tags).not.toContain("2026");
    expect(tags).not.toContain("2027");
    expect(tags.filter((t) => /^\d{4}$/.test(t))).toEqual([EVERGREEN_SEASON]);
  });

  it("applies to any kind of product, not just accessories", () => {
    // Three pairs of boots in the shop's own catalogue are evergreen.
    const tags = generalTags({ type: "Snowboard Boots", vendor: "Burton", genders: ["womens"], evergreen: true });
    expect(tags).toContain(EVERGREEN_SEASON);
    expect(tags).not.toContain("2027");
  });

  it("is a judgement, so it is never learned as a brand convention", () => {
    expect(isManualTag(EVERGREEN_SEASON)).toBe(true);
    expect(isNotOurs(EVERGREEN_SEASON)).toBe(true);
  });

  it("still seasons a normal product", () => {
    expect(generalTags({ type: "Snowboard Accessories", vendor: "Burton", genders: [], section: "Snowboard" })).toContain("2026");
  });
});

describe("skis and snowboards", () => {
  it("tags a board sold with a binding as a package", () => {
    const tags = generalTags({ type: "Snowboards", vendor: "Burton", genders: ["mens"], withBindings: true });
    expect(tags).toContain("snowboard packages");
  });

  it("uses the ski package tag for a ski", () => {
    expect(generalTags({ type: "Skis", vendor: "Atomic", genders: ["mens"], withBindings: true })).toContain("ski packages");
    expect(generalTags({ type: "Skis", vendor: "Atomic", genders: ["mens"] })).not.toContain("ski packages");
  });

  it("carries every discipline a board is, not just one", () => {
    // The shop's own Family Tree Alekesam is both.
    const tags = generalTags({
      type: "Snowboards", vendor: "Burton", genders: ["mens"],
      disciplines: ["Freeride & Powder Boards", "Freestyle & All-Mountain Boards"],
    });
    expect(tags).toContain("freeride and powder boards");
    expect(tags).toContain("freestyle and all-mountain boards");
  });

  it("offers the seven ski disciplines and the three board ones", () => {
    expect(SKI_DISCIPLINES).toHaveLength(7);
    expect(SKI_DISCIPLINES).toContain("Mogul Skis");
    expect(SKI_DISCIPLINES).toContain("Frontside & All-Mountain Skis");
    expect(BOARD_DISCIPLINES).toEqual(["Freestyle & All-Mountain Boards", "Freeride & Powder Boards", "Park Boards"]);
  });

  it("will not put a board discipline on a ski", () => {
    const tags = generalTags({ type: "Skis", vendor: "Atomic", genders: ["mens"], disciplines: ["Park Boards", "Carving Skis"] });
    expect(tags).toContain("carving skis");
    expect(tags).not.toContain("park boards");
  });

  it("offers no disciplines to something that is neither", () => {
    expect(disciplinesFor("Snow Jackets")).toEqual([]);
    expect(disciplinesFor("Sleeping Bags")).toEqual([]);
    expect(disciplinesFor("Snowboards")).toEqual(BOARD_DISCIPLINES);
    expect(disciplinesFor("Skis")).toEqual(SKI_DISCIPLINES);
  });

  it("puts the whole lot together in order", () => {
    expect(generalTags({
      type: "Snowboards", vendor: "Burton", genders: ["mens"],
      withBindings: true, disciplines: ["Park Boards"],
    })).toEqual([
      "snowboards", "snowboard", "2027", "123abc", "burton", "mens", "snowboard packages", "park boards",
    ]);
  });
});

describe("ski bindings", () => {
  it("turns a supplier's generic ski binding into the right one of the two", () => {
    expect(generalTags({ type: "Ski Binding", vendor: "Marker", genders: [], describedAs: "Marker Griffon 13 ID" }))
      .toContain("alpine-bindings");
    expect(generalTags({ type: "Ski Binding", vendor: "Dynafit", genders: [], describedAs: "Dynafit Speed Radical" }))
      .toContain("touring-bindings");
  });

  it("takes an explicit answer over reading the text", () => {
    const tags = generalTags({ type: "Ski Binding", vendor: "Salomon", genders: [], describedAs: "Salomon Shift MNC 13", bindingKind: "Alpine Bindings" });
    expect(tags).toContain("alpine-bindings");
    expect(tags).not.toContain("touring-bindings");
  });

  it("leaves it undecided rather than guessing when the text does not say", () => {
    expect(bindingType({ type: "Ski Binding", describedAs: "Binding 12" })).toBeUndefined();
  });

  it("does not re-decide a type that is already specific", () => {
    expect(needsBindingKind("Alpine Bindings")).toBe(false);
    expect(needsBindingKind("Touring Bindings")).toBe(false);
    expect(needsBindingKind("Ski Binding")).toBe(true);
    expect(generalTags({ type: "Touring Bindings", vendor: "ATK", genders: [] })).toContain("touring-bindings");
  });

  it("does not ask a snowboard binding whether it tours", () => {
    // Snowboard bindings split too, but by which boots they take, not by walking uphill.
    expect(needsBindingKind("Snowboard Bindings")).toBe(false);
    expect(generalTags({ type: "Snowboard Bindings", vendor: "Burton", genders: ["womens"], describedAs: "Burton Lexa Re:Flex" }))
      .toEqual(["snowboard-bindings", "snowboard", "2026", "123abc", "burton", "womens", "traditional-bindings"]);
  });
});

describe("boots", () => {
  it("tags a Step On snowboard boot", () => {
    expect(generalTags({ type: "Snowboard Boots", vendor: "Burton", genders: ["mens"], describedAs: "Men's Ruler Step On® Snowboard Boots 2025" }))
      .toEqual(["snowboard-boots", "snowboard", "2026", "123abc", "burton", "mens", "step-on-boots"]);
  });

  it("tags a BOA snowboard boot traditional, not BOA", () => {
    const tags = generalTags({ type: "Snowboard Boots", vendor: "Burton", genders: ["mens"], describedAs: "Men's Ruler BOA® Snowboard Boots 2025" });
    expect(tags).toContain("traditional-boots");
    expect(tags).not.toContain("boa-ski-boots");
    expect(tags).not.toContain("step-on-boots");
  });

  it("carries a ski boot's discipline and closure together", () => {
    const tags = generalTags({ type: "Ski Boots", vendor: "Atomic", genders: ["mens"], describedAs: "Atomic Hawx Ultra XTD 130 BOA" });
    expect(tags).toContain("touring-boots");
    expect(tags).toContain("boa-ski-boots");
  });

  it("treats a plain resort ski boot as alpine with buckles", () => {
    expect(bootTags("Ski Boots", "Atomic Hawx Ultra 100")).toEqual(["alpine-boots", "buckle-ski-boots"]);
  });

  it("leaves non-boots alone", () => {
    expect(bootTags("Snowboards", "Custom 2027")).toEqual([]);
    expect(bootTags("Snow Jackets", "A jacket")).toEqual([]);
  });

  it("adds nothing when there is no name to read, rather than guessing", () => {
    expect(bootTags("Snowboard Boots")).toEqual([]);
    expect(bootTags("Ski Boots", "   ")).toEqual([]);
  });
});

describe("snowboard bindings", () => {
  it("tags which boots the binding takes", () => {
    expect(generalTags({ type: "Snowboard Bindings", vendor: "Burton", genders: ["mens"], describedAs: "Men's Step On® Genesis EST® Snowboard Bindings 2026" }))
      .toContain("step-on-bindings");
    expect(generalTags({ type: "Snowboard Bindings", vendor: "Burton", genders: ["womens"], describedAs: "Women's Lexa Re:Flex Snowboard Bindings 2026" }))
      .toContain("traditional-bindings");
  });

  it("adds nothing without a name to read", () => {
    expect(snowboardBindingTags("Snowboard Bindings")).toEqual([]);
  });

  it("leaves ski bindings out of it", () => {
    expect(snowboardBindingTags("Alpine Bindings", "Marker Griffon 13")).toEqual([]);
  });
});

describe("bags", () => {
  it("puts all three bag tags on a board bag, the way the shop does", () => {
    const tags = generalTags({ type: "Snowboard Bags", vendor: "Burton", genders: [], describedAs: "Gig Snowboard Bag 2026" });
    expect(tags).toContain("snow-bags");
    expect(tags).toContain("snowboard-bags");
    expect(tags).toContain("ski-and-boot-bags");
  });

  it("does the same for a ski bag, since it is the same rack", () => {
    expect(bagTags("Ski & Boot Bags", "Atomic Double Ski Bag")).toEqual([...BAG_TAGS]);
  });

  it("spots a bag named inside a general accessories line", () => {
    expect(bagTags("Snowboard Accessories", "Space Sack Snowboard Bag 2026")).toEqual([...BAG_TAGS]);
  });

  it("leaves everything that is not a bag alone", () => {
    expect(bagTags("Snowboard Boots", "Men's Ruler Step On Boots")).toEqual([]);
    expect(bagTags("Snow Jackets", "A jacket")).toEqual([]);
    expect(bagTags("Snowboard Accessories", "Aluminium Stud Stomp Pad")).toEqual([]);
  });
});

describe("what the three new brand exports corrected", () => {
  it("carries the cross-country tag on every touring ski", () => {
    const tags = generalTags({ type: "Skis", vendor: "Volkl", genders: ["mens"], disciplines: ["Touring Skis"] });
    expect(tags).toContain("touring skis");
    expect(tags).toContain(TOURING_SKI_TAG);
    // Not on a ski that is not a touring ski.
    expect(generalTags({ type: "Skis", vendor: "Volkl", genders: ["mens"], disciplines: ["Carving Skis"] }))
      .not.toContain(TOURING_SKI_TAG);
  });

  it("puts all four bag tags on a bag", () => {
    expect(bagTags("Ski & Boot Bags", "Double Ski Bag")).toEqual([
      "snow-bags", "snowboard-bags", "ski-and-boot-bags", "ski-and-snowboard-bags",
    ]);
  });

  it("treats the second sentinel as hand-applied, like the first", () => {
    expect(isNotOurs(MANUAL_SEASON)).toBe(true);
    expect(isManualTag("2998")).toBe(true);
  });
});

describe("a ski sold as a package is still a ski", () => {
  /**
   * The shop's Blaze 94 W is one of four packages in the live catalogue missing its skis tag —
   * a package is not a separate kind of product, it is a ski with a binding already on it.
   */
  it("carries the type, the section and the package tag together", () => {
    const tags = generalTags({
      type: "Skis", vendor: "Volkl", genders: ["womens"], withBindings: true,
      disciplines: ["Frontside & All-Mountain Skis", "Freeride & Powder Skis"],
      describedAs: "Blaze 94 W 2027 inc White Marker Squire Binding Package",
    });
    expect(tags).toContain("skis");          // it is a ski
    expect(tags).toContain("ski");           // it lives in the Ski menu
    expect(tags).toContain("ski packages");  // and it comes with a binding
    expect(tags).toContain("frontside and all-mountain skis");
    expect(tags).toContain("freeride and powder skis");
  });

  it("does the same for a board package", () => {
    const tags = generalTags({ type: "Snowboards", vendor: "Burton", genders: ["mens"], withBindings: true, disciplines: ["Park Boards"] });
    expect(tags).toContain("snowboards");
    expect(tags).toContain("snowboard");
    expect(tags).toContain("snowboard packages");
  });
});

describe("touring bindings reach the backcountry shelf", () => {
  it("tags a touring binding for Backcountry as well as Ski", () => {
    const tags = generalTags({ type: "Touring Bindings", vendor: "Dynafit", genders: [] });
    expect(tags).toContain("touring-bindings");          // the Ski menu, from its Type
    expect(tags).toContain(BACKCOUNTRY_BINDING_TAG);     // and the Backcountry menu
  });

  it("reaches it from a supplier's generic ski binding too", () => {
    const tags = generalTags({ type: "Ski Binding", vendor: "Marker", genders: [], describedAs: "Marker Alpinist 12 tech binding" });
    expect(tags).toContain("touring-bindings");
    expect(tags).toContain(BACKCOUNTRY_BINDING_TAG);
  });

  /** Both shelves, the same way a touring boot keeps the ski boot shelf. */
  it("keeps the ski binding shelf as well as the backcountry one", () => {
    expect(generalTags({ type: "Touring Bindings", vendor: "Dynafit", genders: [] })).toContain("ski-bindings");
    expect(generalTags({ type: "Ski Binding", vendor: "ATK", genders: [], describedAs: "ATK Raider 12 tech binding" }))
      .toContain("ski-bindings");
  });

  it("leaves an alpine binding on the ski side only", () => {
    const tags = generalTags({ type: "Ski Binding", vendor: "Marker", genders: [], describedAs: "Marker Griffon 13 ID" });
    expect(tags).toContain("alpine-bindings");
    expect(tags).not.toContain(BACKCOUNTRY_BINDING_TAG);
  });

  it("does not put a snowboard binding there", () => {
    expect(crossShelfTags("Snowboard Bindings")).toEqual([]);
    expect(crossShelfTags("Alpine Bindings")).toEqual([]);
  });
});

describe("touring boots reach the backcountry shelf", () => {
  it("tags a boot typed as touring", () => {
    const tags = generalTags({ type: "Touring Boots", vendor: "Scarpa", genders: ["mens"], describedAs: "Scarpa Maestrale RS" });
    expect(tags).toContain("touring-boots");
    expect(tags).toContain(BACKCOUNTRY_BOOT_TAG);
  });

  /** A touring boot belongs in both sections, so browsing ski boots must still find it. */
  it("keeps the ski boot shelf as well as the backcountry one", () => {
    expect(generalTags({ type: "Touring Boots", vendor: "Scarpa", genders: ["mens"], describedAs: "Scarpa Maestrale RS" }))
      .toContain("ski-boots");
    expect(generalTags({ type: "Ski Boots", vendor: "Atomic", genders: ["mens"], describedAs: "Atomic Hawx Ultra XTD 130" }))
      .toContain("ski-boots");
  });

  it("tags one the classifier read as touring from a generic ski boot line", () => {
    const tags = generalTags({ type: "Ski Boots", vendor: "Atomic", genders: ["mens"], describedAs: "Atomic Hawx Ultra XTD 130 BOA" });
    expect(tags).toContain("touring-boots");
    expect(tags).toContain("boa-ski-boots");
    expect(tags).toContain(BACKCOUNTRY_BOOT_TAG);
  });

  it("leaves a resort boot on the ski side alone", () => {
    const tags = generalTags({ type: "Ski Boots", vendor: "Atomic", genders: ["mens"], describedAs: "Atomic Hawx Ultra 100" });
    expect(tags).toContain("alpine-boots");
    expect(tags).not.toContain(BACKCOUNTRY_BOOT_TAG);
  });

  it("does not send a snowboard boot there", () => {
    expect(crossShelfTags("Snowboard Boots", ["traditional-boots"])).toEqual([]);
  });
});

describe("climbing skins", () => {
  it("carries both spellings, from either shelf", () => {
    for (const type of ["Skins", "Climbing Skins"]) {
      const tags = generalTags({ type, vendor: "Pomoca", genders: [] });
      expect(tags, type).toContain("skin");
      expect(tags, type).toContain("skins");
    }
  });

  it("keeps its own type tag alongside them", () => {
    expect(generalTags({ type: "Climbing Skins", vendor: "Black Diamond", genders: [] })).toContain("climbing skins");
  });

  it("does not put the skin tags on anything else", () => {
    // Touring skis reach backcountry, but not by being skins.
    expect(crossShelfTags("Touring Skis")).not.toContain("skin");
    expect(crossShelfTags("Snow Jackets")).toEqual([]);
  });
});

describe("reaching a backcountry shelf takes the section too", () => {
  /** A shelf tag alone names a page inside a section the product is not in, so nobody reaches it. */
  it("puts a touring binding in both sections", () => {
    const tags = generalTags({ type: "Ski Binding", vendor: "ATK", genders: [], describedAs: "ATK Raider 12 tech binding" });
    expect(tags).toContain("ski");
    expect(tags).toContain("backcountry");
    expect(tags).toContain("alpine-touring-bindings");
  });

  it("does the same for a touring boot", () => {
    const tags = generalTags({ type: "Ski Boots", vendor: "Scarpa", genders: ["mens"], describedAs: "Scarpa Maestrale RS touring boot" });
    expect(tags).toContain("ski");
    expect(tags).toContain("backcountry");
    expect(tags).toContain("alpine-touring-boots");
  });

  it("leaves a resort binding and boot in the ski section alone", () => {
    expect(generalTags({ type: "Ski Binding", vendor: "Marker", genders: [], describedAs: "Marker Griffon 13 ID" }))
      .not.toContain("backcountry");
    expect(generalTags({ type: "Ski Boots", vendor: "Atomic", genders: ["mens"], describedAs: "Atomic Hawx Ultra 100" }))
      .not.toContain("backcountry");
  });
});

describe("a tag is an exact string", () => {
  /**
   * The catalogue is the authority on spelling, not a rule: a heading is hyphenated and a sub-link
   * is usually spaced, but trekking-poles, torches-and-lighting, avalanche-equipment, ski-gloves and
   * the bag family are sub-links that are hyphenated anyway.
   */
  it("writes each shelf the way the shop writes it", () => {
    const written = (type: string) => generalTags({ type, vendor: "Vendor", genders: [] });
    expect(written("Snow Jackets")).toContain("snow jackets");
    expect(written("Down Sleeping Bags")).toContain("down sleeping bags");
    expect(written("Hiking Boots")).toContain("hiking boots");
    expect(written("Trekking Poles")).toContain("trekking-poles");       // hyphenated live
    expect(written("Torches & Lighting")).toContain("torches-and-lighting");
    expect(written("Avalanche Equipment")).toContain("avalanche-equipment");
  });

  it("keeps the heading hyphenated beneath a spaced sub-link", () => {
    const tags = generalTags({ type: "Ascenders & Descenders", vendor: "Petzl", genders: [] });
    expect(tags).toContain("ascenders and descenders");
    expect(tags).toContain("climbing-and-abseiling");
  });

  it("reads a shelf back whichever way it is spelled", () => {
    // Either spelling of a shelf is recognised, so an export written the other way still resolves.
    expect(resolveType("freeride and powder skis")).toBe("Freeride & Powder Skis");
    expect(resolveType("Packs and Bags")).toBe("Packs & Bags");
    expect(resolveType("Climbing and Abseiling")).toBe("Climbing & Abseiling");
    expect(isRuleGenerated("snow jackets")).toBe(true);
    expect(isRuleGenerated("snow-jackets")).toBe(true);
  });

  it("matches a discipline against what was already worked out, not its spelling", () => {
    // The touring discipline is written "touring skis"; the cross-shelf rule still finds it.
    const tags = generalTags({ type: "Skis", vendor: "Volkl", genders: ["mens"], disciplines: ["Touring Skis"] });
    expect(tags).toContain("touring skis");
    expect(tags).toContain("alpine-touring-skis");
    expect(tags).toContain("backcountry");
  });
});

describe("the Type column holds the heading, never the sub-link", () => {
  /** True of all 673 typed products in the shop's exports: not one is typed with a sub-link. */
  it("resolves a sub-link up to the heading it sits under", () => {
    expect(productTypeFor("Down Sleeping Bags")).toBe("Sleeping Bags");
    expect(productTypeFor("2 Person Tents")).toBe("Tents");
    expect(productTypeFor("Air Mats")).toBe("Sleeping Mats");
    expect(productTypeFor("Ski Poles")).toBe("Ski Accessories");
    expect(productTypeFor("Snow Jackets")).toBe("Snow Clothing");
  });

  it("spells the ampersand out, the way the column does", () => {
    expect(productTypeFor("Hiking Packs")).toBe("Packs and Bags");
    expect(productTypeFor("Climbing Harnesses")).toBe("Climbing and Abseiling");
    expect(spellHeading("Stoves & Cooking")).toBe("Stoves and Cooking");
  });

  it("leaves a heading alone", () => {
    for (const heading of ["Tents", "Sleeping Bags", "Ski Accessories", "Snowboard Boots"]) {
      expect(productTypeFor(heading), heading).toBe(heading);
      expect(headingTags(heading), heading).toEqual([]); // it is its own heading, not under one
    }
  });

  it("waits to be told when the menu files a product under two headings", () => {
    expect(productTypeFor("Climbing Shoes")).toBeUndefined();
    expect(productTypeFor("Climbing Shoes", "Footwear")).toBe("Footwear");
  });

  it("carries the heading as a tag alongside the sub-link", () => {
    const tent = generalTags({ type: "2 Person Tents", vendor: "Nemo", genders: [] });
    expect(tent).toContain("2 person tents");
    expect(tent).toContain("tents");
    expect(tent).toContain("outdoor");

    const bag = generalTags({ type: "Down Sleeping Bags", vendor: "One Planet", genders: ["mens", "womens"] });
    expect(bag).toContain("down sleeping bags");
    expect(bag).toContain("sleeping-bags");
  });
});

describe("outdoor kit", () => {
  /** A tent is the same product next winter, so it carries the evergreen marker, not a year. */
  it("is evergreen rather than seasonal", () => {
    for (const type of ["2 Person Tents", "Down Sleeping Bags", "Stoves", "Hiking Boots", "Trekking Poles", "Daypacks"]) {
      const tags = generalTags({ type, vendor: "Nemo", genders: [] });
      expect(tags, type).toContain(EVERGREEN_SEASON);
      expect(tags, type).not.toContain("2026");
    }
  });

  it("leaves the snow seasons alone", () => {
    expect(generalTags({ type: "Snow Jackets", vendor: "Burton", genders: ["mens"] })).toContain("2026");
    // The audience split keeps the heading as the Type, so a men's board is typed Snowboards.
    expect(generalTags({ type: "Snowboards", vendor: "Burton", genders: ["mens"] })).toContain("2027");
  });

  it("puts a gaiter on both shelves", () => {
    const tags = generalTags({ type: "Gaiters", vendor: "Sea to Summit", genders: [] });
    expect(tags).toContain("gaiters");
    expect(tags).toContain("clothing");
    expect(tags).toContain("outdoor");
    expect(sectionsFor("Gaiters")).toEqual(["Clothing", "Outdoor"]);
  });

  it("takes a gender only where the product has one", () => {
    // A One Planet bag comes in both fits and carries both; a Nemo Riff is cut for one.
    expect(generalTags({ type: "Down Sleeping Bags", vendor: "One Planet", genders: ["mens", "womens"] }))
      .toEqual(expect.arrayContaining(["mens", "womens"]));
    expect(generalTags({ type: "Down Sleeping Bags", vendor: "Nemo", genders: ["womens"] })).not.toContain("mens");
    const unisex = generalTags({ type: "2 Person Tents", vendor: "Nemo", genders: [] });
    for (const g of ["mens", "womens", "kids"]) expect(unisex, g).not.toContain(g);
  });
});

describe("a promotion is never a convention", () => {
  /**
   * "tent sale" sits on all twenty-seven tents in the Nemo export. Learned as a house convention it
   * would have every tent the importer builds afterwards born on markdown.
   */
  it("reads promotions by shape, since they are named after what is on promotion", () => {
    for (const tag of ["tent sale", "easter sale", "outdoor clearance", "tent promo", "snow sale", "clearance", "superseded"]) {
      expect(isManualTag(tag), tag).toBe(true);
      expect(isNotOurs(tag), tag).toBe(true);
      expect(isNotLearnable(tag), tag).toBe(true);
    }
  });

  it("does not mistake a real shelf for one", () => {
    for (const tag of ["ski poles", "tent-accessories", "down sleeping bags", "sleeping-bags", "climbing-shoes"]) {
      expect(isManualTag(tag), tag).toBe(false);
    }
  });
});

describe("the bag shelves are the snow ones", () => {
  /** The word "bags" in a Type is not what puts a product beside the board bags — the menu is. */
  it("keeps sleeping bags and duffels off them", () => {
    for (const type of ["Down Sleeping Bags", "Synthetic Sleeping Bags", "Sleeping Bag Accessories", "Duffels", "Travel Packs"]) {
      expect(bagTags(type), type).toEqual([]);
      const tags = generalTags({ type, vendor: "Sea to Summit", genders: [] });
      for (const bag of BAG_TAGS) expect(tags, `${type} -> ${bag}`).not.toContain(bag);
    }
  });

  it("still catches every snow bag", () => {
    for (const type of ["Snowboard Bags", "Ski & Boot Bags"]) expect(bagTags(type), type).toEqual([...BAG_TAGS]);
    expect(bagTags("Snowboard Accessories", "Burton Wheelie Gig board bag")).toEqual([...BAG_TAGS]);
    expect(bagTags("Ski Accessories", "Thule roof ski bag")).toEqual([...BAG_TAGS]);
  });

  it("reads the product when the Type is not one the shop uses", () => {
    expect(bagTags("", "Dakine Boot Locker boot bag")).toEqual([...BAG_TAGS]);
    expect(bagTags("Stuff Sack", "Sea to Summit compression sack")).toEqual([]);
  });
});

describe("a skin is read, not trusted to its invoice type", () => {
  /** Suppliers file skins under whatever accessories line they have; the shelf is the same one. */
  it("files a skin sold as a general ski accessory", () => {
    const tags = generalTags({ type: "Ski Accessories", vendor: "Pomoca", genders: [], describedAs: "Pomoca Climb Pro 2.0 climbing skin" });
    expect(tags).toContain("skin");
    expect(tags).toContain("skins");
    expect(tags).toContain("climbing skins");
    expect(tags).toContain("backcountry");
    expect(tags).not.toContain("ski-accessories"); // it is a skin, so that is its Type
    expect(skinType({ type: "Ski Accessories", describedAs: "Pomoca Climb Pro 2.0 climbing skin" })).toBe("Skins");
  });

  it("lands a skin identically however it was filed", () => {
    const shelves = ["skin", "skins", "climbing skins", "backcountry"];
    for (const type of ["Skins", "Climbing Skins", "Ski Accessories", "Alpine Touring Accessories", "Other Back-Country Gear"]) {
      const tags = generalTags({ type, vendor: "Pomoca", genders: [], describedAs: "Pomoca Climb Pro 2.0 climbing skin" });
      for (const shelf of shelves) expect(tags, `${type} -> ${shelf}`).toContain(shelf);
    }
  });

  it("leaves a Type that already names something specific alone", () => {
    // A ski described as skin-compatible is a ski.
    const tags = generalTags({ type: "Skis", vendor: "Atomic", genders: ["mens"], describedAs: "Atomic Backland 107, skin compatible tip" });
    expect(tags).toContain("skis");
    expect(tags).not.toContain("skins");
    expect(skinType({ type: "Skis", describedAs: "Atomic Backland 107, skin compatible tip" })).toBeUndefined();
  });

  it("keeps gear for skins on its own shelves", () => {
    expect(isSkin("G3 skin cutter", "Ski Accessories")).toBe(false);
    expect(isSkin("Black Diamond skin glue", "Ski Accessories")).toBe(false);
    const tags = generalTags({ type: "Ski Accessories", vendor: "G3", genders: [], describedAs: "G3 skin cutter" });
    expect(tags).toContain("alpine touring accessories");
    expect(tags).not.toContain("skins");
  });

  it("needs the word, not a hunch", () => {
    expect(isSkin("Pomoca Free Pro 2.0", "Ski Accessories")).toBe(false);
    expect(isSkin(undefined, "Ski Accessories")).toBe(false);
  });
});

describe("every backcountry shelf carries its section", () => {
  /**
   * The section does not come from the menu someone filed the product under — it comes from the
   * shelf the product lands on. A skin filed under Ski is still on a Backcountry page, and without
   * the section tag that page never shows it.
   */
  it("covers every shelf in the Backcountry menu", () => {
    const backcountry = SNOW_OUTDOOR_TAXONOMY.find((s) => s.top === "Backcountry")!;
    for (const group of backcountry.groups) {
      for (const leaf of group.leaves) {
        const tags = generalTags({ type: leaf, vendor: "Test", genders: [] });
        expect(tags, leaf).toContain("backcountry");
      }
    }
  });

  it("keeps the section when a touring product is filed under Ski", () => {
    for (const type of ["Skins", "Climbing Skins", "Alpine Touring Accessories", "Alpine Touring Skis"]) {
      const tags = generalTags({ type, vendor: "Pomoca", genders: [], section: "Ski" });
      expect(tags, type).toContain("ski");
      expect(tags, type).toContain("backcountry");
    }
  });

  it("reads the whole menu, not just the alpine-touring prefix", () => {
    expect(crossShelfTags("Skins")).toContain("backcountry");
    expect(isBackcountryShelf("skins")).toBe(true);
    expect(isBackcountryShelf("avalanche-equipment")).toBe(true);
    expect(isBackcountryShelf("back-country-gear")).toBe(true);
    // The set is keyed by slug, so either spelling of a shelf finds it.
    expect(backcountryShelfTags().has("back-country-gear")).toBe(true);
    expect(isBackcountryShelf("climbing skins")).toBe(true);
    expect(isBackcountryShelf("climbing-skins")).toBe(true);
  });

  it("leaves the resort shelves out of it", () => {
    for (const tag of ["alpine-bindings", "ski-boots", "snow jackets", "goggles", "snowboard-bags"]) {
      expect(isBackcountryShelf(tag), tag).toBe(false);
    }
  });
});

describe("the touring and cross-country shelf holds both", () => {
  it("puts a cross-country ski on it", () => {
    const tags = generalTags({ type: "Cross-Country Skis", vendor: "Fischer", genders: ["mens"] });
    expect(tags).toContain("cross-country-skis");
    expect(tags).toContain(TOURING_SKI_TAG);
  });

  it("and a touring ski, which was already there", () => {
    expect(generalTags({ type: "Skis", vendor: "Volkl", genders: ["mens"], disciplines: ["Touring Skis"] }))
      .toContain(TOURING_SKI_TAG);
  });

  it("but not an ordinary ski", () => {
    expect(generalTags({ type: "Skis", vendor: "Volkl", genders: ["mens"], disciplines: ["Carving Skis"] }))
      .not.toContain(TOURING_SKI_TAG);
    expect(crossShelfTags("Cross-Country Boots")).toEqual([]);
  });
});

describe("touring skis reach the backcountry shelf", () => {
  it("tags a ski typed as an alpine touring ski", () => {
    const tags = generalTags({ type: "Alpine Touring Skis", vendor: "Dynafit", genders: ["mens"] });
    expect(tags).toContain("alpine-touring-skis");
    expect(tags).toContain("backcountry");
  });

  /** The gap: a touring ski that arrives as an ordinary ski whose discipline says it tours. */
  it("tags one arriving as an ordinary ski with a touring discipline", () => {
    const tags = generalTags({ type: "Skis", vendor: "Volkl", genders: ["mens"], disciplines: ["Touring Skis"] });
    expect(tags).toContain("skis");                          // still a ski
    expect(tags).toContain("ski");                           // still in the Ski menu
    expect(tags).toContain("touring skis");
    expect(tags).toContain(TOURING_SKI_TAG);                 // the cross-country shelf
    expect(tags).toContain("alpine-touring-skis");           // and the backcountry one
    expect(tags).toContain("backcountry");
  });

  it("leaves a carving ski out of backcountry", () => {
    const tags = generalTags({ type: "Skis", vendor: "Volkl", genders: ["mens"], disciplines: ["Carving Skis"] });
    expect(tags).not.toContain("alpine-touring-skis");
    expect(tags).not.toContain("backcountry");
  });

  it("keeps alpine touring accessories on their own shelf", () => {
    expect(generalTags({ type: "Alpine Touring Accessories", vendor: "Dynafit", genders: [] }))
      .toContain("alpine touring accessories");
  });
});

describe("backcountry gear and avalanche gear", () => {
  /** Every shelf under these two headings is a Type, so its tag falls out of the Type rule. */
  it("tags each shelf and puts it in the backcountry section", () => {
    const shelves: Array<[string, string]> = [
      ["Avalanche Equipment", "avalanche-equipment"],
      ["Climbing Skins", "climbing skins"],
      ["Snow Packs", "snow packs"],
      ["Ice Tools", "ice tools"],
      ["Other Back-Country Gear", "other back-country gear"],
      ["Snow Shovels and Ice Tools", "snow-shovels-and-ice-tools"],
      ["Beacons and Probes", "beacons and probes"],
    ];
    for (const [type, tag] of shelves) {
      const tags = generalTags({ type, vendor: "Black Diamond", genders: [] });
      expect(tags, type).toContain(tag);
      expect(tags, type).toContain("backcountry");
    }
  });
});

describe("backcountry gear", () => {
  /** The heading is tagged back-country-gear in the live catalogue, not backcountry-gear. */
  it("writes the heading tag the way the catalogue spells it", () => {
    const tags = generalTags({ type: "Back-Country Gear", vendor: "Backcountry Access", genders: [], describedAs: "Stealth 240 Avalanche Probe" });
    expect(tags).toContain("back-country-gear");
    expect(tags).not.toContain("backcountry-gear");
    expect(tags).toContain("backcountry");
    expect(tags).toContain("backcountry-access");
  });
});

describe("tags the rules work out for themselves", () => {
  it("recognises every family the rules produce", () => {
    for (const tag of ["snowboard-boots", "ski", "backcountry", "2026", "mens", "123abc", "123abc-zb",
      "step-on-boots", "alpine-touring-bindings", "snow-bags", "ski packages", "boa-ski-boots", "skins"]) {
      expect(isRuleGenerated(tag), tag).toBe(true);
    }
  });

  it("leaves alone what the rules do not produce", () => {
    for (const tag of ["shovels", "bonus10", "some-brand-thing"]) {
      expect(isRuleGenerated(tag), tag).toBe(false);
    }
  });

  /**
   * The reason this matters: an avalanche export carried "touring and cross-country ski" on
   * sixteen of seventeen products, which is drift rather than a rule. Learning it would have put
   * it on every future probe and shovel.
   */
  it("keeps drift out of what a template learns", () => {
    expect(isNotLearnable("touring and cross-country ski")).toBe(true);
    expect(isNotLearnable("touring-and-cross-country-ski")).toBe(true);
    // Still written by the rule, on the products it genuinely belongs to.
    expect(generalTags({ type: "Cross-Country Skis", vendor: "Fischer", genders: [] }))
      .toContain(TOURING_SKI_TAG);
  });
});

describe("whether a garment is snow kit or outdoor kit", () => {
  /** The Ortovox Ortler: a snow jacket carries snow-clothing beside snow-jackets. */
  it("tags the context heading alongside the garment", () => {
    const tags = generalTags({ type: "Snow Jackets", vendor: "Ortovox", genders: ["mens"], section: "Clothing" });
    expect(tags).toContain("snow jackets");
    expect(tags).toContain("snow-clothing");
  });

  it("reads it off the menu, which places all but one garment", () => {
    expect(clothingContextTags("Snow Pants")).toEqual(["snow-clothing"]);
    expect(clothingContextTags("Baselayers")).toEqual(["snow-clothing"]);
    expect(clothingContextTags("Headwear")).toEqual(["snow-clothing"]);
    expect(clothingContextTags("Down Jackets")).toEqual(["outdoor-clothing"]);
    expect(clothingContextTags("Rainwear")).toEqual(["outdoor-clothing"]);
    expect(clothingContextTags("Hiking Socks")).toEqual(["outdoor-clothing"]);
  });

  it("takes telling for the one garment the menu places under both", () => {
    expect(clothingContextTags("Midlayers")).toEqual(["snow-clothing"]); // the shop's default
    expect(clothingContextTags("Midlayers", "Outdoor Clothing")).toEqual(["outdoor-clothing"]);
  });

  it("adds nothing for a garment the menu gives no context, or for anything else", () => {
    expect(clothingContextTags("Socks")).toEqual([]);
    expect(clothingContextTags("Gloves")).toEqual([]);
    expect(clothingContextTags("Snowboards")).toEqual([]);
    expect(clothingContextTags("Ski Boots")).toEqual([]);
  });
});

describe("gear for skins", () => {
  /** A skin cutter is not a skin: it is filed with the backcountry gear, on the skins page, and
   *  with the touring accessories, all three. */
  it("files it on all three shelves, whatever the invoice called it", () => {
    for (const type of ["Alpine Touring Accessories", "Ski Accessories"]) {
      const tags = generalTags({ type, vendor: "G3", genders: [], describedAs: "G3 Skin Trim Tool cutter" });
      expect(tags, type).toContain("back-country-gear");
      expect(tags, type).toContain("climbing skins");
      expect(tags, type).toContain("alpine touring accessories");
      expect(tags, type).toContain("backcountry");
    }
  });

  it("recognises the rest of the skin bench", () => {
    for (const name of ["Pomoca Skin Glue", "Skin Wax", "Black Diamond Skin Bag", "G3 Skin Saver Sheets"]) {
      expect(isSkinAccessory(name), name).toBe(true);
    }
  });

  it("does not mistake a skin itself for gear about skins", () => {
    expect(isSkinAccessory("Pomoca Climb Pro S-Glide")).toBe(false);
    const skin = generalTags({ type: "Climbing Skins", vendor: "Pomoca", genders: [], describedAs: "Pomoca Climb Pro S-Glide" });
    expect(skin).toContain("skin");
    expect(skin).toContain("skins");
    expect(skin).not.toContain("alpine touring accessories");
  });

  it("leaves other accessories alone", () => {
    expect(isSkinAccessory("Ski Poles")).toBe(false);
    expect(isSkinAccessory(undefined)).toBe(false);
  });
});

describe("a product filed under a heading other than its shelf", () => {
  it("carries the shelf's tags and the heading's, the way the shop writes a goggle", async () => {
    const { catalogTags } = await import("./product-tags");
    const tags = catalogTags({ productType: "Goggles", filedAs: "Ski Accessories", brand: "Anon", items: [], ruleTags: [], describedAs: "M4 Goggles", builtBy: "zb" });
    expect(tags).toEqual(expect.arrayContaining(["goggles", "ski-accessories", "ski", "anon", "123abc-zb"]));
    // Said once each, however many headings agree.
    expect(new Set(tags).size).toBe(tags.length);
    // A heading that is the shelf itself adds nothing.
    expect(catalogTags({ productType: "Snow Clothing", filedAs: "Snow Clothing", brand: "Spyder", items: [], ruleTags: [], describedAs: "" }))
      .toEqual(catalogTags({ productType: "Snow Clothing", brand: "Spyder", items: [], ruleTags: [], describedAs: "" }));
  });
});

describe("a rule's bare noun for a shelf the shop tags in full", () => {
  it("drops 'boots' from a ski boot, whose shelf tag is ski-boots, and keeps 'socks' on socks", async () => {
    const { catalogTags } = await import("./product-tags");
    const boot = catalogTags({ productType: "Ski Boots", brand: "Tecnica", items: [], ruleTags: ["boots"], describedAs: "Mach1 120 TD GW Ski Boots" });
    expect(boot).toContain("ski-boots");
    expect(boot).not.toContain("boots");
    const binding = catalogTags({ productType: "Snowboard Bindings", brand: "Burton", items: [], ruleTags: ["bindings"], describedAs: "Cartel X" });
    expect(binding).toContain("snowboard-bindings");
    expect(binding).not.toContain("bindings");
    const socks = catalogTags({ productType: "Snow Socks", brand: "Burton", items: [], ruleTags: ["socks"], describedAs: "Weekend Midweight Socks" });
    expect(socks).toContain("socks");
  });
});
