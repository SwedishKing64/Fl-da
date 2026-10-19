# Rubin — handover

> This copy of the code is **Flöda**, the product made from Rubin. Alpsport's own Rubin lives in
> the business's repository and is not changed from here. See `FLODA.md` for what Flöda is and
> what differs. Everything below describes what the shop told us and decided while Rubin was
> built; in Flöda those conventions are the snow-and-outdoor rules pack, and the shop's own are
> learned from its export.

Read this first. It is what a new Claude session (or a new developer) needs to know that is not in
the code: what the shop is, what it asked for, the rules it told us, what was decided, and what is
still open. The code is the source of truth for behaviour; this is the source of truth for *why*.

Rubin is an internal tool for Alpsport, a ski and snowboard retailer in Sydney, run by Justin. It
turns supplier paperwork into Shopify product CSVs, applies price and stock changes to Shopify
exports, and tidies photographed paperwork into tables. The shop imports the CSVs into Shopify by
hand; nothing here talks to the store. (Rubin also writes supplier invoices out as bills for
QuickBooks Online; Flöda does not — that section was taken out of this copy on 2026-10-14.)

## The pages

| Menu | Route | What it does |
| --- | --- | --- |
| Home | `/` | Three job cards, "carry on where you left off", numbers and activity folded away. |
| New products | `/batches` | An import batch: upload invoices, order forms, spec sheets and photos; chat the instructions; build products; review and price; export one CSV per brand or kind. |
| Prices and stock | `/bulk` | Load Shopify exports, say a change in words (a sale, a clearance, a mount charge, a cost change) or add a delivery (order form plus spec sheet plus invoices), check every changed cell, download the updated file, or only some kinds of product from it. |
| Tidy a document | `/tidy` | A photo or PDF of scribbled-on paperwork read into an editable table and saved as a CSV the other pages take. |
| Price calculator | `/pricing` | The markup and margin rules, GST and FX. |
| History | `/history` | The audit log. |
| Settings | `/settings` | Users, API key, rules. |

Theme: Meta blue (`--meta #0866ff`), system font, big plain controls, emoji chips on menu items
and buttons. The owner asked for "extremely easy UI" and buttons "mimicking Meta's".

## How the shop works (rules it told us)

**One year tag per product (asked 2026-10-19).** A product carries exactly one of its season
(2026, 2027…) or the 2999/2998 markers. A year given in the batch chatbox — as the season or as a
tag — replaces the file's year rather than sitting beside it, and the title and handle carry it
too (`oneYearTag` in product-tags.ts; the chat's year is set as the lines' season in pipeline.ts).

**Bills take the shop's terms with each supplier (asked 2026-10-16).** The QuickBooks supplier
contact list's Terms column is kept with the names (still never phones, emails or addresses). A
bill matched to a supplier on the list takes the list's terms over the invoice's, and its Due date
is worked from them: "Net 30 EOM" (or "EOM 30") is the end of the bill's month plus 30 days — a
bill of 13 October is due 30 November; "Net 7" is seven days; "Due on receipt" is the bill date.
Loading a newer list keeps the names learned from bills since.

**A new product is titled as the supplier's page titles it (asked 2026-10-16), for search.** When
a product link is read and the page is surely that product, the title becomes the page's own name
(`page-title.ts`): the site's name after a bar or dash dropped, no brand in front (the SEO title
carries it), no gender anywhere in it, and the season year after it as always. Only new products —
one the shop already lists keeps its listed name — and only a model's own product: a binding
package or a wide/low-bridge fit sharing the ski's page keeps its own name. The handle (the URL) is
not changed.

**A rebuild keeps what the products gathered (fixed 2026-10-16).** Column mapping and the chatbox
rebuild every product from the order lines. The link, the description and pictures its page gave,
a web lookup's copy, the page's title and pictures added by hand are noted first and given back to
the product rebuilt in its place, matched by handle or else by name (`rebuild-keep.ts`). The shop
had pasted links, gone back to Column mapping, exported, and lost them all.

**The batch chatbox rebuilds at once (asked 2026-10-15).** An instruction typed on a batch is read
and the products are built again with it in the same request — whether or not they had been
built, and even where they were edited by hand on the review page (the reply says the edits were
replaced). Only a file whose columns still need mapping holds it back, and the reply says which.

**AI answers and the token allowance.** The model thinks before it answers and the thinking comes
out of the same `max_tokens`; small allowances (2,000-8,000) cut answers off mid-JSON, which showed
as "No API key is set, so the build cannot be checked" though a key was set. Every call now
streams with 32,000 (the bill reader 64,000), and the build check says when an answer came back
unreadable rather than blaming the key.

**The Prices and stock preview shows both prices (asked 2026-10-16).** Every line of the change
preview carries the variant's price and compare-at, each as it was → as it becomes
(`Change.prices`, filled in at the end of `applyPlan`), whatever column the line itself is about.
The downloaded change list has the same four columns.

**Which Claude model (chosen 2026-10-15, for cost).** `EXTRACTION_MODEL` is Claude Opus 5.5
($4/$20 per million tokens in/out, cheaper than the Opus 5 it replaced) for everything that reads:
invoices, scans, handwriting, product pages, bills, the Prices and stock chat, the build check.
`LIGHT_MODEL` is Claude Haiku 5.5 (about $0.10/$0.50) for colour checks on pictures, SEO lines and
reading the batch chat. Both can be overridden in Vercel with `CATALOG_AI_MODEL` /
`CATALOG_LIGHT_MODEL`. Neither accepts thinking switched off or a forced tool; set `effort`
explicitly (both default to `medium`). Fast mode for photographed invoices (twice the price) is off
since 2026-10-15 at the shop's choice; `CATALOG_FAST_READS=1` turns it back on. The build check
still runs by itself after every build, also the shop's choice.

**Snow clothing is named by gender (asked 2026-10-19), the one exception to the rule below.** A
snow garment — any Type under Snow Clothing: jackets, pants, midlayers, baselayers, headwear,
socks, streetwear — is built as a men's and a women's product, each titled with it on the front:
"Men's Cyclic GORE-TEX 2L Jacket 2027". Burton's jackets had come through with no gender in the
title. A unisex garment still carries none, and Kids' is unchanged (`gender-title.ts`, used by the
grouping and by a page read).

**A page for each colour (asked 2026-10-19).** On the review page and on Prices and stock, a new
product in more than one colour can be given a page per colour as well as, or instead of, its own.
Each colour's page gives that colour its pictures, and the first of them becomes the Variant Image
of every size in that colour; the description comes from the product's own page, or the first
colour's when it has none. Kept on the product as `colourLinks`, and through a rebuild.

**No gender in any title (asked 2026-10-15).** "Men's", "Women's", "Ladies", "Unisex" never go in a
product's title, whether the supplier's name carries them or the shop's older listings do
(`withoutGender` in `mapping.ts`, used by the import, the delivery builder and the grouping). The
gender is kept on the line and goes into the tags; where men's and women's of one model share a
name, the handle carries it ("womens-talon-22-2027") so Shopify keeps them as two products.
Kids', Youth and Junior are an age, not a gender, and stay.

**Size-grid order forms with no item codes (asked 2026-10-19).** A distributor's order workbook —
the shop's Black Crows / ATK / Roxa / Mountain Flow / Out Of form — prices every model on a row and
leaves a box per size. It is read by `grid-form.ts`, by what is in it: heading rows are the rows of
sizes or price headings, a row of one repeated word is the section ("ALL TERRAIN SKIS", kept as the
line's kind), a product is a row with a name and a price, a quantity is a small whole number in a
size box. "Size 1" … "Size 6" are the model's own lengths in its name, in order: "SATO (167, 173,
179, 185)" with a 1 under Size 2 is one Sato in 173. The name loses the lengths, NEW, UNI (kept as
unisex) and a weight ("- 370 GR"); a colour after it goes in the colour. Pre-order is the cost where
the form gives it, W/S otherwise; EX-STOCK is never read as a quantity. A tab is read this way only
when the code reader found nothing there, or this finds everything it did and more. Known gap: ATK's
spacer section is headed with pole lengths (120–145), so a spacer comes through with a length.

**No reader written for one brand's layout (asked 2026-10-15).** A supplier's file is read by
deducing what each column holds, not by where it sits or how one brand heads it:
`src/lib/catalog/columns.ts` knows a barcode by its check digit, a size (XS-XXL, S/M, WXS/S, O/S,
lengths, Mondo), a colour, a gender, a code, and the product's name as the words that tell
products apart. The order-form reader, the flat invoice reader and the mapping suggestions all
use it, and a heading is only evidence. Do not add "the name is the column beside the code" or any
rule that only holds for one supplier's form; make the deduction better instead.

**Bindings.** A ski package has a "Please Mount My Bindings" variant priced over its "Do Not
Mount" twin. The mounting charge differs by binding kind, and the classifier in
`src/lib/catalog/mount.ts` decides. Told by the shop, in this order, and the latest word wins:

- System (on a rail or plate, no drilling): Xpress, XP 10/11, NX 11, NX 12 Konect, anything that
  says Konect, Lowride, Kid 4 / Kid-X, Head PR/PRD/PRW, JRS, Joy SLR, Evo, Freeflex (race plate),
  Atomic M 10/12, MI 12, C 5 GW, L 6 GW, Colt, Salomon Z10–Z13, M11, Fischer RS, TPX/TPC/TP2, Elan
  EL/ELX/EMX/FusionX, Marker FDT 10/12, K2 M3 Quikclik, Völkl vMotion.
- Drill mount (the dear job): every touring binding, Pivot, Griffon, Squire, Strive, Jester,
  Warden, Attack, Comp J, Rockerace, **SPX 10, 11, 12, 13, 15**, **NX 7, NX 10**, **Marker FDT 7 /
  M7.0**, **Freeflex 11**. SPX on a Rossignol or Dynastar whose ski name carries a bare "K"
  (Forza 70 V-Ti K, Hero Elite ST Ti K) is the Konect version and stays system.
- The binding's own option is believed before the package title. Anything unplaced is drill.

**Mount price instruction** ("please mount should be $59 more than do not mount", "all flat drill
mount bindings including Marker FDT 7, M7.0, SPX 15 …"): `setMountPrice` on the Prices and stock
chat. It is always scoped to packages; "flat" there means the binding, not the ski. The charge
lands on the recommended retail in full and on the price by the same share, so a sale stays the
sale it was. Named bindings are honoured whatever the classifier says. A mounted variant on a
different sale from its twin moves by more than the charge; the page warns and lists them.

**Costs.** "Set the cost to $450" is `setCost`; "costs are up 5%" is `changeCost`. Neither
touches the price.

**Kinds of product.** A Burton order carries boards, bindings, boots, outerwear, gloves and bags.
On a batch, the kinds the order holds are tick-pills ("Kinds of product to work with"); unticked
kinds are set aside, kept with the batch, and built back when ticked. On Prices and stock the
same row narrows a delivery ("Kinds of product on this order"), and "Download only some kinds of
product" cuts the updated export down to those products, every row of each, under the same
headings. The chat understands "only the snowboards", "boards and bindings only", "leave out the
gloves".

**Name matches.** An invoice with no barcodes is placed on listings by name. Each such line must be
decided before the delivery applies: same product (stock goes up), new year's model (built), or
not it (left alone). A line whose name is on last year's listing is offered as this year's model.

**Burton.** burton.com is a Shopify store. A product page is read from the store's product data
(description, colour-matched pictures) and, since the site refuses the server's own visit, its
tech specs are fetched through the API. Burton's order form rows carry SKU = `105441CA02RG00M`
style codes and EAN barcodes; the spec sheet's 5-digit model is the SKU's first five characters;
the join is by barcode first. Burton's "Items and Descriptions" list only covers boards.

**Pictures.** Hosted pictures are flattened, trimmed, put on a square canvas (1000–2048px, product
filling 86%) and centred, so they do not look smaller on the shop. The colour ordered is matched
by looking at the pictures (vision), not by caption text, because captions were wrong.

**Tags and Types.** The shop's own exports are the authority on spelling: a heading is
hyphenated (`packs-and-bags`, `ski-accessories`), a sub-link is spaced (`hiking packs`,
`snow jackets`), with the exceptions listed in `src/lib/catalog/tag-spelling.ts`. The Type column
spells the menu's ampersand out ("Packs and Bags", "Climbing and Abseiling"). Packs are filed on
the Outdoor menu by what they are: hiking packs from 40 litres, daypacks under, travel packs,
hydration packs, duffels; a ski, board or boot bag is an accessory. When a learned convention
changes a product's Type, the shelf tags move with it. Price bands, sizes and colours are
Shopify's own tags and are never written. Daypacks, hiking packs and travel packs also carry
`backpacks` (the shop asked for it on 2026-10-13); duffels and the hydration shelf, which holds
bare reservoirs, do not.

**Invoices with handwriting.** On a photographed order, "YT 23/24/25/27" headings are seasons, a
three-or-four-digit amount beside a line is the RRP, a percentage is a discount, struck lines are
skipped, and every other remark is kept as a note on the line.

**Outdoor shops (October 2026).** The same platform put into an outdoor shop struggled with
pictures and with invoice layouts it had never read. The causes were the ski shop's assumptions
left in the code: the reader's fields were ski-shaped (length in cm, width as a boot last, a ski
category list), spreadsheet size grids were only recognised with lengths across the top, colour
codes (BLK, 001) went through as colours, pictures were taken only from a page's markup (outdoor
brands' own shop software keeps them in scripts), and only 16 pictures were looked at for the
ordered colour. Each of these is now general: any size words across a grid, a free option for
capacity, volume, length or zip side, the kind of product from the shop's own list, colour
shorthand written out and bare codes not matched, pictures read from a page's scripts, and up to
32 looked at before the 16 kept. Real outdoor invoices and links that read badly are still wanted
as test cases.

**Blank slate, any trade (plan of 22 October 2026).** The plan is the Claude doc "Flöda Blank
Slate: Any Invoice, Any Shop". Trade knowledge now lives in `src/lib/catalog/trades/`, one data
file per trade (snow-and-outdoor, outdoor, none), chosen at setup as "Start from" and laid under
whatever the shop teaches. Reading is measured: `npm run eval:read` scores the reader against
documents with answer keys (a synthetic corpus in `samples/corpus`, the real one outside the
repository via `CORPUS_DIR`), and the synthetic corpus is a test that fails on any trade scoring
below `samples/corpus/baseline.json`. A document read by the AI is checked against the totals it
prints; a miss is re-read once, and one still off is flagged at the top of the review page.
The ski and snowboard rules (snowboard boots and bindings told apart by brand, accessories filed
under Ski or Snowboard Accessories, skis sent mounted named as binding packages) run only for the
snow pack, or for a shop whose own store or export shows it sells skis or snowboards (`snowTrade()`
in taxonomy.ts). The review screen's category choices are the shop's own rules', not a fixed list.
A line keeps every column the mapping had no field for, under the supplier's heading; where two
lines of one product would otherwise be the same variant, the column that tells them apart (a
sleeping bag's "Zip Side") becomes an option of its own (`extraOptions` in categorize.ts).

**Known suppliers, known layouts (phase 2).** Each file keeps its layout: the words of its column
headings (`layout.ts`). The lines of a supplier's exported or pushed batches are kept as examples —
the line as printed and what the shop settled it as — and the nearest few, same layout first, go to
the reader with the supplier's next document (`read-examples.ts`). A known supplier's document in
a layout it has never sent is read on the full model and the batch says so. A document whose lines
do not add up is put to the person on the review page ("Read it again" or "The lines are right");
until settled the export page lists it and a push asks for the override. Export is never stopped.
Reference knowledge per trade comes from `docs/KNOWLEDGE-PROMPT.md`, run by an agent once per trade.

**Industry expansion (memo of 23 October 2026).** Phase 0 de-skied the core: metafields come from
the pack (`ski.*` for the ski shop, `custom.*` for every other), the ski shop's habits are its
pack's starting point and every other shop starts plain, a ski's own fields and rules run only in
the snow trade, ski code lives in `trades/snow/`, and `deski.test.ts` holds the rest to a list
that can only shrink. Costs convert into the shop's home currency (`fxRateToHome` and the like in
code; the database columns keep their AUD names).

**Connecting Shopify.** A hosted copy with Flöda's Shopify app set up connects through an install
link in Settings: set SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET from the app in Shopify's Dev
Dashboard, FLODA_APP_URL to where Flöda is served, and list FLODA_APP_URL/api/shopify/callback as
an allowed redirect on the app. Tokens are expiring offline ones (an hour, with a 90-day refresh
token) and are refreshed before they lapse. A copy without the app connects with a pasted token.
Every product of a shop outside the snow trade goes out with its Shopify Standard Product Taxonomy
category (release 2026-08, `data/shopify-taxonomy.ts`, `npx tsx scripts/taxonomy.ts <release>` to
update); the packs place each of their kinds by hand, and other kinds are found by name or left
blank. The ski shop keeps its habit of filling only boards, downhill skis and sleeping bags.

**QuickBooks (Rubin only).** Rubin reads supplier invoices into QuickBooks bill sheets. Flöda
removed that section; the rules the shop gave for it (its one-row-per-bill sheet, supplier names
from its QuickBooks list, batch PDFs split into one bill per invoice) live in Rubin's handover.

## Decisions and history, newest first

- 2026-10-23 First run at Alpsport on the local desktop copy (v0.1.14-local). What the shop said,
  and what changed:
  - The website reader took Alpsport's 2,640 automated collections as kinds of product. A Shopify
    store is now read from `/products.json`: the Product Type each listing carries, with counts.
  - A Burton invoice was read as from Alpsport (the bill-to name), which became every line's
    brand. The shop's own name is never the supplier or a brand (`isOwnShop`).
  - "Product type", Shopify's word, replaces "kind of product" everywhere a person reads it.
  - A type's "tags every one gets" are tags on 95% of its products; tags on some and not others
    (a ski's terrain) are "tags that vary", picked per product.
  - The model year can go on chosen product types or tags only (`naming.season = "chosen"`).
  - Descriptions can have extra sections of the shop's own (Specifications, Features).
  - Links: found automatically when the review grid opens, kept when the page carries the model's
    own name ("Family Tree Alekesam" for "FT Alekesam"), one page per colour where the brand has
    them (`Product.colourLinks`), each colour's pictures on its own variant.
  - A type outside the shop's list is filed under its nearest type (`closestType`), not asked.
  - The export page lists each issue once with its product count.
  - Supplier files of any type: zips unpacked, Word read, unknown files kept; no size cap on the
    desktop.
  - Prices and stock takes an order form and its invoice together: quantities and cost (after
    indent discounts) from the invoice, barcodes and RRP from the order form
    (`order-and-invoice.ts`).
  - The hosted Flöda answered 404 to sign-in, so a `local` desktop build (no licence, own account,
    own key) exists: the release workflow's `local` input.

- 2026-10-22 Supplier layouts are shared between shops (`shared-layouts.ts`,
  `shared-layouts-store.ts`, the `layout-share` and `layout-find` calls on the licence route). When a
  person saves a supplier's column mapping, the file's headings and the field each one is go to
  Flöda's deployment under the shop's licence key. Values, prices, the supplier's name and the
  shop's never go, and which shops taught a layout is never sent back. A file in a layout the shop
  has never seen starts from the reading most other shops agree on ("Taught by N other shops" on
  the mapping screen). Their choices stand where they differ from Flöda's own guess, unless the
  data rules them out. A shop can turn it off under Settings → Licence, which also stops it asking.
  Each build that used one is logged as `layout.shared-used`.

- 2026-10-13 Repository moved to `RubinAlp/Rubin`; the business has its own Vercel project, Neon
  database and Blob store, with the old data copied in. Settings gained "Copy from the old site"
  to bring the old Blob files across. Packs carry `backpacks`. The Burton RRP problem is fixed.
  Bills for QuickBooks writes the shop's own one-row-per-bill sheet instead of the line layout,
  and splits a scanned batch PDF of any size into one bill per invoice.
- 2026-10-14 Bills take the supplier's name from the shop's QuickBooks supplier list.
- 2026-10-15 Columns told by their contents for every supplier (`columns.ts`); the order form's
  lines reach the mapping as Item No., SKU, Barcode, Brand, Description, Gender, Colour, Length,
  Size, RRP, Cost, Qty, already mapped; a "Description" of barcodes is never suggested as the name.
- 2026-10-15 Osprey's forward order form (a row per size, a QTY per delivery month, the name under
  "Description", the UPC beside the product code) was read by the size-grid order reader, which
  took the column beside the code — the UPC — as every product's name and counted only the first
  month. That reader now takes a "Description"/name heading where there is one, never a UPC/EAN
  column, keeps the UPC as the barcode, adds the month QTYs (or takes QTY TOTAL), keeps "S/M"
  sizes, gender and the "… Wholesale Price" cost. A properly headed one-row-per-size form now goes
  to the column mapping as the table it is, from the tab the order is written on, so the mapping
  sees "Description"; Volkl's section-headed size grids are read as before.
- 2026-10-15 The business's Blob store is private, and uploads failed ("Cannot use public access
  on a private store"). Storage now learns the store is private from the first refused save and
  keeps files privately under relative paths, served by `/api/catalog/files/…`: pictures to
  anyone (Shopify fetches them at the site's own address), invoices and exports only when signed
  in. "Copy from the old site" rewrites old public addresses the same way.
- 2026-10-14 The supplier list learns from bills downloaded. A page whose reading came back cut
  off ("Unterminated string in JSON") is fixed: thinking shares `max_tokens` with the answer, so
  the bill reader now allows 64,000 and asks once more with less thinking if an answer still
  will not parse.

- 2026-10-12 Name matches confirmed before a delivery applies; order forms with a size column
  per line read the size. Packs filed on the Outdoor menu; Type spelling; retagging on Type change.
- 2026-10-12 Shopify-store pages read for tech specs (page beside store data, API fetch when the
  site refuses). Bills for QuickBooks page. Kinds-only download, placed where the updated file is
  handed over. Kinds pickers on the batch page and on Prices and stock.
- 2026-10-11 Meta-blue theme, Home built around jobs, emoji buttons. SPX 10–15, NX 7/10, FDT 7,
  M7.0, Freeflex 11 made drill mounts; mount-price chat takes named bindings and is always
  scoped to packages.
- 2026-10-09 Tidy a document page; handwriting read as instructions; build list to tick which
  products to build; `setCost` and `changeCost`; barcode join for Burton order forms.
- 2026-10-08 Mount classifier corrections (Redster J2/C5, Q7, Forza 70 SPX, NX10, Kid 4); the
  bulk preview shows every change; page reads given a budget so a delivery cannot hang; pictures
  matched to the ordered colour, resized and centred; Burton store reader.
- Earlier: the import pipeline, the bulk page and its chat, pricing, rules, templates, shop
  memory, package building, the delivery join, Vercel deployment.

Open at handover:

- The first Burton board page read for specs was not run with a live API key in the development
  environment; check it.

## Working on it

- `npm run demo` starts the app on :3000 with a SQLite database; a fresh database opens on the
  setup walk-through. `npm run catalog:seed -- --admin … --snow` makes an account and switches
  the snow pack on without it. Start it in the background; the first page load is slow.
- `npx vitest run` is the gate before any commit. Some tests read real supplier files from the
  developer's uploads folder and fail with ENOENT when those files are absent; that is
  environmental, not a regression. Anything else failing is.
- `npx tsc --noEmit` and `npx eslint src` must be clean.
- Never commit supplier invoices, order forms or exports that carry wholesale costs. Test fixtures
  are written by hand in the tests.
- Read `node_modules/next/dist/docs/` before touching Next.js APIs; this is a newer Next than
  training data knows.
- Commit messages are written in plain English about what changed for the shop, not the code.

## Where things are

| Area | Files |
| --- | --- |
| Bindings and mount charge | `src/lib/catalog/mount.ts`, `adjust.ts` (`setMountPrice`), `adjust-plan.ts` (the chat's plan) |
| Delivery to an export | `src/lib/catalog/delivery.ts`, `reconcile.ts`, `reference-match.ts`, `specs.ts` |
| Kinds of product | `src/lib/catalog/kinds.ts`, `instructions.ts` (`types`, `typesSeen`), `narrow-export.ts` |
| Pages and pictures | `src/lib/catalog/extract/page.ts`, `shopify-store.ts`, `pictures.ts`, `colour-match.ts` |
| Categorising and tagging | `src/lib/catalog/grouping.ts`, `categorize.ts`, `accessories.ts`, `packs.ts`, `product-tags.ts`, `tagging.ts`, `taxonomy.ts` (the vocabulary in force), `tag-spelling.ts`, `learn.ts` (from the shop's export), `shop-profile.ts` |
| Setup, clients, licences, desktop | `src/app/(catalog)/(setup)/setup/`, `(app)/clients/`, `src/lib/catalog/licence.ts`, `licence-store.ts`, `desktop/`, `scripts/desktop-build.mjs` |
| Supplier layouts | `src/lib/catalog/mapping.ts`, `layout.ts`, `shared-layouts.ts` (shared between shops) |
| Invoice reading | `src/lib/catalog/invoice.ts` (spreadsheets), `extract/ai.ts` (PDF and photo), `extract/transcribe.ts` (Tidy) |
| Prices and stock page | `src/app/(catalog)/(app)/bulk/BulkPanel.tsx` |
| Batch page | `src/app/(catalog)/(app)/batches/[id]/` (`BuildList`, `TypeList`, `LinksPanel`) |
| Theme | `src/app/globals.css`, `src/app/(catalog)/ui.tsx`, `(app)/NavLinks.tsx`, `(app)/page.tsx` |
