# Pilot shops: real documents, honestly scored

Phase 2 of the industry expansion memo needs evidence nobody at Flöda wrote. That means real supplier
documents from two or three shops outside the ski trade (bikes first), each with an answer key a
person checked. This page covers how to ask for them, how to make them safe to share, and how they
are scored.

## What to ask a shop

1. "Can I see your last three supplier invoices, exactly as you received them?"
2. "When a delivery comes in, what takes the longest to type up: the product details, the pricing,
   or the sizes and colours?"
3. "Do you mostly reorder from the same few suppliers, or do they change a lot?"
4. "If your first delivery came out 80% right and you fixed the rest by hand, would that be worth
   it, or would you need it closer to 100% before trusting it?"
5. "Would you share a few real invoices with the amounts disguised, so we can test this properly?"
6. "Do you sell across more than one kind of product, or is your shop focused on one trade?"

A "no" to question 5 is an answer in itself. The memo says that if no pilot shop will share, stop
planning reference packs and put everything into the teaching loop.

## Making the documents safe to share

Run this on the shop's own computer, before anything leaves it:

```
npx tsx scripts/redact.ts invoice-1.xlsx invoice-2.csv invoice-3.pdf --out redacted
```

- **Spreadsheets (CSV, XLSX):** every amount is multiplied by one factor, chosen at random for each
  file and never written down. Layout, codes, quantities and arithmetic stay true, but no figure is
  the real one.
- **PDFs with text:** these come out as their text, with the amounts disguised.
- **Scans and photos:** these can't be disguised by the script. Cover the prices by hand.
- **Check every disguised file by eye** before it is shared. Remove anything else the shop would
  rather keep private, such as an account number or a contact.

## The answer keys

The script drafts a key beside each spreadsheet: `invoice-1.key.json`, holding the reader's own
reading of the file. The scorer ignores a key while it says `"checked": false`. For each key:

1. Open the document and the key side by side, and correct every line. A key has one line for each
   thing the shop stocks: per size, per colour, per option. Freight, discounts and notes are not
   lines.
2. Fill in `trade` (`bike`, `outdoor`, `snow` and so on) and `kind` (`csv`, `grid`, `pdf-text`,
   `multi-brand`, `order-form`).
3. Add `totals`, but only where the document prints them: `{ "units": 14, "subtotal": 2310.40 }`.
4. Set `"checked": true`.

A PDF's text gets no draft; write its key by hand in the same shape. The format is
`CorpusKey` in `src/lib/catalog/corpus.ts`, and `samples/corpus/` has examples.

## Scoring

The real documents never go in the repository. Keep them in one folder per trade, outside it, and
point the scorer at them:

```
CORPUS_DIR=~/floda-corpus/bike npm run eval:read
CORPUS_DIR=~/floda-corpus/bike npm run eval:read -- --write-baseline ~/floda-corpus/bike/baseline.json
```

The scorer reports lines found, fields right, and documents adding up to their totals, broken down
by trade and by kind of document. Record the first run as the baseline. From then on,
`--baseline` fails any change that makes a trade worse. The memo's starting bar, to be replaced
once real numbers exist, is that most lines need no correction and no line is silently wrong on
price.
