/**
 * How the shop writes a listing: the things an export cannot show and a person has to say.
 *
 * An export teaches the vocabulary — kinds, menus, spellings — and the templates per brand. It does
 * not say whether the brand goes in the title, whether a product's year does, what the shop puts in
 * the SKU and Barcode columns, or what it writes for weight. Those are here, as data, set on the
 * "How you list" step of setup and on Settings, and read wherever a listing is built. Pure, so the
 * form in the browser can import it; `shop-profile.ts` keeps it and puts it in force.
 */

export interface HouseConventions {
  naming: {
    /** Whether the Title column leads with the brand. The SEO title always does. */
    brandInTitle: "never" | "always";
    /** Whether a product's model year goes after its name: for the kinds that carry a year tag, always, or never. */
    season: "seasonal" | "always" | "never";
    /** Case a supplier's capitals back into the shop's mixed case, or keep names as the supplier writes them. */
    casing: "shop" | "supplier";
    /** "Men's" or "Women's" on the front of a gendered product's name, or the name as the supplier gives it. */
    audience: "front" | "none";
    /** One real title, the way the shop writes it, shown to the reader as the shape to match. */
    example: string;
  };
  identifiers: {
    /** What goes in the SKU column: the supplier's code, the barcode, or nothing. */
    sku: "supplier" | "barcode" | "none";
    /** Whether a barcode is kept from the paperwork, required (a product without one is flagged), or never written. */
    barcode: "keep" | "required" | "none";
  };
  weights: {
    /** No weight, a weight per kind of product, or the same weight on everything. */
    mode: "none" | "byKind" | "fixed";
    /** The unit the shop thinks in; weights are kept in grams whatever it is. */
    unit: "g" | "kg";
    fixedGrams: number;
    byKind: Array<{ type: string; grams: number }>;
  };
  descriptions: {
    /** How a description is laid out and written, in the shop's words: what comes first, how long, what never to say. */
    format: string;
    /** The heading over the details list; empty for a list with no heading. */
    specsHeading: string;
    /** One real description from the shop, pasted, as the shape to match. */
    example: string;
  };
  /** Anything else, in the shop's own words. Fed to the reader on every product. */
  notes: string;
  /** Each kind of product the shop told Flöda about from its exports: what it is called, its tags, how its titles read. */
  kinds: KindRule[];
  /** When it was last saved; empty until the shop has been through it once. */
  savedAt: string;
}

/**
 * What the shop says about one kind of product, told from an export's own rows: the Type as the
 * export writes it, what the shop calls it (the Type written from now on), the tags every one of
 * them gets, and the shape its titles take. Kept here so the reader and the build see them with
 * the rest of the conventions; the tags and the name also stand as tag rules for the build.
 */
export interface KindRule {
  /** The Type as the export writes it. */
  type: string;
  /** What the shop calls it; the Type written on every listing of this kind. Same as `type` when unchanged. */
  calledAs: string;
  /** Tags every product of this kind gets. */
  tags: string[];
  /** How a title of this kind reads, as one real example or a pattern: "Völkl Mantra 88 2026". */
  titleFormat: string;
  /** How many products the export had of it, for the person's bearings. */
  count: number;
}

export const DEFAULT_HOUSE: HouseConventions = {
  naming: { brandInTitle: "never", season: "seasonal", casing: "shop", audience: "front", example: "" },
  identifiers: { sku: "supplier", barcode: "keep" },
  weights: { mode: "none", unit: "g", fixedGrams: 0, byKind: [] },
  descriptions: { format: "", specsHeading: "Tech Specs", example: "" },
  notes: "",
  kinds: [],
  savedAt: "",
};

/** A tag rule as the "How you list" form writes it: when a field says this, add these tags. */
export interface TagRuleInput {
  id?: string;
  field: "any" | "title" | "brand" | "productType";
  pattern: string;
  addTags: string;
}

export const TAG_RULE_FIELDS: Array<{ key: TagRuleInput["field"]; label: string }> = [
  { key: "any", label: "anything about it" },
  { key: "productType", label: "its kind of product" },
  { key: "brand", label: "its brand" },
  { key: "title", label: "its name" },
];

const norm = (s: string) => s.trim().toLowerCase();

/** The weight a product of this kind carries, by the shop's convention; null when it sets none. */
export function conventionGrams(house: HouseConventions, productType: string): number | null {
  const w = house.weights;
  if (w.mode === "fixed") return Math.max(0, Math.round(w.fixedGrams));
  if (w.mode === "byKind") {
    const hit = w.byKind.find((k) => norm(k.type) === norm(productType));
    return hit ? Math.max(0, Math.round(hit.grams)) : null;
  }
  return null;
}

/** Grams from a number in the unit the shop thinks in. */
export function toGrams(value: number, unit: HouseConventions["weights"]["unit"]): number {
  return Math.round(unit === "kg" ? value * 1000 : value);
}
export function fromGrams(grams: number, unit: HouseConventions["weights"]["unit"]): number {
  return unit === "kg" ? Math.round(grams) / 1000 : Math.round(grams);
}

/** The SKU and barcode a variant goes out with, from what the paperwork gave. */
export function conventionIdentifiers(house: HouseConventions, given: { sku: string; barcode: string }): { sku: string; barcode: string } {
  const { identifiers: id } = house;
  const sku = id.sku === "none" ? "" : id.sku === "barcode" ? given.barcode.trim() || given.sku.trim() : given.sku.trim();
  const barcode = id.barcode === "none" ? "" : given.barcode.trim();
  return { sku, barcode };
}

/**
 * The conventions as a paragraph for the reader, so copy and names it writes follow them. Only
 * what differs from the plainest reading is said; the notes go in whole.
 */
export function houseGuidance(house: HouseConventions): string {
  const lines: string[] = [];
  const n = house.naming;
  lines.push(n.brandInTitle === "always" ? "Product titles lead with the brand." : "Product titles do not include the brand; it is in the Vendor column and the SEO title.");
  if (n.season === "always") lines.push("Every product title ends with its model year.");
  if (n.season === "never") lines.push("Product titles never carry a model year.");
  if (n.casing === "supplier") lines.push("Names are written exactly as the supplier writes them, capitals included.");
  lines.push(n.audience === "front" ? "A gendered product's title starts with Men's, Women's or Kids'." : "Titles do not start with Men's or Women's; the gender goes in the tags.");
  if (n.example.trim()) lines.push(`A typical title here reads: "${n.example.trim()}". Match that shape.`);
  if (house.identifiers.sku === "none") lines.push("The shop does not use SKUs.");
  if (house.identifiers.sku === "barcode") lines.push("The barcode is used as the SKU.");
  if (house.identifiers.barcode === "required") lines.push("Every variant needs a barcode.");
  const d = house.descriptions;
  if (d.format.trim()) lines.push(`How a description is written here:\n${d.format.trim()}`);
  if (d.specsHeading.trim() && d.specsHeading.trim() !== "Tech Specs") lines.push(`The details list is headed "${d.specsHeading.trim()}".`);
  if (d.example.trim()) lines.push(`A description from this shop, as the shape to match:\n${d.example.trim()}`);
  for (const k of house.kinds) {
    const name = k.calledAs || k.type;
    const parts: string[] = [];
    if (k.calledAs && k.calledAs !== k.type) parts.push(`the shop files what an export calls "${k.type}" as "${k.calledAs}"`);
    if (k.tags.length) parts.push(`every one is tagged ${k.tags.join(", ")}`);
    if (k.titleFormat.trim()) parts.push(`its titles read like "${k.titleFormat.trim()}"`);
    if (parts.length) lines.push(`${name}: ${parts.join("; ")}.`);
  }
  if (house.notes.trim()) lines.push(house.notes.trim());
  return lines.join("\n");
}

/** A plain-words summary for Settings and the setup checklist. */
export function describeHouse(house: HouseConventions): string[] {
  const out: string[] = [];
  const n = house.naming;
  out.push(`Titles ${n.brandInTitle === "always" ? "lead with the brand" : "leave the brand to the Vendor column"}${n.season === "always" ? " and always end with the year" : n.season === "never" ? " and never carry a year" : "; seasonal kinds carry their year"}${n.casing === "supplier" ? ", written as the supplier writes them" : ", in the shop's own case"}${n.audience === "front" ? ", with Men's or Women's on the front of a gendered product" : ""}.`);
  const id = house.identifiers;
  out.push(`SKU: ${id.sku === "supplier" ? "the supplier's code" : id.sku === "barcode" ? "the barcode" : "not used"}. Barcodes: ${id.barcode === "keep" ? "kept when the paperwork has them" : id.barcode === "required" ? "required on every variant" : "not used"}.`);
  const w = house.weights;
  out.push(w.mode === "none" ? "No shipping weight is written." : w.mode === "fixed" ? `Every variant weighs ${fromGrams(w.fixedGrams, w.unit)} ${w.unit}.` : `Weight by kind: ${w.byKind.filter((k) => k.type.trim()).map((k) => `${k.type} ${fromGrams(k.grams, w.unit)} ${w.unit}`).join(", ") || "none set yet"}.`);
  const d = house.descriptions;
  if (d.format.trim() || d.example.trim()) out.push(`Descriptions are laid out the shop's way${d.specsHeading.trim() ? `, details under "${d.specsHeading.trim()}"` : ", details with no heading"}.`);
  if (house.notes.trim()) out.push(`Notes: ${house.notes.trim()}`);
  return out;
}

/** The form's reading of what came back from the browser, made safe to keep. */
/** The kinds as kept: one per export Type, trimmed, with the name defaulting to the Type itself. */
export function cleanKinds(input: unknown): KindRule[] {
  const seen = new Set<string>();
  const out: KindRule[] = [];
  for (const k of (Array.isArray(input) ? input : []).slice(0, 500) as Array<Partial<KindRule>>) {
    const type = String(k?.type ?? "").trim().slice(0, 120);
    if (!type || seen.has(type.toLowerCase())) continue;
    seen.add(type.toLowerCase());
    const tags = (Array.isArray(k?.tags) ? k.tags : String(k?.tags ?? "").split(",")).map((t) => String(t).trim().slice(0, 80)).filter(Boolean).slice(0, 40);
    out.push({ type, calledAs: String(k?.calledAs ?? "").trim().slice(0, 120) || type, tags: [...new Set(tags)], titleFormat: String(k?.titleFormat ?? "").trim().slice(0, 200), count: Math.max(0, Math.round(Number(k?.count) || 0)) });
  }
  return out;
}

/**
 * Where a shop that has said nothing starts. The ski shop's habits — no brand in the title, "Men's"
 * on the front of a jacket's name — were every shop's default until a second trade showed they were
 * one shop's. They stay the snow pack's starting point; every other shop starts plain, with the brand
 * in the title and the name as the supplier gives it, until it says otherwise.
 */
export function defaultHouseFor(pack: string | null | undefined): HouseConventions {
  if (pack === "snow-outdoor") return DEFAULT_HOUSE;
  return { ...DEFAULT_HOUSE, naming: { ...DEFAULT_HOUSE.naming, brandInTitle: "always", audience: "none" } };
}

export function cleanHouse(input: Partial<HouseConventions> | null | undefined, base: HouseConventions = DEFAULT_HOUSE): HouseConventions {
  const i = input ?? {};
  const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback);
  const n = { ...base.naming, ...(i.naming ?? {}) };
  const id = i.identifiers ?? DEFAULT_HOUSE.identifiers;
  const w = i.weights ?? DEFAULT_HOUSE.weights;
  return {
    naming: {
      brandInTitle: pick(n.brandInTitle, ["never", "always"] as const, base.naming.brandInTitle),
      season: pick(n.season, ["seasonal", "always", "never"] as const, base.naming.season),
      casing: pick(n.casing, ["shop", "supplier"] as const, base.naming.casing),
      audience: pick(n.audience, ["front", "none"] as const, base.naming.audience),
      example: String(n.example ?? "").trim().slice(0, 160),
    },
    identifiers: {
      sku: pick(id.sku, ["supplier", "barcode", "none"] as const, "supplier"),
      barcode: pick(id.barcode, ["keep", "required", "none"] as const, "keep"),
    },
    weights: {
      mode: pick(w.mode, ["none", "byKind", "fixed"] as const, "none"),
      unit: pick(w.unit, ["g", "kg"] as const, "g"),
      fixedGrams: Math.max(0, Math.min(1_000_000, Math.round(Number(w.fixedGrams) || 0))),
      byKind: (Array.isArray(w.byKind) ? w.byKind : []).slice(0, 200).map((k) => ({ type: String(k?.type ?? "").trim().slice(0, 120), grams: Math.max(0, Math.min(1_000_000, Math.round(Number(k?.grams) || 0))) })).filter((k) => k.type),
    },
    descriptions: {
      format: String(i.descriptions?.format ?? "").trim().slice(0, 4000),
      specsHeading: String(i.descriptions?.specsHeading ?? DEFAULT_HOUSE.descriptions.specsHeading).trim().slice(0, 60),
      example: String(i.descriptions?.example ?? "").trim().slice(0, 6000),
    },
    notes: String(i.notes ?? "").trim().slice(0, 4000),
    kinds: cleanKinds(i.kinds),
    savedAt: String(i.savedAt ?? ""),
  };
}
