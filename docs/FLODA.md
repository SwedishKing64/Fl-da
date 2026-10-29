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
in (`FLODA_LICENCE_SERVER`, fl-da.vercel.app, the deployment's own address), then the fallbacks
(`LICENCE_FALLBACKS`: fl-da.vercel.app, then floda.ai for the day that name exists). An address that cannot be reached is passed over, and when none can be the
error says why for each (no DNS record, nothing answering, certificate refused, no answer in 15
seconds) rather than "fetch failed". The trial step shows the address form when the trial could
not be started for that reason.

**Accounts on the website.** A shop makes its account at `/account/signup` on the vendor
(`account.ts`: the `Client` row gets a password, sessions in `ClientSession` under the
`floda_account` cookie, separate from the vendor's own staff login). Making one starts the
14-day trial and mints the key; an email that already has a licence but no password claims it.
`/account` shows the plan and standing, the licence key, the fortnight's reading against the
allowance (`AllowanceBar`), and the billing buttons (checkout and portal, direct from the site).
A copy is licensed by signing in with the same email and password (`SignInStep` in setup, the
paywall's "none" state; `POST /api/licence/signin` hands over the key), or by typing the key;
starting a trial from inside the app is refused and names the signup page. **The allowance
bar**: the copy asks the vendor for its fortnight's reading (`/api/licence/usage`,
`readingUsage()` cached two minutes and forgotten after each reading through the relay) and
shows the bar under the plan in the sidebar and on the Licence card; the account page shows the
same from the row itself. When the fortnight's reading is spent the relay refuses with
`limitReachedMessage`: "You have reached your fortnightly limit…" and the date it starts again,
never a key or a balance; a money refusal from the reading service itself is worded as Flöda
being unavailable on a plan, and as the shop's own Anthropic credit on the Own key plan.

**Paying for a plan.** Stripe, on the vendor (`stripe.ts`): the copy's paywall and the Licence
card on Settings carry a button per plan that asks the vendor for a checkout page
(`POST /api/licence/checkout`, the licence key and the plan) and opens it in the browser; a copy
that has paid gets "Card, plan and invoices" instead, Stripe's customer portal
(`/api/licence/portal`). Stripe reports back on `POST /api/billing/webhook`: the signature is
checked by hand (`verifyWebhook`, HMAC over `t.body`, five minutes' tolerance), then
`checkout.session.completed` makes the client ACTIVE on the plan paid for and keeps the Stripe
customer and subscription ids on the `Client` row, and `customer.subscription.*` keeps the
standing current (`standingFromSubscription`: paid is active, a failed renewal pauses, a
cancellation runs to the end of the period paid for, then ends; the Clients page shows Stripe's
word). The copy learns of a change the next time it checks its key; the pages Stripe sends the
person back to (`/billing/paid`, `/billing/cancelled`, `/billing/portal-done`) say to press
"Check the key". Stripe is reached with plain fetch, no SDK. On the vendor: `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET` (the endpoint is `https://<vendor>/api/billing/webhook`, events
`checkout.session.completed` and `customer.subscription.*`) and a price id per plan in
`STRIPE_PRICE_STARTER`, `STRIPE_PRICE_SHOP`, `STRIPE_PRICE_UNLIMITED` (recurring every two
weeks); with any of them missing
the buttons say paying online is not set up and name the support address instead. **The support
address** is one constant (`support.ts`, `NEXT_PUBLIC_FLODA_SUPPORT_EMAIL`, hello@floda.ai until
it is set; the desktop workflow passes `vars.FLODA_SUPPORT_EMAIL`), used by every page, notice
and refusal. **The terms** are at `/terms`, in the same voice as the privacy page.

**The desktop app.** `desktop/main.cjs` (Electron) opens a window on the same Next.js server,
started on this machine on a free port with a SQLite database and a files folder in the user's
app-data directory (`desktop/launch.cjs`). `scripts/desktop-build.mjs` builds the server as a
standalone folder with an empty template database; `electron-builder.yml` wraps it;
`.github/workflows/desktop.yml` builds the Windows installer on a Windows runner and the Mac
disk image on a Mac runner whenever a `v*` tag is pushed, and attaches them to the release.

**Blank slate.** A new copy of Flöda carries nothing of any one shop: no binding list, no
default packages, no mounting charges, no seeded tag rules, no brand list outside a trade pack. A
trade pack ticked at setup is a starting point (a menu, tag spellings, reading rules, the trade's
brands); a shop that ticks none starts from its own export, website and paperwork alone. The
things a ski shop needs that the pack cannot know are its own, set on Settings → Bindings for ski
packages: the bindings it packages skis with (name, RRP, wholesale), what it charges to mount
(`settings.packages.drillMountFee` / `systemMountFee`) and how it words the two fittings. A ski is
packaged only with the bindings picked for it on the review page or named in an instruction.

**Teach Flöda.** One page (`/training`, admins) for everything Flöda is taught. At the top,
three source tiles (`Sources.tsx`): the catalogue export (`LearnPanel`, with the store
connection folded under it), the website, and a supplier's paperwork (`SuppliersStep` standing
alone, with the remembered layouts listed); each says what it has taught so far and opens to
teach more. Under them, everything Flöda now believes about how the shop lists, in seven areas
(`teaching.ts`, pure: `buildAreas` gives types, tags and categories; titles; descriptions;
variants; pricing; SEO; suppliers' invoices), every belief one sentence badged with where it
came from — the export, the website, the shop, a supplier's paperwork, or Flöda's own default —
and carrying the one editor that changes it (`Edit`: a choice, a text, a kind's field, a tag
rule, a template, a pricing rule, a setting, a supplier's defaults). `Teach.tsx` renders the
areas, opens the editor under the sentence, and ends each area with Add a rule: a tag rule, a
type's title shape, a standing instruction, what a type is sold by, a pricing rule, a rule for
the writer. The JSON actions behind it (`patchHouseAction`, `saveKindAction`,
`saveTagRuleAction`, `savePricingRuleJsonAction`, `saveTemplateAction`,
`saveSupplierDefaultsAction`, and the switch and delete actions) change one thing and leave the
rest. The export now also teaches (`learn-more.ts`, pure, read in the browser): the SEO title
pattern most products follow (`settings.seoTitlePattern`, placeholders `{title} {brand} {type}
{shop}`, used by `seoTitleFrom` and told to the writer), each brand's margin where enough
products agree (a pricing rule named "From your export: <brand>", only where the brand has none),
and, with a key, the way its descriptions are laid out (`describeStyleAction` reads a few middling
bodies and fills `house.descriptions` where the shop has set nothing).
Settings keeps the shop's name and tax, the reading key, staff, backups and the deployment's
health. **The website is the list of kinds of product** (`website.ts`): a Shopify store is read
from `/collections.json`, page by page; any other site from the links in its menus; promotions,
brands, gift cards and pages about the shop are left out (`isKindOfProduct`). The person ticks
what to keep, can add a category the reader missed, and the list is kept under `shop.website`
and folded into the vocabulary (`Conventions.website` in `taxonomy.ts`): every category is a
Type. Once the shop has any kinds of product at all (`typesAreKnown`), a Type outside them is
`UNKNOWN_TYPE`, an error named at the export, and the review grid's Type cell and bulk
action pick from the list rather than take typing. Nothing a reader proposes is ever written as
a Type the site does not have.

**One file at a time, and the kinds named.** Setup's suppliers step and the export step both take
one file at a time. A supplier's file is read as soon as the supplier is named (`SuppliersStep`:
choose, name, read, check the columns, "That's right, remember it", "Add another supplier's
file"). A Shopify export is read one product group at a time (`LearnPanel`): each file's
vocabulary is merged into what earlier files taught (`mergeVocabulary`), its templates replace
only its own earlier ones, and the kinds its rows showed (`kindsFromListings`: the Type, the
tags on most of its rows, a middling title) are laid out in `KindsEditor` for the shop to say
what each is called, the tags every one gets and how its titles read. Those are kept as
`house.kinds` (`KindRule`, `cleanKinds`), told to the reader in `houseGuidance`, and
materialised as tag rules named `kind: …` (`materialiseKindRules` in actions.ts) so the build
writes the shop's name for the kind and its tags on every product of it.

**What reading costs, and how it is kept down.** Three models, by how hard the work is
(`anthropic.ts`): the reading model (`CATALOG_AI_MODEL`, Opus) for a supplier's document and the
check of a whole batch; the working model (`CATALOG_AI_WORKING_MODEL`, Sonnet, half the price)
for web research, a brand's page, an instruction, a plan over an export, product copy, colour
verdicts and joining order lines to a reference sheet; the light model
(`CATALOG_AI_LIGHT_MODEL`, Haiku, a fortieth) for turning research notes into fields and screening
a sheet of instructions. The long fixed prompts (reading a document, planning an adjustment,
splitting an instruction sheet, reading instructions, checking a batch) are marked for the
service's prompt cache through `cachedSystem`, with what differs by shop (its name, what it calls
its tax) in a second block after the fixed one, so every shop reading through the relay shares
one cached prefix and pays a twentieth for it. **A supplier whose paperwork reads clean** —
`readsKnown` in `supplier-record.ts`: at least one finished import and no more than a fifth of
its products changed after reading — has its documents read on the working model
(`ReadOptions.known`, decided per file in `ingestFile` from the batch's supplier); the record keeps
watching, so a supplier that starts reading badly goes back to the reading model by itself, and
the review page says which rate a supplier is on. Spreadsheets with a remembered layout never
reach a model at all. **The relay prices each call at the rate of the model it asked for**
(`rateFor`, `requestedModel` in `ai-usage.ts`; `Client.aiCents` adds up what the fortnight's
calls cost), so the allowance goes as far as the lighter models let it; a model it does not know
is priced as the dearest. A row metered only in tokens, from before calls were priced, is still
priced at the old single Opus rate.

**The rulebook.** The sentences on Teach Flöda come from `rulebook.ts` (pure: `buildRulebook` takes the house conventions, tag rules, templates, pricing
rules, supplier layouts and defaults, supplier records, the website, the export's vocabulary and
the settings, and gives eight stages — reading, naming, filing, pricing, copy, pictures, checks,
export — each a list of `RuleEntry` sentences with where to change it). `describeTagRule`,
`describePricingRule` and `describeLayout` are the sentences. A rule the shop set links to its
form (anchors `#website`, `#suppliers`, `#export`, `#house` on the page, `/pricing`, `/settings`);
Flöda's own rules are listed and badged as Flöda's so the shop knows them. A tag rule can be
switched off, deleted or tried from the rulebook (`setTagRuleActiveAction`, `deleteTagRuleAction`,
`ruleReachAction`: how many products of the latest open batch the rule touches, with a few by
name, nothing changed). A kind's tag rules are said once, under the kind, not again as rules.
`buildRulebook`'s eight stages are no longer shown; Teach Flöda shows the same beliefs by area
(`teaching.ts`), where each can be changed in place. The next steps are turning a correction on
the review grid into a rule, and a rulebook file that exports, imports and rolls back.

**One confidence score per field.** `confidence.ts` (pure) scores a product's title, tags,
picture and price from where each came from, and the product is the lowest of the four: a title
is checked word by word against the order lines it came from (`titleSupport`), a tag against the
shop's vocabulary, a picture by whether it was looked at against the colour, a price by whether
it came from the paperwork, a rule, the brand's site or nowhere, and whether it is under cost or
the floor. A field a person set by hand is right by definition. Above `BAR` (80) a product needs
nobody's eyes; below it, the weakest field's sentence is what a person is shown. `loadReview`
works it out from the products, their line items and the batch's edit log, puts it on each
`ReviewProduct` and tallies `ready` / `needLook` into the summary; the review grid shows the
tally as a strip and the score as a pill on each row. The push will read the same score.

**Tags are matched, never invented.** `tag-gate.ts`: the shop's vocabulary of tags is its
listings, its tag rules and templates, its kinds, the tags the rules work out per product
(`isRuleGenerated`) and the tags it has approved; a shop with none of those yet has an open
gate. The build (`applyMappings`) and the batch check (`batch-agent.ts`) pass every product's
tags through it: a tag the shop has never used is taken off and recorded once as a `TagProposal`
with the product it was meant for; a tag the batch instructions asked for always stays; a tag a
person types on the grid is approved as written (`approveTypedTags`). Teach Flöda lists
the proposals with Approve (a tag of the shop's from then on) and Reject (never proposed again).

**The quick look.** The review opens on the products that need a person, one card each, worst first: the field that pulled each down, its sentence, and that field's fix on the card (the title to retype, the tags to fix, the pictures to open, the retail to set per variant), with "Looks right" as the other answer, which scores the field as if the person had typed it. What is ready is counted and listed on request. The full table is one click away and the choice is remembered per browser; the errors pill opens the table on the rows with errors.

**Pages found, not pasted.** The links people paste are the memory: from each brand's links the shape of its addresses is worked out (its template with the product's slug in it), a new product's name is put into that shape, and the address is fetched and checked against the product's name before it is believed. A brand nobody has linked yet, or a guess that does not hold, goes to one short web search, checked the same way. A page is kept only when it is titled like the product; a wrong page is worse than none. "Find the pages" on the review does the batch; "Find its page" on a card does one product and reads it.

**The store, read rather than told.** With the store connected (Teach Flöda → Your catalogue export → Or connect the store: a domain and an Admin API token, proved by asking the store its name), what an export used to teach is read off the store itself: its listings, its vocabulary (kinds, tags, spelling), the conventions per brand and kind (templates filed under "store", replaced on each read), and the catalogue the batch check matches against. The store is read again before a build when the last read is a day old, and on demand. An export file still works for a shop that would rather not connect; what it taught stays and is joined.

**Pushing without the person, tiered.** With the store connected and the shop opted in (Your store → "Push what is ready on its own"), a build ends with what has earned it going to the store as drafts: a product with every field above the bar, nothing wrong on it and no question of which listing it is, when its supplier has a clean record. Three tiers: auto (everything goes, nothing to do), exceptions (the ready ones go, the rest are the quick look), full (a supplier with no record or a broadly unsure batch: nothing goes on its own). Opted in or not, the quick look carries one button that sends what is ready; a batch is pushed once every product of it is in the store. Drafts only, and a push can be rolled back.

**The open copy.** A desktop build made with `FLODA_OPEN=1` (`electron-builder.open.yml`, the
"open" box on the Desktop app workflow) has no sign-in and no licence: `/open` signs whoever opens
the window in as the copy's owner, an admin called "Shop owner" made the first time
(`src/lib/catalog/open.ts`), the proxy sends anyone without a session there, and `licenceServer()`
is empty so there is no trial, paywall or plan step. The build can carry an Anthropic key of its
own (`FLODA_ANTHROPIC_API_KEY` at build time, the repository secret of the same name on the
workflow), written to `floda.json` and handed to the server as `ANTHROPIC_API_KEY`; it is
readable by whoever has the installer, so it should be a key made for that build, with a spending
limit. The open copy installs beside the ordinary app under its own name and data folder, goes to
a pre-release of its own (`v1.2.3-open`, no `latest.yml`) and never updates itself. Only a desktop
copy should run open: the server listens on the machine alone.

**Keeping a copy current.** `desktop/update.cjs` (electron-updater) asks this repository's
releases for a newer version twenty seconds after the app starts and every four hours after
that, reading the `latest.yml` / `latest-mac.yml` electron-builder writes beside the installers
(`publish` in `electron-builder.yml`; the workflow attaches the yml, zip and blockmap files to the
release with the installers). On Windows the new installer is downloaded in the background and
the person is asked to restart now or later; it installs on quit either way. On a Mac an unsigned
app cannot install over itself, so until there is an Apple Developer identity the copy only says
a newer version exists and opens the releases page. Nothing is checked in development. The Help
menu shows the version the copy is.

**Nothing stops an export.** The shop asked that nothing does, so nothing does: the only thing
that disables the button is a batch with no products. Most of what Shopify would reject has one
right answer and is repaired on the way out (`repair.ts`); a picture at an address Shopify cannot
fetch (a desktop copy's own 127.0.0.1) is left off and said, never a reason to fail the file.
What has no right answer a program can pick is named, by name, above the button and at the top
of the warnings (`hardErrors` in `validate.ts`, `HARD_CODES` in `types.ts`): a barcode that
fails its own check digit (`gtin.ts`: EAN-8, UPC-A, EAN-13, GTIN-14), a SKU column holding good
barcodes while the barcode column does not (the two columns swapped), a price under the landed
cost, a product that could be one of several, a Type the shop does not have. The CSV goes out
regardless, as drafts; those and the warnings still need the "I have reviewed" tick before a push
to the live store. A margin under the floor (20% to start, on the Pricing page) is a warning;
there is no ceiling, since a shop's margins are its own business. A barcode of an odd length is a
warning. The sample invoices carry barcodes with real check digits. Every batch page has a Next
button fixed bottom right (`NextStep.tsx`): upload → review and price → export → the next batch.

**Where a copy's pictures live.** Every picture on a listing is framed on a square and kept in
this app's storage (`pictures.ts`), and Shopify fetches it from there, so it needs a public
address. The website keeps pictures in Vercel Blob. A desktop copy's own address is 127.0.0.1,
which `publicFileUrl` now treats as no address at all, so framed copies are never written with it;
instead a licensed copy on any plan sends each picture to its vendor (`POST /api/licence/picture`,
the licence key as bearer, the bytes as the body), which keeps it in Flöda's Blob store under the
client's id and answers with the public address (`setPictureHost` in `storage.ts`, set from the
licence standing in `shop-profile.ts`). The open copy has no licence, so it carries the store's
token itself (`FLODA_BLOB_TOKEN` at build time, the repository secret of the same name or
`BLOB_READ_WRITE_TOKEN`), written to `floda.json` like its reading key. A copy with neither keeps
the brand's own addresses on the listing, unframed, rather than an address Shopify cannot reach.

**A product that could be one of several.** A batch is checked against what the shop already
sells (`reconcileBatch` in `shopify.ts`): the store's own catalogue when one is connected, read
again when the copy of it is a day old, otherwise the listings learned from the shop's export
(handles and barcodes). Each built product is placed by barcode, SKU and handle
(`match-candidates.ts`). One match is taken and the handle becomes the shop's, since that is what
the CSV updates by; none is a new product; more than one is never guessed at: the product is
`AMBIGUOUS`, an error named at the export, and the drawer on the review grid lists
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
| The vendor (fl-da.vercel.app; floda.ai once that name exists) | Vercel, `FLODA_VENDOR=1` | Neon Postgres, Vercel Blob | issues them |
| A shop's desktop app | the installer from a release | SQLite and a folder in app-data | checks `FLODA_LICENCE_SERVER` |
| A shop's own hosted copy | Vercel from this repo | Neon, Blob | same, when the variable is set |
| Development | `npm run demo` | `prisma/dev.db`, `./storage` | none (`FLODA_LICENCE_SERVER` unset) |

## Known limits

- Pictures on the desktop app: a copy whose shop has connected its Shopify store keeps every picture
  in that store's own Shopify Files (`shopify-files.ts`: staged upload, `fileCreate`, the
  cdn.shopify.com address), and pictures saved before it was connected are sent the same way just
  before a batch is exported or pushed (`picture-publish.ts`). That needs the `read_files` and
  `write_files` scopes: the install link asks for them, and a custom-app token must be given them.
  A copy with no store connected and no licence (the local build) still keeps pictures on the
  machine, which Shopify cannot fetch; pictures taken from brand pages are remote URLs and work.
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
- Several shops per desktop install, one open at a time (`desktop/shops.cjs`, `shops.ts`): each is
  its own database and files folder, the first in the app-data folder as before, the rest under
  `shops/<id>`. Settings → Shops on this computer, or the Shop menu, adds and opens them; opening
  one restarts the server on its folder and shows its sign-in. A hosted deployment is still one
  shop: the conventions are process-wide state.
- Shopify only. Flöda reads a Shopify export and writes Shopify's CSV or pushes through its API.
  Other platforms wait until the Shopify launch has paying shops (decided 2026-10-27; WooCommerce
  was the first candidate).

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

- **Shops Flöda has never seen, by the hundred.** `npm run eval:shops` makes up shops in five
  trades (bike, outdoor, snow, surf, general — `src/lib/catalog/sim/world.ts`, the snow one in
  `trades/snow/sim-world.ts`), each with brands, a range, an export of what it already lists, and
  a season of deliveries rendered the ways suppliers send them (`sim/documents.ts`: three flat
  CSV vocabularies, a barcode-led one, a size grid, a workbook under a letterhead with totals
  below, a sectioned order form, a price list with a few boxes filled in, a distributor's
  multi-brand invoice, and with `--ai` a printed page as text, as a PDF and as a photo). Every
  document comes with the truth it was rendered from, so the reading is scored exactly
  (`corpus.ts`) and so is the build (`sim/score-build.ts`: a product per model, its variants and
  options, a Type the shop has, priced at RRP and above cost, barcodes kept, a CSV and a push
  input Shopify would take). Scores are by trade and by layout; `--write-baseline` records them
  and `--baseline` fails when a trade gets worse; `--out <dir>` writes every shop's export and
  invoices so they can be loaded into the app by hand or by a script. The same seed is always the
  same shops. It found eight reader and build bugs on its first run (HANDOVER, 2026-10-28). It
  is a floor, not a ceiling: real suppliers' files are stranger than any of these.
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
- Plans (`src/lib/catalog/plans.ts`): the **Own key** plan is $20 a month, the software alone,
  with reading on the shop's own Anthropic key (`reading: "own-key"`: the relay refuses its
  clients, the copy never points its reader at the relay, so the key under Settings → Reading
  documents is the only way it reads; its Stripe price recurs monthly, `STRIPE_PRICE_OWNKEY`).
  The other three are billed and sized by the fortnight (`PERIOD`): Starter
  $49 (no invoice count, one person, $20 of reading, described as "about 40 invoices of 5
  products" from `READING_CENTS_PER_PRODUCT`, a deliberately high 10c a product), Shop $149 (10
  invoices, about 500 products, everyone, $60 of reading; the founding price, held), Unlimited
  $299 (no counts, $150 of reading). The ids used before there were tiers (`founding`,
  `standard`, `trial`) all mean the Shop plan. The fortnight is counted from a fixed Monday
  (`periodKey` / `periodStart` in `ai-usage.ts`, kept in the `Client` columns still named
  `aiMonth` and `useMonth`), so the copy and the vendor agree on where one ends. A copy reports
  its fortnight's invoices and products at check-in (the `monthBatches` wire names are kept); the
  Clients page shows them against the plan, the copy's Settings and a banner say when a fortnight
  has gone past it, and nothing stops: the reading allowance (set from the plan, editable per
  client) is the only hard limit. The Stripe prices behind the plans are recurring every two
  weeks. The landing page sells a 14-day trial on any plan, and promises that a forward-deployed
  engineer sets every shop up on a call, on its own invoices. The sums on it come from the shop
  it was built in: a 50-product order is about 12 hours and $350 of staff time by hand, 2 hours
  and $60 through Flöda, checking included. The pricing section now carries a savings calculator
  (`Calculator.tsx`): hourly wage, products a fortnight, hours per 100 products by hand and the
  shop's own checking time are sliders; Flöda's own time is about 15 minutes per 100
  products with a 5-minute floor and economies of scale (`15 × (n/100)^0.75`, never under 5); the plan is suggested from the volume and the fortnight's saving is net of its price.
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
