# Bike pack (draft, not yet verified)

The bike trade's starting knowledge: a menu, each kind of product placed in Shopify's Standard
Product Taxonomy (2026-08), what each kind varies by, the trade's size systems and colour
shorthand, and a few lines as they read.

**Not verified.** `pack.json` says `"verified": false`, and it stays that way until two or three
real documents from pilot bike shops have been scored with and without it (docs/PILOT.md,
`npm run eval:read -- --pack bike`). Until then it is a starting point, and every shop's own
store overrides it.

## Where it comes from

- **Categories:** Shopify's Standard Product Taxonomy, release 2026-08, Sporting Goods > Outdoor
  Recreation > Cycling.
- **Wheel and tyre sizes:** ISO 5775 (ETRTO) bead seat diameters, 584 for 27.5"/650b and 622 for
  29"/700c.
- **Frame, helmet, shoe and clothing sizes:** common retail practice. Brands publish their own
  charts, and they differ. `helmet-size`'s centimetre bands are typical, not exact.
- **The menu, supplier words, code hints and reader examples:** general knowledge of the trade,
  with made-up products. These should be checked against real shops' catalogues
  (`npx tsx scripts/ground-pack.ts <store>…`) and real supplier documents before the pack is
  marked verified.

## Left out on purpose

No supplier's invoice layout, brand colour-code table or prepack rule. Those are learned from each
shop's own documents.
