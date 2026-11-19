# Synthetic reading corpus

Made-up suppliers, products and prices in the layouts real suppliers use, each beside an answer
key (`<name>.key.json`) that says what every line should read as. `npm run eval:read` scores the
reader against them by trade and by kind of document; `--baseline baseline.json` fails when any
trade scores worse than the recorded baseline.

The real corpus (supplier invoices, which carry wholesale costs) is kept outside the repository
and pointed at with `CORPUS_DIR`. Nothing with a real cost goes in this folder.
