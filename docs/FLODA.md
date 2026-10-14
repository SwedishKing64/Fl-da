# Floda — the product

Floda is the product made from Rubin, the internal tool built for Alpsport, a Sydney ski and
snowboard retailer. Rubin stays with Alpsport in its own repository and keeps running their shop.
Floda is a copy of the same code, with the same history, that is being turned into something any
specialty retailer can use. Read `HANDOVER.md` for what Rubin does and the rules it carries; this
file is about what has to change for Floda.

## The principle

Nothing about a shop lives in code. Rubin already reads much of a shop's conventions from its own
Shopify exports — product templates, remembered listings, tag spellings. Floda finishes that idea:
every convention becomes data learned from the shop's exports or set in Settings, and the code
holds only the supplier knowledge that is the same at every retailer.

## What is Alpsport's today, and where it goes

| Alpsport's, in code today | Becomes |
| --- | --- |
| The menu tree in `src/lib/catalog/taxonomy.ts` (headings, shelves, sections) | Learned from the shop's exports at onboarding, confirmed on a review screen, stored per shop |
| Tag spellings in `src/lib/catalog/tag-spelling.ts` | Generated from the shop's exports at onboarding (the generator exists) |
| The `123abc-xx` builder marker and its initials | A per-shop setting: marker pattern and staff initials |
| Snow-specific rules: binding classification (`mount.ts`), mount charges, ski packages, board, boot and accessory filing, pack shelves | A "snow and outdoor" rules pack a shop switches on, with per-shop overrides |
| Price endings and the recommended-retail pricing policy | A per-shop pricing setting |
| Shopify's own tags (price bands, sizes, colours) | Already generic |
| Supplier readers: Burton, Volkl, Head, Osprey, Swany and the rest | Stay shared; every shop that onboards improves them for all |
| Document reading, delivery matching, bulk changes, QuickBooks bills | Already generic |

## The plan, in order

1. **A second shop on the current code**, as its own deployment. Days of work. It shows which
   conventions break first and whether a retailer will pay. Nothing below is worth doing before
   this has happened.
2. **Conventions as data.** Taxonomy, spellings, marker, pricing policy and the snow rules pack
   as per-shop data, with Alpsport's current values migrated as the first instance. Four to six
   weeks. Floda gets its own name and face in this step; the landing page at `/welcome` is the
   start of that.
3. **Multi-tenancy, onboarding, billing.** A Shop record, every table and file path scoped by
   it, logins belonging to a shop; sign-up, export upload, convention review, rules pack choice;
   Stripe or Shopify app billing with document reads metered. Four to six weeks.
4. **Shopify App Store listing**, if wanted. Weeks, mostly review and polish.

## What must be true before an outside shop's invoices go in

- Per-shop data isolation; wholesale costs are sensitive.
- A short terms document and a privacy policy.
- API cost per document read priced into the subscription.
- Error reporting, an admin view across shops, and a way for a shop to send the file that failed.

## Working on Floda

Everything in `HANDOVER.md` under "Working on it" applies. In addition:

- Alpsport's Rubin and Floda share history up to the split. A fix to a supplier reader or to the
  document reading is worth carrying to both; a change to a convention is Floda's alone once
  conventions are data.
- Leads from the landing page are kept in the `AppSetting` table under the key `floda.leads`
  until there is a proper place for them.
