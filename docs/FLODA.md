# Flöda — the product

Flöda is the product made from Rubin, the internal tool built for Alpsport, a Sydney ski and
snowboard retailer. Rubin stays with Alpsport in its own repository (`RubinAlp/Rubin`) and keeps
running their shop; nothing here touches it. Flöda is a copy of the same code, with the same
history, turned into something any specialty retailer can install and use. Read `HANDOVER.md`
for what Rubin does and the rules it carries; this file is about what Flöda is.

## The principle

Nothing about a shop lives in code. A fresh Flöda is blank: it learns the shop from the shop's
own Shopify export, and the rules Rubin was built with are a pack a shop switches on if it sells
snow and outdoor gear. The code holds only what is the same at every retailer — how documents are
read, how lines are matched to listings, how a change is checked before it goes to the store —
and the supplier knowledge every shop that onboards improves for all.

## What is in place (2026-10-14)

**The shop's conventions are data.** `taxonomy.ts` is a replaceable vocabulary: the snow-and-
outdoor menu is one rules pack; a blank vocabulary is the other; what was learned from the shop's
export is added to either. `learn.ts` reads that export — the kinds of product, the menu tags that
run across kinds, how each shelf tag is spelled — and `shop-profile.ts` keeps it with the shop's
profile (name, country, currency, tax, what it sells, pack, marker tag) and puts it in force on
every request. The marker tag ("123abc-zb" at Alpsport) is the shop's own or none. The prompts
describe the retailer from its profile. The snow rules are seeded when that pack is chosen and
taken out again when it is not. The tests run against Alpsport's conventions (`src/test-setup.ts`).

**Setup is a walk-through.** `/setup`: the admin account; the shop; its catalogue (one or several
exports, read in the browser, and the vocabulary, the templates per brand and kind, and the
listings are kept); how the shop writes a listing (below); the API key that reads PDFs and photos
(kept in the copy's own database when the host sets none, tried before it is kept); and a page
saying how to work. Home carries a getting-started checklist until it is all done; Settings has
the same cards, so any of it can be redone.

**How the shop writes a listing is data too** (`house.ts`, kept under `shop.house`, in force with
the rest of the conventions): whether the brand leads the title, whether the year goes after the
name, whether a supplier's capitals are cased back; what goes in the SKU column and whether a
barcode is kept, required or never written; weight as nothing, a band per kind, or one figure;
tag rules the export cannot show ("when the brand says Burton, add snowboard"), kept as
`TagRule` rows named `house: …`; how a description is laid out and written, with the heading over
the details list and one real description as the shape to match; and anything else in the shop's
words, which goes to the reader with the house rules. `titles.ts`, the build in `pipeline.ts`,
`validate.ts` and `seo.ts` read it. A body taken from a brand page, the web lookup or the build
goes through `description-style.ts`: the manufacturer's words and details, laid out by the model
in the shop's format, which may not add a fact, and the plain layout (`houseBody`) whenever that
cannot run. A brand page's pictures are looked at against the colours ordered
(`colour-match.ts`): the ones of another colour are left out, and where several colours were
ordered each kept picture is matched to the colour it shows and put on that colour's first
variant (`page-link.ts`); the CSV gives the other sizes of that colour the same picture
(`pipeline-pure.ts`). The first invoice from a supplier opens the review page with the five things a new
layout gets wrong; after that the page says how the supplier's paperwork has read, from what
people changed after the build (`supplier-record.ts`, `supplier-score.ts`).

**Feedback.** A Feedback button on every page of the app. On the vendor's deployment the note
lands on the Clients page; an installed copy sends it to `FLODA_LICENCE_SERVER/api/feedback`
with the shop, page and version on it, and keeps it in its own database if the vendor cannot be
reached.

**Clients and licences.** The vendor's own deployment runs with `FLODA_VENDOR=1`: it keeps the
`Client` table, shows `/clients` (every shop, plan, standing, key, last check-in and version;
leads from the landing page become clients on a 14-day trial), and answers `/api/licence`. Every
other copy is built with `FLODA_LICENCE_SERVER` pointing at the vendor; the shop enters its key
in Settings, the copy checks in about daily, keeps working for a month if it cannot reach the
vendor, and shows a banner — never a lockout — when the vendor says the licence is paused, ended
or unknown. `licence.ts` is the pure half, `licence-store.ts` the copy's side. The plan, the days
left on a trial and the month's use against the plan sit in the sidebar for everyone, amber when
the trial is three days from ending or the month is past the plan, with a banner for the former,
so neither is a surprise on the way to the paywall. A copy asks for its licence at the first
address that can be reached (`reachVendor` in `licence.ts`): the one a person set under Settings
→ Licence ("Can't reach Flöda? Its address", kept in `AppSetting`), then the one the build baked
in (`FLODA_LICENCE_SERVER`, floda.ai), then the deployment's own address (`LICENCE_FALLBACKS`,
fl-da.vercel.app). An address that cannot be reached is passed over, and when none can be the
error says why for each (no DNS record, nothing answering, certificate refused, no answer in 15
seconds) rather than "fetch failed". The trial step shows the address form when the trial could
not be started for that reason.

**The desktop app.** `desktop/main.cjs` (Electron) opens a window on the same Next.js server,
started on this machine on a free port with a SQLite database and a files folder in the user's
app-data directory (`desktop/launch.cjs`). `scripts/desktop-build.mjs` builds the server as a
standalone folder with an empty template database; `electron-builder.yml` wraps it;
`.github/workflows/desktop.yml` builds the Windows installer on a Windows runner and the Mac
disk image on a Mac runner whenever a `v*` tag is pushed, and attaches them to the release.

**Keeping a copy current.** `desktop/update.cjs` (electron-updater) asks this repository's
releases for a newer version twenty seconds after the app starts and every four hours after
that, reading the `latest.yml` / `latest-mac.yml` electron-builder writes beside the installers
(`publish` in `electron-builder.yml`; the workflow attaches the yml, zip and blockmap files to the
release with the installers). On Windows the new installer is downloaded in the background and
the person is asked to restart now or later; it installs on quit either way. On a Mac an unsigned
app cannot install over itself, so until there is an Apple Developer identity the copy only says
a newer version exists and opens the releases page. Nothing is checked in development. The Help
menu shows the version the copy is.

**What stops an export.** The shop imports the CSV as it is, so a wrong number in the file is a
wrong number on the shop. Most of what Shopify would reject has one right answer and is repaired
on the way out (`repair.ts`); four things have no right answer a program can pick, and they stop
the export by name (`hardErrors` in `validate.ts`, `HARD_CODES` in `types.ts`): a barcode that
fails its own check digit (`gtin.ts`: EAN-8, UPC-A, EAN-13, GTIN-14), a SKU column holding good
barcodes while the barcode column does not (the two columns swapped), a price under the landed
cost, and a margin above the ceiling (a cost in the price column, a list price in the cost column,
a carton price read as a unit price). The margin band — warn under the floor, refuse over the
ceiling, 20% and 80% to start — is on the Pricing page. Errors cannot be dismissed; warnings can.
A barcode of an odd length is a warning. The sample invoices carry barcodes with real check digits.

**A product that could be one of several.** A batch is checked against what the shop already
sells (`reconcileBatch` in `shopify.ts`): the store's own catalogue when one is connected, read
again when the copy of it is a day old, otherwise the listings learned from the shop's export
(handles and barcodes). Each built product is placed by barcode, SKU and handle
(`match-candidates.ts`). One match is taken and the handle becomes the shop's, since that is what
the CSV updates by; none is a new product; more than one is never guessed at: the product is
`AMBIGUOUS`, which is an error that stops the export, and the drawer on the review grid lists
what it could be so a person says which, or that it is new. That decision is kept across checks.
The check runs again right before a CSV is made, and from the "Check against the shop" button.
**A supplier's layout changes.** A remembered mapping is keyed by the file's headings, and a
file whose headings differ in any way (a column added, dropped, renamed or reordered) used to be
read from scratch without a word, losing what the shop had chosen. Now `mappingState` finds the
nearest remembered layout (`nearestTemplate` in `mapping.ts`: the most headings in common, at
least two), carries its choices over for the columns that still exist (`trimToHeaders`), and
reports the difference (`HeaderGroup.drift`). Such a file is not built unasked: the build says
what changed, the mapping screen shows it, and applying it there remembers the new layout beside
the old. A file that shares fewer than two headings with any remembered layout is a different
document and is read as before.

**The review grid's first columns stay put** (the box, the arrow, the dots, the picture, the SKU,
and a product row's title) while the rest scrolls; the offsets are measured off the header cells.
The dots are explained above the grid, and the errors pill filters the grid to the rows with
errors. Product pages take several links pasted at once, placed by name or in order. On the shop's
first two batches the review page names a Flöda engineer to write to. The home checklist is
named the way the setup steps are. The "How you list" step shows what a title comes out as.
**Backups.** A copy on a file (every desktop copy) is copied with SQLite's `VACUUM INTO` into
a `backups` folder beside the database (`backup.ts`): once a night while the app is open (checked
after each page, `nightlyIfDue`), from "Back up now" on Settings, and before a restore. The newest
fourteen are kept; each can be downloaded from Settings (admins) and the desktop File menu opens
the folder. Restore puts a copy in place after backing up what is there, and asks for a restart.
A hosted copy on Postgres has none of this: its host keeps the backups.

**A delivery applied twice.** On Prices and stock, adding a delivery's stock twice makes six of
three. The page asked before doing that, but only within one page load and only by filename. A
delivery is now remembered by what is on it (`applied-memory.ts`: a fingerprint of the lines),
in the browser's storage, so the question is asked after a reload or a re-saved file too, with
when it was applied; undoing the delivery forgets it.

**Gone from Flöda:** Bills for QuickBooks, the copy-from-the-old-site migration, and every seed
that belonged to one shop.

## Where each copy runs

| Copy | How | Database and files | Licence |
| --- | --- | --- | --- |
| The vendor (floda.ai) | Vercel, `FLODA_VENDOR=1` | Neon Postgres, Vercel Blob | issues them |
| A shop's desktop app | the installer from a release | SQLite and a folder in app-data | checks `FLODA_LICENCE_SERVER` |
| A shop's own hosted copy | Vercel from this repo | Neon, Blob | same, when the variable is set |
| Development | `npm run demo` | `prisma/dev.db`, `./storage` | none (`FLODA_LICENCE_SERVER` unset) |

## Known limits

- The desktop app keeps uploaded product photos on the machine, so a Shopify CSV that refers to
  them carries local paths Shopify cannot fetch. Pictures taken from brand pages are remote URLs
  and work. A hosted copy with a Blob store does not have this problem.
- Pricing is still modelled as one home currency with one sales tax; the column names say AUD and
  GST. The profile's currency and tax name are used in prompts and labels, and the tax rate is
  the one used in pricing, but a shop in two currencies is not supported.
- The desktop installers are unsigned until there is a Windows code-signing certificate and an
  Apple Developer account. Windows shows a SmartScreen notice. The Mac app is ad-hoc signed under
  the hardened runtime with Electron's entitlements (`desktop/after-pack.cjs`,
  `entitlements.mac.plist`), so macOS says it "could not verify" the app and System Settings →
  Privacy & Security → Open Anyway gets past it (right-click → Open no longer does on macOS 15+).
  Without a signature Apple silicon reports the app as "damaged", and without the JIT
  entitlement macOS 26 stops Electron as it starts (a trap in V8 before any of Flöda's code
  runs). The bundle is `Floda.app` on disk and "Flöda" everywhere a person sees it: the plist's
  CFBundleName must stay `Floda`, because Electron finds its helper apps by that name and stops
  at launch ("Unable to find helper app", a trap 110 ms in) when `Floda Helper.app` is not what
  it looks for; the shown name comes from `InfoPlist.strings`, written in after-pack, and
  `app.setName("Flöda")` in `main.cjs`. If a copy from an earlier build says damaged:
  `xattr -dr com.apple.quarantine /Applications/Floda.app`.
- One shop per install. The conventions are process-wide state, which is right for an installed
  copy and for one hosted copy per shop, and wrong for several shops in one deployment.

## What is next

1. The first outside shop on the desktop app, with their own export and their own paperwork.
   What breaks first decides the next step.
2. Learned conventions shown and editable on Settings (which menu a kind sits under, a spelling),
   rather than only re-taught from a newer export.
3. Signing certificates for the installers: a Windows code-signing certificate, and an Apple
   Developer identity, which also lets a Mac copy install an update itself.
4. Billing. The Clients page records the plan; nothing yet charges for it.

## Working on Flöda

Everything in `HANDOVER.md` under "Working on it" applies. In addition:

- Alpsport's Rubin and Flöda share history up to the split. A fix to a supplier reader or to the
  document reading is worth carrying to both; a change to a convention is Flöda's alone.
- `npm run desktop:build` then `npm run desktop:check` runs the built server under plain Node
  against a throwaway data folder and hits three pages. Packaging runs the same check against
  the packaged copy (`desktop/after-pack.cjs`), because electron-builder leaves out the top-level
  `node_modules` of any folder it copies as an extra resource — the server is therefore copied
  from `.next` with a `standalone/**` pattern, not from `.next/standalone`. A build that ships
  without its `next` package fails there, not on a customer's machine (as v0.1.3 did).
- Leads from the landing page are kept in `AppSetting` under `floda.leads` until they become
  clients.
- Setup has a "Your suppliers" step (`SuppliersStep.tsx`): one example of each supplier's
  paperwork is read on the spot into a batch of its own (`createExampleBatchAction`), every
  column is shown against what it was taken for (`exampleStateAction` over `mappingState`), the
  person corrects anything in the wrong place, and "remember it" saves the layout as that
  supplier's `MappingTemplate` and builds the products so they can be looked over. A PDF or photo
  read by AI has no columns; its lines go to the review grid, where corrections count on the
  supplier's record. The step can be skipped and comes back on the Home checklist.
- The public site (`src/app/(marketing)/`): `Shell.tsx` is the frame every public page sits in
  (the bar with Product and Company menus, Pricing and Download, a mobile menu, a progress line,
  the footer); `Story.tsx` holds the scroll story on the landing page (a pinned panel that
  changes with the step in view) and the FAQ accordion. Pages: `/welcome` (landing), `/about`,
  `/faq`, `/privacy`, `/download` (the newest release's installers, asked of GitHub's API and
  remembered for ten minutes, with the releases page as the fallback). `src/proxy.ts` lists them
  as public. The landing page uses real screens (`public/shots/`, captured from a copy with a
  generic supplier order read into it, products across apparel, footwear, bags and homewares) in
  the hero, the "What it does" tiles and the "The product" gallery (`Screens.tsx`); every header
  page has a menu. The mark is a plain F on the blue tile (`Logo.tsx`, `icon.svg`).
- A copy that checks a licence begins setup with its plan (`TrialStep.tsx`): the admin picks a
  plan and starts the 14-day trial from inside the app, or enters a key. The vendor answers
  `POST /api/licence/trial` by making the client and the key (one trial per email address) and
  the copy keeps the key at once (`beginTrial` in `licence-store.ts`). When a copy may not run
  (`licenceState` is `none` or `lapsed`: no key, the trial over, paused, ended, or the vendor
  unreachable for a month) `(app)/layout.tsx` shows `Paywall.tsx` instead of every page: what
  happened, the plans, a Subscribe button that writes to hello@floda.ai with the key, and a field
  for a new key. Nothing is charged by the app; a person turns the key back on. Staff see who to
  ask. The vendor's own deployment and development (no `FLODA_LICENCE_SERVER`) have no gate.
- Plans (`src/lib/catalog/plans.ts`) are sized by the month's paperwork: Starter $49 (2 invoices,
  about 100 products, one person, $20 of reading), Shop $149 (10 invoices, about 500 products,
  everyone, $60 of reading; the founding price, held), Unlimited $299 (no counts, $150 of
  reading). The ids used before there were tiers (`founding`, `standard`, `trial`) all mean the
  Shop plan. A copy reports its month's invoices and products at check-in; the Clients page shows
  them against the plan, the copy's Settings and a banner say when a month has gone past it, and
  nothing stops: the reading allowance (set from the plan, editable per client) is the only hard
  limit. The landing page sells a 14-day trial on any plan, and promises that a forward-deployed
  engineer sets every shop up on a call, on its own invoices. The sums on it come from the shop
  it was built in: a 50-product order is about 12 hours and $350 of staff time by hand, 2 hours
  and $60 through Flöda, checking included. The pricing section now carries a savings calculator
  (`Calculator.tsx`): hourly wage, products a month, hours per 100 products by hand and the
  shop's own checking time are sliders; Flöda's own time is about 15 minutes per 100
  products with a 5-minute floor and economies of scale (`15 × (n/100)^0.75`, never under 5); the plan is suggested from the volume and the monthly saving is net of its price.
- Reading through Flöda (`src/app/api/ai/[...path]/route.ts`, `src/lib/catalog/ai-usage.ts`): a
  copy on a plan with no key of its own has its SDK pointed at the vendor's `/api/ai` with the
  licence key as bearer token (`anthropic.ts` `setRelay`, put in force by `shop-profile.ts` from
  the licence row). The vendor checks the key's standing and the month's allowance, forwards
  `v1/messages` (and `count_tokens`, nothing else) with its own `ANTHROPIC_API_KEY`, streams the
  answer back, and counts the tokens on the `Client` row (`aiMonth`, `aiInput`…, `aiCapCents`,
  default $60 a month; 0 is no limit). A paused or ended client, or a spent allowance, is refused
  with a `floda_error` whose sentence `api-errors.ts` shows as it is. A key the shop pastes in
  Settings, or one on the host, is used instead of the relay. The documents being read pass
  through floda.ai on their way to Anthropic and are not kept there. Two limits of the vendor's
  host: a request body over Vercel's limit (4.5 MB) cannot pass, and a reading longer than the
  route's `maxDuration` is cut off.
