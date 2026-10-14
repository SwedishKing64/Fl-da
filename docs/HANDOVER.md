# Rubin — handover

> This copy of the code is **Flöda**, the product being made from Rubin. Alpsport's own Rubin
> lives in the business's repository and is not changed from here. See `FLODA.md` for what
> differs and the plan. Everything below describes the code as it was when the two split.

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

**QuickBooks (Rubin only).** Rubin reads supplier invoices into QuickBooks bill sheets. Flöda
removed that section; the rules the shop gave for it (its one-row-per-bill sheet, supplier names
from its QuickBooks list, batch PDFs split into one bill per invoice) live in Rubin's handover.

## Decisions and history, newest first

- 2026-10-13 Repository moved to `RubinAlp/Rubin`; the business has its own Vercel project, Neon
  database and Blob store, with the old data copied in. Settings gained "Copy from the old site"
  to bring the old Blob files across. Packs carry `backpacks`. The Burton RRP problem is fixed.
  Bills for QuickBooks writes the shop's own one-row-per-bill sheet instead of the line layout,
  and splits a scanned batch PDF of any size into one bill per invoice.
- 2026-10-14 Bills take the supplier's name from the shop's QuickBooks supplier list.

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

- Files and hosted pictures still live in the old personal Vercel project's Blob store until
  "Copy from the old site" is run on Settings; then the old project, its Neon database and Blob
  store are deleted and the personal API key revoked.
- The first Burton board page read for specs was not run with a live API key in the development
  environment; check it.

## Working on it

- `npm run demo` starts the app on :3000 with a SQLite database and a demo login
  (justin@alpsport.test / password123; a fresh database shows the setup form first). Start it in
  the background; the first page load is slow.
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
| Categorising and tagging | `src/lib/catalog/grouping.ts`, `categorize.ts`, `accessories.ts`, `packs.ts`, `product-tags.ts`, `tagging.ts`, `taxonomy.ts`, `tag-spelling.ts` |
| Invoice reading | `src/lib/catalog/invoice.ts` (spreadsheets), `extract/ai.ts` (PDF and photo), `extract/transcribe.ts` (Tidy) |
| Prices and stock page | `src/app/(catalog)/(app)/bulk/BulkPanel.tsx` |
| Batch page | `src/app/(catalog)/(app)/batches/[id]/` (`BuildList`, `TypeList`, `LinksPanel`) |
| Theme | `src/app/globals.css`, `src/app/(catalog)/ui.tsx`, `(app)/NavLinks.tsx`, `(app)/page.tsx` |
