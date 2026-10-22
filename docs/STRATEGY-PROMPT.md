# Prompt: blank with a setup tutorial, or pre-built for every industry?

Give the prompt below to a research or strategy agent. It holds everything the agent needs to know
about Flöda, so it doesn't need the code. Bring its answer back here and I'll turn the chosen plan
into work.

---

You are advising the founder of Flöda on one product decision, then on how to carry it out. Think
it through properly, and say plainly where you are guessing.

## What Flöda is

Flöda is software for independent retail shops that sell on Shopify. A shop uploads its supplier
paperwork: invoices, order forms, price lists, spec sheets, as PDFs, photos, spreadsheets or CSVs.
Flöda reads every line, groups the lines into products and variants (sizes, colours, other
options), prices them from cost, writes titles, tags, types and descriptions the way the shop
writes them, finds product pictures on the brand's website, and either writes a Shopify import CSV
or pushes draft products straight to the store. The point is to save a shop owner hours of typing
for each delivery.

It runs as a hosted web app and as a desktop app. It uses Claude to read PDFs and photos, and code
to read spreadsheets. It is based in Australia, so prices are in AUD and include GST.

## How it got here, and what went wrong

- It was built inside one ski and outdoor shop, from that shop's real supplier files, one fix at a
  time. It works well there.
- When it was tried in an outdoor shop that sells no skis, it struggled. It misread invoice layouts
  it had never seen, filed products under ski headings, and picked the wrong product pictures.
- Looking into it showed that a lot of the ski shop's knowledge sits in the code itself, not in
  data:
  - Each line has fixed fields for ski length, flex, DIN range and terrain.
  - Rules exist for particular brands' order forms.
  - The ski shop's own habits are written as if they were general rules: no brand in the title,
    prices ending in .99, "Men's" at the front of clothing names.
  - Nearly all the automated tests run as the ski shop.
- Work since then:
  - ski-only rules now run only for shops that sell skis;
  - trade knowledge was moved into data files, called trade packs (snow-and-outdoor, outdoor, and
    an empty one);
  - every read is checked against the document's own printed totals;
  - a supplier's past corrected lines are used as examples when reading its next document;
  - a test harness scores reading against documents with answer keys.
- There are only nine test documents, all made up. There is no real test set yet outside the ski
  shop.

## What Flöda can learn from a shop today

- **The shop's own Shopify store or a product export:** its product types, tags and how they are
  spelled, its option names, its vendors, its handles and existing prices.
- **Its website menu:** the categories it files products under.
- **A setup wizard:** the shop's name, the pack to start from, its tag habits, how it writes
  titles, its weight units, how it uses SKUs and barcodes, and its description format.
- **Its suppliers' past documents, once it has used Flöda for a while:** each supplier's layout and
  how its lines were read.

## The decision

The founder wants Flöda to work for independent shops in any industry: bikes, surf, fashion,
homewares, toys, pet, beauty, books, hardware and others. There are two directions:

- **A. Fully blank, with a setup tutorial.** Flöda ships knowing no industry. Setup walks the shop
  through teaching it: connect the store, confirm the kinds of product and their options, upload a
  first invoice and correct it together. Flöda learns everything from that shop.
- **B. Pre-built for every industry from gathered reference data.** For each industry, gather the
  menu, the kinds of product and how each varies, the size systems, colour codes, typical invoice
  layouts and example documents. The shop picks its industry at setup and Flöda starts out knowing
  the trade.

A mix of the two is allowed if you think it is better, but say exactly which parts come from where.

## What to weigh

1. **Time to first good result.** How many minutes, and how many corrections, before a new shop's
   first invoice comes out right? A shop owner gives up quickly.
2. **What can and cannot be learned from one shop.** Some knowledge is in the shop's own store:
   its types, tags and naming. Some is not: how a supplier lays out its invoices, size systems,
   colour codes, what a prepack or a case quantity means. Some is universal across all retail:
   invoice structure, totals, units. Sort the knowledge Flöda needs into these groups.
3. **What breaks in each direction.** A wrong industry pack fights the shop. A blank start knows
   nothing on day one. A shop that sells across industries, like a general store, fits neither.
4. **Cost and upkeep.** Building and maintaining reference data per industry against a heavier
   setup. AI cost per document. Who keeps each industry's data current?
5. **How to prove it works.** What measurements, on what documents, would show that the choice
   was right? Nothing should ship to a new industry without a score on real documents from it.
6. **Shopify's rules.** Product categories should follow Shopify's Standard Product Taxonomy.
   Since January 2026, new shops connect through an app with OAuth rather than a pasted access
   token.
7. **Privacy.** Supplier invoices carry wholesale costs. Nothing with a real cost leaves the shop's
   own copy or is shared between shops. Layouts and structure may be shared; prices never.

## What to give back

1. **Your recommendation** in two or three sentences, and the main reason for it.
2. **A sorted list of the knowledge Flöda needs**, each item marked: learned from the shop, from
   a reference pack, universal and built in, or learned from use over time. Say where each one
   comes from.
3. **The setup tutorial**, screen by screen, as the shop owner sees it:
   - what each screen asks or shows;
   - what Flöda learns from it;
   - what happens when the shop skips it.
   Include the first invoice, read and corrected together.
4. **If any reference data is gathered:** which industries come first and why, what each pack
   contains, how it is gathered and checked, and how a shop's own data overrides it.
5. **How it would be built**, in phases, each with:
   - what is done;
   - what it depends on;
   - how success is measured (with the measure, the documents it runs on, and the target);
   - roughly how big it is (small, medium or large).
6. **The risks**, and what would make you change your recommendation.
7. **What to ask real shops**: the five or so questions to put to a few shop owners in different
   industries before committing.

Keep it in plain language the founder can act on. Where a number is an estimate, say what it
rests on. Don't present a guess as a fact.
