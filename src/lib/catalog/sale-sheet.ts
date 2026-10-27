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

/**
 * Which column holds what, by name, so the columns can be reordered without breaking this.
 *
 * A heading is matched by what it CONTAINS, longest alias first, rather than by being exactly one
 * of them. Their sheet heads the brand column "brands or models august" — the month they last
 * touched it — and demanding the whole cell match left that column unread, so every row's brand
 * went missing while the sheet still looked like it had been understood.
 */
function mapColumns(header: string[]): Record<string, number> {
  const found: Record<string, number> = {};
  const claimed = new Set<number>();
  /**
   * One column, one meaning, and the LONGEST alias that fits it wins.
   *
   * Both of those are the same bug found twice. "Year tag" contains "tag", so the year column was
   * also claimed as the add-tags column and every row of their sheet came out asking to add its own
   * year as a tag. Whichever alias matches more of the heading is the one the heading is.
   */
  header.forEach((raw, i) => {
    const name = norm(raw);
    if (!name || claimed.has(i)) return;
    let best: { key: string; length: number } | null = null;
    for (const [key, names] of Object.entries(ALIASES)) {
      if (found[key] !== undefined) continue;
      for (const alias of names) {
        if (name !== alias && !name.includes(alias)) continue;
        if (!best || alias.length > best.length) best = { key, length: alias.length };
      }
    }
    if (best) { found[best.key] = i; claimed.add(i); }
  });
  return found;
}

/**
 * The header, when it is spread over more than one row.
 *
 * Their template puts "brands or models august" and "October snow sale" on the first row and "Year
 * tag" and "category" on the second, which is what a sheet looks like after three seasons of being
 * edited in place. Read a row at a time it has no row that is the header, so the whole sheet fell
 * through to the model — and the model does not have the columns, only the words.
 */
const mergedHeader = (grid: string[][], upTo: number): string[] => {
  const width = Math.max(0, ...grid.slice(0, upTo + 1).map((r) => (r ?? []).length));
  return Array.from({ length: width }, (_, i) =>
    grid.slice(0, upTo + 1).map((r) => ((r ?? [])[i] ?? "").toString().trim()).filter(Boolean).join(" "));
};

/** A cell that says how much comes off: a number, or one of the two words that mean neither. */
const looksLikeDiscount = (value: string): boolean => {
  const text = norm(value).replace(/%/g, "").trim();
  if (text === "") return false;
  return /^(as is|rrp|full price|leave alone)$/.test(text) || Number.isFinite(Number(text));
};

/**
 * The columns their own sheet does not head at all, found by what is under them.
 *
 * Two of the five carry no heading anywhere: the one saying how much comes off, which they head
 * with the name of the sale ("October snow sale"), and the one saying WHICH PART of a shelf a row
 * is about — flat or package for a ski, midlayer for a garment, step-on for a snowboard boot. That
 * second one is the whole reason this exists: their sheet prices 2027 skis flat at 15% off and 2027
 * skis package at 20%, and a reader that cannot see the column applies both to both.
 *
 * Neither is claimed on position alone. The discount column has to be full of numbers, and the
 * sub-type column has to be full of words that are not numbers — so a sheet shaped differently
 * declines rather than mislabelling a column and quietly changing the wrong products.
 */
function fillUnheadedColumns(cols: Record<string, number>, rows: string[][], width: number): void {
  const taken = new Set(Object.values(cols));
  const values = (i: number) => rows.map((r) => ((r ?? [])[i] ?? "").toString().trim()).filter(Boolean);
  const share = (i: number, test: (v: string) => boolean) => {
    const seen = values(i);
    return seen.length < 3 ? 0 : seen.filter(test).length / seen.length;
  };

  if (cols.percent === undefined && cols.action === undefined) {
    const best = Array.from({ length: width }, (_, i) => i)
      .filter((i) => !taken.has(i))
      .map((i) => ({ i, score: share(i, looksLikeDiscount) }))
      .filter((c) => c.score > 0.8)
      .sort((a, b) => b.score - a.score)[0];
    if (best) { cols.percent = best.i; taken.add(best.i); }
  }

  // The sub-type sits between the shelf and the brands, which is where their sheet puts it and the
  // only thing about it that is not guesswork — so it is taken from there, and only there.
  if (cols.subtype === undefined && cols.category !== undefined) {
    const after = cols.category + 1;
    const isWords = share(after, (v) => !Number.isFinite(Number(norm(v).replace(/%/g, ""))));
    if (!taken.has(after) && after < width && isWords > 0.9) cols.subtype = after;
  }
}

/**
 * Whether a sub-type cell is saying flat, package, or both — and what is left of it if anything.
 *
 * Their spelling is "pakage", on three of the five rows that use it, so it is a spelling this has
 * to know rather than one to correct. "flat and package" means both, which is the same as saying
 * nothing, and is written out because a sheet that says it explicitly is not the same as a sheet
 * whose author forgot.
 */
export function readFitting(raw: string): { fitting: "flat" | "package" | null; rest: string } {
  const text = norm(raw);
  if (!text) return { fitting: null, rest: "" };
  const flat = /\bflat\b|\bski only\b|\bboard only\b|\bno bindings?\b/.test(text);
  const pack = /\bpa?c?kages?\b|\bpakage\b|\bwith bindings?\b|\binc bindings?\b/.test(text);
  const rest = text.replace(/\b(flat|pa?c?kages?|pakage|only|and|with|no|inc|bindings?|ski|board)\b/g, " ").replace(/\s+/g, " ").trim();
  // Both named is both, which narrows nothing — and neither is the same answer.
  if (flat === pack) return { fitting: null, rest: flat ? rest : text };
  return { fitting: flat ? "flat" : "package", rest };
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

  // A blank year is every year, as "all" is (2026-10-26): the shop's sheet leaves it blank on the
  // shelves whose products carry no year — socks, poles, apres, midlayers — and those rows were
  // being skipped, so their sale never went on.
  const years = list(cell("year"));
  const everyYear = years.length === 0 || (years.length === 1 && /^all$/i.test(years[0]));

  const action = norm(cell("action"));
  if (action === "leave alone" || norm(cell("percent")) === "as is") {
    return { text: "", skip: `${category}${years.length ? ` tagged ${years.join(", ")}` : ""} — the sheet says leave alone` };
  }

  const who: string[] = [category];
  const { fitting, rest } = readFitting(cell("subtype"));
  // Spelled out, because it is the one narrowing with no column of its own in a Shopify export:
  // what says whether a ski has a binding on it is the wording of its title.
  if (fitting === "flat") who.push("sold flat, with no binding (the title does not say inc)");
  if (fitting === "package") who.push("sold as a package, with a binding (the title says inc)");
  if (rest) who.push(rest.replace(/;/g, " and "));
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
      const thisRow = (grid[h] ?? []).map((c) => (c ?? "").toString());
      if (looksLikeProductExport(thisRow)) return null;
      const header = mergedHeader(grid, h);
      const cols = mapColumns(header);
      if (cols.category === undefined) continue;
      const body = grid.slice(h + 1);
      fillUnheadedColumns(cols, body, Math.max(header.length, ...body.map((r) => (r ?? []).length)));
      if (cols.action === undefined && cols.percent === undefined) continue;

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
