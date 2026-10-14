# Flöda

Supplier paperwork in, shop-ready listings out. Flöda turns supplier invoices, order
confirmations, spec sheets and photographed paperwork into ready-to-upload Shopify product CSVs
and stock and price changes.

Flöda is the product made from Rubin, the tool built inside Alpsport, a Sydney ski and snowboard
retailer; see `docs/FLODA.md` for the plan to make it work for any specialty retailer, and
`docs/HANDOVER.md` for the rules it carries. The landing page is at `/welcome`.

**Flow:** upload files (invoices, spec sheets, catalogue pages, product photos; CSV/XLSX are
parsed directly, everything else is read and classified by Claude) → columns are matched to
product fields automatically (a supplier's layout is remembered; the mapping screen only
appears when something is unrecognised) → products are grouped into variants, categorised,
tagged by your Rules, priced by your markup rules and given images → review everything in a
spreadsheet-style grid grouped by brand → export one validated Shopify CSV per brand (or per
product type) or push to the store → every batch is logged.

**Pricing** (`/pricing`): an interactive price calculator, the markup/margin rules and tax/FX
settings. **Settings**: the shop, what Flöda has learned from its export, the API key, staff.

## Run it

```sh
npm install        # also runs `prisma generate`
npm run demo       # SQLite database, dev server on http://localhost:3000
```

The first visit walks through setup: the admin account, the shop (name, country, currency, tax,
what it sells, which rules to start from), the shop's Shopify export (Flöda learns its kinds of
product, menus, tag spellings and per-brand conventions from it), and the Anthropic API key that
reads PDFs and photos. Spreadsheets work without a key. `ANTHROPIC_API_KEY` in the environment
is used when set; otherwise the key pasted in setup is kept in the database.

`npm run catalog:seed -- --admin you@shop.com "Your Name" a-strong-password` makes an account
without the walk-through; `--snow` also switches on the snow-and-outdoor rules pack.

Sample supplier files to try are in `samples/`:

| File | What it exercises |
|---|---|
| `atomic-prebook.csv` | Tidy AUD ex-GST pre-book with style codes, EANs, RRPs and image URLs |
| `volkl-invoice.xlsx` | USD invoice, no GST, preamble rows above the header, line totals instead of unit prices |
| `burton-invoice.pdf` / `.txt` | Text-only PDF, AUD inc-GST prices, sizes and lengths embedded in descriptions |

`samples/expected/` holds the Shopify CSV and profit figures each sample must produce; the
regression test in `src/lib/catalog/samples.test.ts` fails if they drift. Regenerate them
with `npm run catalog:fixtures` after an intentional change.

## The desktop app

Flöda installs on a PC or a Mac as an app. It is the same server, started on the machine with a
SQLite database and a files folder in the user's app-data directory, in an Electron window.

```sh
npm run desktop:build   # the server as a standalone folder, plus an empty template database
npm run desktop:check   # runs it under plain Node against a throwaway folder and hits three pages
npm run desktop:dev     # opens it in Electron (needs the Electron binary: `npx electron --version`)
npm run desktop:dist    # the installer for this platform, in dist-desktop/
```

Pushing a tag like `v0.2.0` runs `.github/workflows/desktop.yml`, which builds the Windows
installer on a Windows runner and the Mac disk image on a Mac runner and attaches both to the
release. The app checks its licence against `FLODA_LICENCE_SERVER` (baked in at build time,
default `https://floda.ai`); the shop enters the key it was sent in Settings.

## The vendor's deployment

The copy at floda.ai runs with `FLODA_VENDOR=1`. It has a Clients page (every shop, its plan,
standing, key and last check-in; leads from the landing page become clients on a trial) and
answers `/api/licence` for installed copies.

## Deploy to Vercel

Vercel has no persistent disk, so the app needs a Postgres database and a Blob store there.
Both are one click in the Vercel dashboard and their credentials are injected automatically.

1. vercel.com → **Add New → Project** → import this repository.
2. In the project: **Storage → Create Database → Neon (Postgres)** and **Storage → Create → Blob**. Connect both to the project; this sets `DATABASE_URL` and `BLOB_READ_WRITE_TOKEN`.
3. Optionally add `ANTHROPIC_API_KEY`, and `FLODA_VENDOR=1` on the vendor's own deployment, under **Settings → Environment Variables**.
4. **Deploy** (or redeploy after adding storage). The build (`npm run vercel-build`) switches Prisma to Postgres, syncs the schema and builds the app.
5. Open `https://<your-project>.vercel.app` and walk through setup.

## Pricing & profit engine

Everything is in `src/lib/catalog/pricing.ts` (pure, unit tested):

```
landed cost   = cost ÷ (1 + GST) if the invoice is GST-inclusive, else cost
                × FX rate to AUD + freight allocation
ex-GST sell   = landed ÷ (1 − margin)            (MARGIN rule)
              = landed × (1 + markup)            (MARKUP rule)
retail        = ex-GST sell × (1 + GST), rounded UP to the rule's price ending (.99 …)
ex-GST rev    = retail ÷ (1 + GST)
profit / unit = ex-GST revenue − landed cost     ← GST is never counted as profit
batch profit  = Σ ex-GST revenue − Σ landed cost
```

Rules resolve product (SKU/model) → brand → category → default. Rows under the configurable
minimum margin are flagged as warnings; a manual retail override recalculates profit live in
the grid.

## Shopify CSV rules implemented

`src/lib/catalog/csv.ts` (unit tested): row-per-variant with product fields only on the first
row of each handle, extra image rows, `Title`/`Default Title` for option-less products, up to
three options chosen per category (length + colour for skis, size + width + colour for
boots …) with the rest written as `… (product.metafields.ski.<key>)` columns, an import-only
`Collection` column, straight quotes, plain decimal prices, public-HTTPS-only image URLs,
`Status = draft` unless the batch is marked publish, automatic splitting under 15MB without
splitting a handle, and a re-parse validator that checks duplicate/conflicting handles,
inconsistent option names, duplicate option values and required columns before a file is
released.

## Shopify Admin API (Phase 2)

Under **Shopify**, paste a custom-app Admin API token. *Sync catalog* caches every product /
variant / SKU for duplicate detection; *Check against Shopify* on a batch classifies each
product as **new**, **adds variants** or **updates existing** and surfaces it in the grid.
*Push to Shopify* uses `productSet` behind an explicit confirmation and can be rolled back
(products it created are deleted, prices it changed are restored). Multi-location inventory
is supported via per-variant location quantities when locations are loaded.

## Tests

```sh
npm test            # vitest: pricing engine, CSV generator/validator/splitter, extraction,
                    # mapping/categorisation/grouping, validation, Shopify input, sample fixtures
npx tsc --noEmit
npx eslint
```
