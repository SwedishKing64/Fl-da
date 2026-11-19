/** The shapes a simulated trade is described in. The trades themselves are in world.ts (and trades/snow/sim-world.ts). */

export interface OptionSpec {
  /** The option as the shop would name it: Size, Colour, Length, Capacity. */
  name: string;
  values: string[];
}

export interface KindSpec {
  /** The product type as the shop's export writes it. */
  type: string;
  /** The first letters of the supplier's codes for this kind. */
  prefix: string;
  /** Model names are a noun and a suffix: "Ridge 94", "Covert Jacket". */
  nouns: string[];
  suffixes: string[];
  options: OptionSpec[];
  /** Wholesale cost, from and to. */
  cost: [number, number];
  /** RRP as a multiple of cost. */
  markup: number;
  /** Made for men and for women as two products. */
  gendered?: boolean;
  /** The tags the shop puts on every product of this kind. */
  tags: string[];
}

export interface TradeWorld {
  id: string;
  /** The trade pack a shop of this trade starts from. */
  pack: string;
  /** What the shop sells, in words, for its profile. */
  name: string;
  shopNames: string[];
  brands: string[];
  kinds: KindSpec[];
}
