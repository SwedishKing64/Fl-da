/**
 * Which column is which, asked of the model when the headings alone do not say.
 *
 * Most supplier spreadsheets are matched by their headings and a look at the values
 * (`suggestMapping`), and a layout seen before is remembered. The rest used to stop at a
 * mapping screen for a person to sort out. Now, where a key column (the product's name) could
 * not be placed, the headings and a few rows go to the light model with the list of fields Flöda
 * writes, and its answer fills the gaps the heuristics left. It never overrides a column the
 * heuristics placed, and a field it names that Flöda does not have is dropped. Nothing is
 * remembered from it until a person confirms a build, as with any automatic mapping.
 */

import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropicClient, LIGHT_MODEL, aiAvailable } from "./anthropic";
import type { Mapping } from "./mapping";
import type { CanonicalFieldDef } from "./types";

const Answer = z.object({
  columns: z.array(z.object({
    header: z.string().describe("A column heading, exactly as given."),
    field: z.string().describe("The field it holds, by key from the list, or an empty string for a column Flöda has no use for."),
  })),
});

const ASK_MS = 25_000;

/**
 * The model's reading of a layout: heading → field key, for every heading given. Null when the
 * model is not available or did not answer; the caller then falls back to asking a person.
 */
export async function aiMapping(headers: string[], sampleRows: Array<Record<string, string>>, fields: CanonicalFieldDef[]): Promise<Mapping | null> {
  if (!aiAvailable() || headers.length === 0) return null;
  const keys = new Set<string>(fields.map((f) => f.key));
  const fieldList = fields.map((f) => `- ${f.key}: ${f.label}${f.synonyms?.length ? ` (also called ${f.synonyms.slice(0, 6).join(", ")})` : ""}${f.required ? " — required" : ""}`).join("\n");
  const rows = sampleRows.slice(0, 5).map((r, i) => `Row ${i + 1}: ${headers.map((h) => `${h} = ${JSON.stringify(String(r[h] ?? "").slice(0, 60))}`).join("; ")}`).join("\n");
  try {
    const response = await anthropicClient(1).messages.parse({
      model: LIGHT_MODEL,
      max_tokens: 2000,
      system: [
        "You read a supplier's spreadsheet for a retail shop and say which of the shop's fields each column holds.",
        "Answer for every heading given, in order. Use a field key from the list exactly, or an empty string for a column the shop has no field for (totals, internal codes, notes). One field per column; the product's name goes on the column that best names the product, not a code.",
        `The fields:\n${fieldList}`,
      ].join("\n\n"),
      output_config: { format: zodOutputFormat(Answer), effort: "low" },
      messages: [{ role: "user", content: `Headings: ${headers.map((h) => JSON.stringify(h)).join(", ")}\n\n${rows || "(no rows to show)"}` }],
    }, { timeout: ASK_MS, maxRetries: 1, signal: AbortSignal.timeout(ASK_MS) });
    const answer = response.parsed_output;
    if (!answer) return null;
    const mapping: Mapping = Object.fromEntries(headers.map((h) => [h, ""])) as Mapping;
    const taken = new Set<string>();
    for (const c of answer.columns) {
      if (!(c.header in mapping)) continue;
      const key = c.field.trim();
      if (!key || !keys.has(key) || taken.has(key)) continue;
      mapping[c.header] = key as Mapping[string];
      taken.add(key);
    }
    return mapping;
  } catch (err) {
    console.warn("[mapping] the model could not place the columns:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * The heuristics' mapping with the model's filling its gaps: a heading the heuristics placed
 * stays; one they left empty takes the model's field, where that field is not already taken.
 */
export function fillMapping(fresh: Mapping, guessed: Mapping | null): Mapping {
  if (!guessed) return fresh;
  const taken = new Set<string>(Object.values(fresh).filter(Boolean));
  const out: Mapping = { ...fresh };
  for (const [header, key] of Object.entries(guessed)) {
    if (out[header] || !key || taken.has(key)) continue;
    out[header] = key;
    taken.add(key);
  }
  return out;
}
