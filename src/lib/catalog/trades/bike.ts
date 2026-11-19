/**
 * The bike trade, loaded from its files in packs/bike (see knowledge.ts and its README). A draft:
 * not verified on real documents yet, and a starting point a shop's own store overrides.
 */

import { packFromFiles } from "./knowledge";
import pack from "./packs/bike/pack.json";
import kinds from "./packs/bike/kinds.json";
import sizes from "./packs/bike/sizes.json";
import colours from "./packs/bike/colours.json";
import readerExamples from "./packs/bike/reader-examples.json";

export const BIKE_PACK = packFromFiles({ pack, kinds, sizes, colours, readerExamples });
