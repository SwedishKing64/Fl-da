/**
 * Reading the shop's own sale and clearance template, without asking a model to interpret it.
 *
 * A written sheet has to be read by a model because a sentence can say anything. A template does
 * not: the columns are fixed, so what each cell means is settled before anyone opens the file.
 * Reading it here rather than sending it away is faster, costs nothing, and — the part that
 * matters — is exact. The reading cannot drift between two uploads of the same file, and a year
 * tag cannot be borrowed from the row above because nothing here is guessing.
 *
 * Anything that is not this template falls through to the model, which is what a buyer's
 * hand-written page still needs.
 */

const ALIASES: Record<string, string[]> = {
  year: ["year tag", "year tags", "year", "season"],
  category: ["category", "product type", "type", "shelf"],
  subtype: ["sub-type", "subtype", "sub type", "which part"],
  brands: ["brands", "brand", "brands or models", "models"],
  exclude: ["except brands", "exclude brands", "except", "excluding"],
  action: ["action", "what to do"],
  percent: ["% off", "percent off", "percent", "% discount", "discount %", "off %"],
  off: ["off", "off what", "discount off", "off the"],
  tags: ["add tags", "add tag", "tags", "tag"],
  note: ["note", "notes", "comment"],
};

const norm = (value: string): string => value.toLowerCase().replace(/[\s_]+/g, " ").trim();

/** Which column holds what, by name, so the columns can be reordered without breaking this. */
function mapColumns(header: string[]): Record<string, number> {
  const found: Record<string, number> = {};
  header.forEach((raw, i) => {
    const name = norm(raw);
    if (!name) return;
    for (const [key, names] of Object.entries(ALIASES)) {
      if (found[key] === undefined && names.includes(name)) found[key] = i;
    }
  });
  return found;
}

/** A Shopify product export is not an instruction sheet, and saying so beats reading it as one. */
export function looksLikeProductExport(header: string[]): boolean {
  const names = new Set(header.map(norm));
  return names.has("handle") && (names.has("variant price") || names.has("body (html)"));
}

export interface SaleSheetReading {
  instructions: string[];
  /** Rows deliberately not turned into an instruction, each with the reason. */
  ignored: string[];
  unclear: string;
  /** Which sheet of the workbook it read, for the screen. */
  sheet: string;
}

const list = (raw: string): string[] => raw.split(/[,;]| and /i).map((s) => s.trim()).filter(Boolean);

/**
 * Turn one row into the sentence the planner reads.
 *
 * Built from the cells rather than copied from a notes column, so the sentence can only ever say
 * what the row says.
 */
function sentence(cell: (key: string) => string): { text: string; skip: string } | null {
  const category = cell("category");
  if (!category) return null;

  const years = list(cell("year"));
  const everyYear = years.length === 1 && /^all$/i.test(years[0]);
  if (years.length === 0) {
    return { text: "", skip: `${category}${cell("percent") ? ` ${cell("percent")}% off` : ""} — no year tag, so it was left alone` };
  }

  const action = norm(cell("action"));
  if (action === "leave alone" || norm(cell("percent")) === "as is") {
    return { text: "", skip: `${category} tagged ${years.join(", ")} — the sheet says leave alone` };
  }

  const who: string[] = [category];
  const subtype = cell("subtype");
  if (subtype) who.push(subtype.replace(/;/g, " and "));
  if (!everyYear) who.push(`tagged ${years.length === 1 ? years[0] : `any of ${years.join(", ")}`}`);
  const brands = list(cell("brands"));
  if (brands.length) who.push(`from ${brands.join(" or ")}`);
  const target = who.join(" ");

  const excluded = list(cell("exclude"));
  const except = excluded.length ? `, but leave out anything from ${excluded.join(" or ")}` : "";

  const percentRaw = cell("percent").replace(/%/g, "").trim();
  const percent = Number(percentRaw);
  let text: string;
  if (action === "full price" || norm(cell("percent")) === "rrp") {
    text = `Take ${target} off sale${except}: put the price back to the recommended retail and clear Compare At.`;
  } else if (percentRaw && Number.isFinite(percent) && percent > 0) {
    // A percentage written as a fraction is the template's one remaining foot-gun, and it is the
    // mistake the old sheet actually made: 0.3 there meant thirty percent.
    const pct = percent < 1 ? Math.round(percent * 100) : Math.round(percent);
    const off = norm(cell("off")).startsWith("current") ? "the current price" : "the recommended retail";
    text = `Take ${pct}% off ${off} for ${target}${except}.`;
  } else if (action === "discount") {
    return { text: "", skip: `${target} — the action is discount but no percentage was given` };
  } else {
    return { text: "", skip: `${target} — nothing in the action or percentage columns` };
  }

  const tags = list(cell("tags"));
  if (tags.length) text += ` Also add the tag${tags.length === 1 ? "" : "s"} ${tags.join(", ")}.`;
  return { text, skip: "" };
}

/**
 * Read a workbook that is the shop's sale template.
 *
 * Returns null when it is not one, so the caller can hand it to the model instead. Recognising it
 * takes a category column and something saying what to do — fewer than that and a guess here would
 * be worse than the model's.
 */
export function readSaleSheet(sheets: Array<{ name: string; grid: string[][] }>): SaleSheetReading | null {
  for (const { name, grid } of sheets) {
    for (let h = 0; h < Math.min(grid.length, 10); h++) {
      const header = (grid[h] ?? []).map((c) => (c ?? "").toString());
      if (looksLikeProductExport(header)) return null;
      const cols = mapColumns(header);
      if (cols.category === undefined || (cols.action === undefined && cols.percent === undefined)) continue;

      const instructions: string[] = [];
      const ignored: string[] = [];
      for (let r = h + 1; r < grid.length; r++) {
        const row = grid[r] ?? [];
        if (row.every((c) => !(c ?? "").toString().trim())) continue;
        const cell = (key: string) => {
          const i = cols[key];
          return i === undefined ? "" : (row[i] ?? "").toString().trim();
        };
        const made = sentence(cell);
        if (!made) continue;
        if (made.skip) ignored.push(made.skip);
        else instructions.push(made.text);
      }
      if (instructions.length === 0 && ignored.length === 0) continue;
      return { instructions, ignored, unclear: "", sheet: name };
    }
  }
  return null;
}
