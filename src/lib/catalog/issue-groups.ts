/**
 * The export's notes, grouped: one line per thing wrong, with the products it is wrong on, in place
 * of one line per variant. "No recommended retail" on sixteen sizes of one jacket is one note about
 * one jacket, and seen beside five more jackets it is one note about six.
 */

export interface IssueGroup {
  /** What is wrong, once. */
  message: string;
  /** The products it is wrong on, each once, in the order first seen. */
  products: string[];
  /** How many lines it stood for: variants, where it was said of each. */
  count: number;
}

/** "Trail Runner 2026 / ABC-1: No image - add one" → product, message. */
export function splitIssue(line: string): { product: string; message: string } {
  const at = line.indexOf(": ");
  if (at < 0) return { product: "", message: line.trim() };
  const who = line.slice(0, at);
  const product = who.split(" / ")[0].trim();
  return { product, message: line.slice(at + 2).trim() };
}

export function groupIssues(lines: string[]): IssueGroup[] {
  const groups = new Map<string, IssueGroup>();
  for (const line of lines) {
    const { product, message } = splitIssue(line);
    const g = groups.get(message) ?? { message, products: [], count: 0 };
    g.count++;
    if (product && !g.products.includes(product)) g.products.push(product);
    groups.set(message, g);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}
