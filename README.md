# Afterword

**Understand what your customers actually say — don't just collect stars.**

Every Shopify review app (Judge.me, Loox, Yotpo) is a *collect-and-display* tool. Afterword
is a *read-and-act* tool: it reads each post-purchase reply, tags the themes, scores sentiment,
flags what's urgent, ranks **what to fix first**, drafts replies to unhappy customers, and turns
glowing ones into one-click testimonials.

See [TEARDOWN.md](TEARDOWN.md) for the competitive analysis this is built against.

## What's here

- **The insight engine** (`src/lib/analyze.ts`, `src/lib/insights.ts`) — pure, deterministic,
  fully tested. Turns replies into sentiment + themes + severity + drafted response, then
  aggregates into a score and a ranked "fix first" list. Swap `analyzeFeedback` for an LLM call
  behind the same signature to go from good to great.
- **The product UI** — a marketing page (`/`) and the live **dashboard** (`/app`) running on
  mock feedback so it works with zero setup.
- **The Shopify app skeleton** — real OAuth + webhook-HMAC + scheduled-send:
  - `GET /api/auth` → install, `GET /api/auth/callback` → token exchange + webhook registration
  - `POST /api/webhooks/orders-fulfilled` → schedule a follow-up (HMAC-verified)
  - `POST /api/cron/dispatch` → send everything that's due
  - **Mandatory GDPR compliance webhooks** (App Store requires all three; HMAC-verified):
    - `POST /api/webhooks/customers-data-request`
    - `POST /api/webhooks/customers-redact`
    - `POST /api/webhooks/shop-redact`
    Register these three URLs in the Partner Dashboard → *App setup → Compliance webhooks*
    (or under `[webhooks]` in `shopify.app.toml`). They already verify the HMAC and, for
    the redact topics, purge the shop/customer from the current in-memory stores — swap
    those stubs for real DB deletes in production.
  - Needs a Shopify Partner app + the env in [.env.example](.env.example) to run live.

## Develop

```sh
npm run dev          # http://localhost:3000  (/ and /app)
npm test             # vitest — engine + schedule tests
npx tsc --noEmit
```

## Status

Prototype: the insight engine and dashboard are real and tested on mock data; the Shopify
integration is a wired skeleton awaiting Partner credentials + a real DB/email provider
(token storage and sending are in-memory stubs, clearly marked). Deployable to Vercel.

---

# Product Importer (`/catalog`)

An internal tool for a Sydney ski/snowboard retailer that turns supplier invoices, order
confirmations and spec sheets into a ready-to-upload Shopify product CSV (or pushes products
straight to Shopify via the Admin API). It lives alongside Afterword in this repo under
`/catalog`, with its own login.

**Flow:** upload files → extract line items (CSV/XLSX parsed directly; PDFs, scans and photos
read by Claude) → map supplier columns once per supplier (saved as a template) → products are
grouped into variants, categorised, priced with a GST-aware profit engine and given images →
review everything in a spreadsheet-style grid → export a validated Shopify CSV (auto-split at
15MB) or push to the store → every batch is logged with its profit summary.

## Run it

```sh
cp .env.example .env.local            # set DATABASE_URL (SQLite default is fine) and ANTHROPIC_API_KEY
npm install                           # also runs `prisma generate`
npm run db:push                       # create the SQLite schema (or your Postgres schema)
npm run catalog:seed -- --admin you@shop.com "Your Name" a-strong-password
npm run dev                           # open http://localhost:3000/catalog
```

Without `--admin`, the first visit to `/catalog` shows a one-time setup screen to create the
admin account. `catalog:seed` also loads the recommended pricing rules (40% margin skis,
keystone accessories, …) and category rules; both are editable under **Pricing & categories**.

Sample supplier files to try are in `samples/`:

| File | What it exercises |
|---|---|
| `atomic-prebook.csv` | Tidy AUD ex-GST pre-book with style codes, EANs, RRPs and image URLs |
| `volkl-invoice.xlsx` | USD invoice, no GST, preamble rows above the header, line totals instead of unit prices |
| `burton-invoice.pdf` / `.txt` | Text-only PDF, AUD inc-GST prices, sizes and lengths embedded in descriptions |

`samples/expected/` holds the Shopify CSV and profit figures each sample must produce; the
regression test in `src/lib/catalog/samples.test.ts` fails if they drift. Regenerate them
with `npm run catalog:fixtures` after an intentional change.

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
