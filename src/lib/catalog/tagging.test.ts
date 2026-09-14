import { describe, expect, it } from "vitest";
import { BACKCOUNTRY_BINDING_TAG, BACKCOUNTRY_BOOT_TAG, BOARD_DISCIPLINES, crossShelfTags, DEFAULT_TAGGING, EVERGREEN_SEASON, SKI_DISCIPLINES, BAG_TAGS, MANUAL_SEASON, TOURING_SKI_TAG, bagTags, bindingType, bootTags, disciplinesFor, snowboardBindingTags, needsBindingKind, TAG_SPELLING, generalTags, isHardgood, isManualTag, isNotOurs, isNotLearnable, isRuleGenerated, isShopifyGenerated, needsSectionChoice, normaliseGenders, seasonFor, slugTag, withoutGenerated } from "./tagging";

describe("the six general tags", () => {
  it("writes them in the shop's order: type, section, season, house, vendor, gender", () => {
    expect(generalTags({ type: "Snowboard Boots", vendor: "Burton", genders: ["mens"] })).toEqual([
      "snowboard-boots",
      "snowboard",
      "2026",
      "123abc-js",
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
    expect(tags).toEqual(["snowboard-accessories", "snowboard", "2026", "123abc-js", "burton"]);
  });

  it("carries both genders when a product is sold to both", () => {
    const tags = generalTags({ type: "Snowboards", vendor: "Burton", genders: ["mens", "womens"] });
    expect(tags.slice(-2)).toEqual(["mens", "womens"]);
  });

  it("asks for a section only where a type really sits in two menus", () => {
    expect(needsSectionChoice("Goggles")).toBe(true); // Ski and Snowboard
    expect(needsSectionChoice("Gaiters")).toBe(true); // Clothing and Outdoor
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

  it("keeps the house tag in one editable place", () => {
    expect(DEFAULT_TAGGING.houseTag).toBe("123abc-js");
    const tags = generalTags({ type: "Snow Jackets", vendor: "Burton", genders: [] }, { houseTag: "abc123-js", currentYear: 2026 });
    expect(tags).toContain("abc123-js");
  });

  it("never repeats a tag", () => {
    const tags = generalTags({ type: "Snowboards", vendor: "Snowboards", genders: [] });
    expect(new Set(tags).size).toBe(tags.length);
  });
});

describe("clothing", () => {
  it("tags a womens snow jacket with gender and garment", () => {
    expect(generalTags({ type: "Snow Jackets", vendor: "Burton", genders: ["womens"], section: "Clothing" })).toEqual([
      "snow-jackets",
      "clothing",
      "2026",
      "123abc-js",
      "burton",
      "womens",
    ]);
  });

  it("hyphenates every garment name", () => {
    expect(generalTags({ type: "Snow Pants", vendor: "Burton", genders: ["mens"], section: "Clothing" })).toContain("snow-pants");
    expect(generalTags({ type: "Down Jackets", vendor: "Burton", genders: ["womens"], section: "Clothing" })).toContain("down-jackets");
    expect(generalTags({ type: "Rainwear", vendor: "Burton", genders: ["mens"], section: "Clothing" })).toContain("rainwear");
    // No garment needs a pinned spelling; the map holds only the one heading whose live tag
    // differs from its menu name.
    expect(Object.keys(TAG_SPELLING)).toEqual(["Backcountry Gear"]);
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
    for (const tag of ["snow-jackets", "burton", "2026", "123abc-js", "mens", "clearance", "snow-sale"]) {
      expect(isShopifyGenerated(tag), tag).toBe(false);
    }
  });

  it("does not mistake a year or a model number for a price band", () => {
    expect(isShopifyGenerated("2026")).toBe(false);
    expect(isShopifyGenerated("step-on-boots")).toBe(false);
  });

  it("strips them from a list in one go", () => {
    expect(withoutGenerated(["snow-jackets", "size-medium", "burton", "500-600", "colour-true-black"]))
      .toEqual(["snow-jackets", "burton"]);
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
    for (const tag of ["snow-jackets", "snowboards", "burton", "mens", "2026", "snow-socks"]) {
      expect(isManualTag(tag), tag).toBe(false);
    }
  });

  it("treats Shopify's and the shop's own hand-applied tags as equally off limits", () => {
    expect(isNotOurs("size-medium")).toBe(true);
    expect(isNotOurs("clearance")).toBe(true);
    // A garment tag is the importer's to write, even though a template must not learn it.
    expect(isNotOurs("snow-jackets")).toBe(false);
    expect(isNotLearnable("snow-jackets")).toBe(true);
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
    expect(tags).toContain("snowboard-packages");
  });

  it("uses the ski package tag for a ski", () => {
    expect(generalTags({ type: "Skis", vendor: "Atomic", genders: ["mens"], withBindings: true })).toContain("ski-packages");
    expect(generalTags({ type: "Skis", vendor: "Atomic", genders: ["mens"] })).not.toContain("ski-packages");
  });

  it("carries every discipline a board is, not just one", () => {
    // The shop's own Family Tree Alekesam is both.
    const tags = generalTags({
      type: "Snowboards", vendor: "Burton", genders: ["mens"],
      disciplines: ["Freeride & Powder Boards", "Freestyle & All-Mountain Boards"],
    });
    expect(tags).toContain("freeride-and-powder-boards");
    expect(tags).toContain("freestyle-and-all-mountain-boards");
  });

  it("offers the seven ski disciplines and the three board ones", () => {
    expect(SKI_DISCIPLINES).toHaveLength(7);
    expect(SKI_DISCIPLINES).toContain("Mogul Skis");
    expect(SKI_DISCIPLINES).toContain("Frontside & All-Mountain Skis");
    expect(BOARD_DISCIPLINES).toEqual(["Freestyle & All-Mountain Boards", "Freeride & Powder Boards", "Park Boards"]);
  });

  it("will not put a board discipline on a ski", () => {
    const tags = generalTags({ type: "Skis", vendor: "Atomic", genders: ["mens"], disciplines: ["Park Boards", "Carving Skis"] });
    expect(tags).toContain("carving-skis");
    expect(tags).not.toContain("park-boards");
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
      "snowboards", "snowboard", "2027", "123abc-js", "burton", "mens", "snowboard-packages", "park-boards",
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
      .toEqual(["snowboard-bindings", "snowboard", "2026", "123abc-js", "burton", "womens", "traditional-bindings"]);
  });
});

describe("boots", () => {
  it("tags a Step On snowboard boot", () => {
    expect(generalTags({ type: "Snowboard Boots", vendor: "Burton", genders: ["mens"], describedAs: "Men's Ruler Step On® Snowboard Boots 2025" }))
      .toEqual(["snowboard-boots", "snowboard", "2026", "123abc-js", "burton", "mens", "step-on-boots"]);
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
    expect(tags).toContain("touring-skis");
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
    expect(tags).toContain("ski-packages");  // and it comes with a binding
    expect(tags).toContain("frontside-and-all-mountain-skis");
    expect(tags).toContain("freeride-and-powder-skis");
  });

  it("does the same for a board package", () => {
    const tags = generalTags({ type: "Snowboards", vendor: "Burton", genders: ["mens"], withBindings: true, disciplines: ["Park Boards"] });
    expect(tags).toContain("snowboards");
    expect(tags).toContain("snowboard");
    expect(tags).toContain("snowboard-packages");
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
    expect(generalTags({ type: "Climbing Skins", vendor: "Black Diamond", genders: [] })).toContain("climbing-skins");
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
    expect(tags).toContain("touring-skis");
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
      .toContain("alpine-touring-accessories");
  });
});

describe("backcountry gear and avalanche gear", () => {
  /** Every shelf under these two headings is a Type, so its tag falls out of the Type rule. */
  it("tags each shelf and puts it in the backcountry section", () => {
    const shelves: Array<[string, string]> = [
      ["Avalanche Equipment", "avalanche-equipment"],
      ["Climbing Skins", "climbing-skins"],
      ["Snow Packs", "snow-packs"],
      ["Ice Tools", "ice-tools"],
      ["Other Back-Country Gear", "other-back-country-gear"],
      ["Snow Shovels and Ice Tools", "snow-shovels-and-ice-tools"],
      ["Beacons and Probes", "beacons-and-probes"],
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
    for (const tag of ["snowboard-boots", "ski", "backcountry", "2026", "mens", "123abc-js", "123abc-zb",
      "step-on-boots", "alpine-touring-bindings", "snow-bags", "ski-packages", "boa-ski-boots", "skins"]) {
      expect(isRuleGenerated(tag), tag).toBe(true);
    }
  });

  it("leaves alone what the rules do not produce", () => {
    for (const tag of ["shovels", "snow-clothing", "bonus10", "some-brand-thing"]) {
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
      .toContain("touring-and-cross-country-ski");
  });
});
