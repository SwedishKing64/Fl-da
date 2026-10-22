# Prompt: build a trade knowledge pack for Flöda

Give the prompt below to a research agent once per trade, with `{TRADE}` replaced (for example
"bike shop", "surf shop", "running and footwear", "fashion boutique", "homewares", "toys and games",
"pet supplies", "beauty"). What it returns is a trade pack:

1. Put `pack.json`, `kinds.json`, `sizes.json`, `colours.json` and `reader-examples.json` in
   `src/lib/catalog/trades/packs/<trade-id>/`, with `"verified": false` in `pack.json`.
2. Check them: `npx tsx scripts/check-pack.ts src/lib/catalog/trades/packs/<trade-id>`. It names
   every kind without a Shopify category, every kind or size system that does not line up.
3. Compare the menu with what real shops in the trade sell:
   `npx tsx scripts/ground-pack.ts <store> <store> --pack src/lib/catalog/trades/packs/<trade-id>`.
4. Register it beside `trades/bike.ts` (the bike pack is the worked example) and open a pull request.
5. Keep the sample documents out of the pack folder, in `knowledge/<trade-id>/documents/`.

A pack is marked verified only after it has been scored on real documents from a pilot shop in the
trade, with and without it (`npm run eval:read -- --pack <trade-id>`, see docs/PILOT.md).

Its sample documents can be scored the same day:

```
npm run eval:read -- --dir knowledge/<trade-id>/documents
```

The `.csv` documents are scored without an API key; the `.txt` ones are read by the AI and need
`ANTHROPIC_API_KEY` set.

---

You are building reference knowledge for Flöda, a tool that reads supplier invoices and order
forms for independent retail shops and turns each line into Shopify products and variants. Flöda
already reads ski and outdoor shops well. Your job is to teach it the trade of a **{TRADE}**: what
the shop sells, how each kind of product varies, how sizes are written, and what that trade's
supplier paperwork looks like. Everything you write is loaded as data and used to check and guide
the reader, so it must be exact, consistent and in the formats below.

## Ground rules

1. **No real commercial data.** Never copy a real invoice, price list or order form, and never
   state a real supplier's wholesale cost. Sample documents use made-up suppliers and made-up
   prices. They should still look like real ones: the same layouts, wording and quirks.
2. **Standards are facts.** Size systems, size conversions and Shopify's Standard Product Taxonomy
   are public. Use them, and give the source for each in `README.md`.
3. **Say how sure you are.** Mark anything you are not sure is common practice with
   `"confidence": "low"`, and leave out what you cannot support.
4. **The arithmetic must hold.** On every sample document, quantity × unit cost equals each line
   total, the lines add up to the printed subtotal, and the units add up to the printed total
   units. Check every one before you finish.
5. **Think like the person keying it in.** An answer key holds one line for each thing a shop can
   stock: one per size, per colour, per option. A size grid row with quantities under three sizes
   is three lines. Freight, discounts, deposits and notes are not lines.

## What to produce

Write these files in a folder named `<trade-id>`, where the id is lowercase with hyphens
(for example `bike`).

### 1. `pack.json`: the shop's menu

```json
{
  "id": "bike",
  "name": "Bike",
  "sells": "One line for setup: who should start from this pack",
  "tree": [
    { "top": "Bikes", "groups": [
      { "heading": "Mountain Bikes", "leaves": ["Hardtail", "Full Suspension", "E-MTB"] }
    ] }
  ],
  "tagSpelling": { "Full Suspension": "full suspension" },
  "shopifyTaxonomy": { "Mountain Bikes": "Sporting Goods > Outdoor Recreation > Cycling > Bicycles > Mountain Bikes" },
  "verified": false
}
```

- `tree` is the menu a typical shop in this trade has: top items, headings under them, and the
  kinds of product under each heading. Use the words shops use on their websites, not catalogue
  jargon. Leave out audience-only links ("Mens", "Kids") and merchandising links ("Sale",
  "Brands").
- `tagSpelling` gives the tag each kind is usually written as, where shops agree on one.
- `shopifyTaxonomy` gives the closest Shopify Standard Product Taxonomy category path for each
  kind.

### 2. `kinds.json`: each kind of product and how it varies

One entry for every kind in the tree:

```json
[
  {
    "kind": "Full Suspension",
    "supplierWords": ["FS", "full sus", "dual suspension"],
    "options": [
      { "name": "Size", "system": "bike-frame-letter", "examples": ["S", "M", "L", "XL"] },
      { "name": "Colour", "examples": ["Gloss Black", "Sage"] }
    ],
    "optionOrder": ["Colour", "Size"],
    "notOptions": ["wheel size when the model name carries it"],
    "specFields": [ { "name": "Travel", "unit": "mm", "example": "140" } ],
    "titleExample": "Ridgeline 140 Carbon",
    "codeHints": "Model code, then a two-letter colour code, then the size: RL140-GB-M",
    "confidence": "high"
  }
]
```

- `options` are what a shopper picks between on one listing. `notOptions` are things that look
  like options but make a separate product.
- `optionOrder` is the order shops show the options in.
- `codeHints` explains how supplier codes in this trade usually build in the size, colour or
  option, where they do.

### 3. `sizes.json`: every size system the trade uses

```json
[
  {
    "system": "bike-frame-letter",
    "appliesTo": ["Mountain Bikes", "Gravel Bikes"],
    "order": ["XS", "S", "M", "L", "XL", "XXL"],
    "writtenAs": { "XL": ["XL", "X-Large", "X-LG"] },
    "convertsTo": { "cm": { "S": "38-42", "M": "42-46" } },
    "source": "where this comes from"
  }
]
```

Cover letter sizes, numeric sizes, shoe systems (US, UK, EU, mondopoint, men's and women's),
waist/leg sizes, kids' ages, one-size words, capacity and volume units, and any unit that is
special to the trade (frame size in inches or cm, wetsuit thickness 4/3, rod length 7'6", and so
on). `writtenAs` lists every way suppliers print the value: "8½", "8.5", "085", "8H".

### 4. `colours.json`: colour shorthand

```json
[ { "code": "BLK", "name": "Black" }, { "code": "NVY", "name": "Navy" } ]
```

List the abbreviations suppliers in this trade print. Add brand-specific colour code tables only
where the brand publishes them.

### 5. `reader-examples.json`: lines and how they read

Between four and eight short examples, in this form:

```json
[
  "A line \"RL140-GB-M Ridgeline 140 Carbon Gloss Black M | 1 | 3120.00\" reads as title Ridgeline 140 Carbon, colour Gloss Black, size M, quantity 1, cost 3120."
]
```

Pick the cases a reader would most likely get wrong in this trade.

### 6. `documents/`: 10 to 12 sample supplier documents, each with its answer key

Each document is a `.csv` (a spreadsheet as sent) or a `.txt` (the text a PDF gives when you
select all and copy, page breaks and repeated headers included). Each one has a matching
`<same name>.key.json`:

```json
{
  "trade": "bike",
  "kind": "csv",
  "totals": { "units": 7, "subtotal": 5120.00 },
  "lines": [
    { "code": "RL140-GB-M", "name": "Ridgeline 140 Carbon", "quantity": 1, "cost": 3120.00, "rrp": 5999.00, "size": "M", "colour": "Gloss Black" }
  ]
}
```

- `kind` is one of `csv`, `grid`, `pdf-text`, `multi-brand` or `order-form`.
- `totals` holds only what the document prints. Leave it out if the document prints none.
- Each line takes `code`, `name`, `quantity` and `cost`, plus `rrp`, `size`, `colour` and
  `option` (any other option, such as volume, capacity or length) where the document has them.

Cover these layouts across the set, at least one of each that happens in this trade:

1. A plain line-per-variant invoice.
2. A size grid: sizes across the top, quantities in the cells.
3. A multi-page PDF text, with the column headings repeated on each page and a "continued" line.
4. Colour written as a code (`BLK`, `0010`), with or without a colour key elsewhere on the page.
5. Prepacks or size runs (one line meaning, say, 1×S, 2×M, 2×L, 1×XL), with the pack's make-up
   printed.
6. Case quantities: cost per case against cost each, and "units per case".
7. Ordered against shipped: back-ordered or cancelled lines, where only what shipped is received.
8. Discounts: a discount column, or a discount line at the foot, and the net cost per line.
9. Prices including tax, labelled the way that country labels them (GST, VAT, sales tax).
10. Several brands on one distributor invoice.
11. A different currency, with the symbol only in the heading.
12. Anything else that is common in this trade and would trip a reader up.

Keep each document between 5 and 60 lines, and keep its headings, column order and wording
true to the trade.

### 7. `README.md`

- Where each standard came from, with links.
- Anything you were unsure of.
- Which of the twelve layouts don't happen in this trade, and why.

## Before you finish

Check every key against its document: every line accounted for, quantities and costs exact,
totals matching. Check that every kind named in `kinds.json` appears in `pack.json`'s tree, and
that every size system named in `kinds.json` is defined in `sizes.json`.
