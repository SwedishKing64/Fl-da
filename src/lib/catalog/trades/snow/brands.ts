/**
 * The brands the snow and outdoor trade deals in, the distributors who send several of them on one
 * order, and the brands that make snowboard gear and no ski gear. Trade knowledge, not any one
 * shop's: a shop's own vendors are learned from its store and laid over these.
 */

/** Brands the trade knows, spelled as a vendor column usually spells them. */
export const SNOW_BRANDS = [
  "Volkl", "Marker", "Dalbello", "Atomic", "Salomon", "Rossignol", "Dynastar", "Look", "Head", "Tyrolia",
  "K2", "Line", "Full Tilt", "Nordica", "Blizzard", "Tecnica", "Elan", "Fischer", "Black Crows", "Faction",
  "Armada", "Moment", "DPS", "Kastle", "Stockli", "Scott", "Dynafit", "ATK", "Fritschi", "Madshus", "Rottefella",
  "Burton", "Jones", "Nitro", "Union", "Lib Tech", "GNU", "Never Summer", "Ride", "Arbor", "Capita", "Yes",
  "Bataleon", "Rome", "Flux", "Now", "Vans", "ThirtyTwo", "DC", "Smith", "Oakley", "Giro", "POC", "Anon",
  "Sweet Protection", "Leki", "Komperdell", "Kjus", "Spyder", "Picture", "Rip Curl", "Swany", "Hestra",
  "Black Diamond", "Mammut", "Ortovox", "Pieps", "BCA", "Nemo", "Sea to Summit", "Rab", "Patagonia", "ID One",
  "Helly Hansen", "Arcteryx", "Mountain Hardwear", "Norrona", "Haglofs", "Salewa", "Deuter", "Osprey", "Gregory", "Thule",
  "Camelbak", "Hydro Flask", "Nalgene", "Jetboil", "MSR", "Big Agnes", "Therm-a-Rest", "One Planet", "Columbia", "The North Face",
  "Obermeyer", "Roxy", "Quiksilver", "Billabong", "Dakine", "Swix", "Toko", "Gerry",
];

/** Who sends the goods, as against whose goods they are: a distributor is never a brand. */
export const SNOW_DISTRIBUTORS = ["Sportrade", "Sportrade Australia", "Amer Sports Australia", "Outdoor Gear Australia"];

/**
 * Brands that make snowboard gear and no ski gear. Their boots are snowboard boots and their
 * bindings snowboard bindings, whatever a category rule written for ski boots makes of the word
 * "boot".
 */
export const SNOWBOARD_BRANDS = ["Burton", "Anon", "Jones", "Nitro", "Union", "Lib Tech", "GNU", "Never Summer", "Ride", "Arbor", "Capita", "Yes", "Bataleon", "Rome", "Flux", "Now", "Vans", "ThirtyTwo", "DC", "Nidecker", "Slash", "Korua", "Endeavor", "Roxy"];
