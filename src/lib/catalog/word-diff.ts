/**
 * Two texts compared word by word, for showing a rewrite beside its original and for reading
 * what a person changed in it. Pure.
 */

export interface DiffPart { kind: "same" | "added" | "removed"; text: string }

const MAX_TOKENS = 600;
const tokens = (s: string) => s.trim().split(/(\s+)/).filter((t) => t.length > 0 && !/^\s+$/.test(t)).slice(0, MAX_TOKENS);

/** The words of `before` and `after` aligned: what stayed, what went, what came. */
export function wordDiff(before: string, after: string): DiffPart[] {
  const a = tokens(before);
  const b = tokens(after);
  const n = a.length;
  const m = b.length;
  // Longest common subsequence, then walked back into runs.
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffPart[] = [];
  const push = (kind: DiffPart["kind"], text: string) => {
    const last = out[out.length - 1];
    if (last && last.kind === kind) last.text += ` ${text}`;
    else out.push({ kind, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { push("same", a[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { push("removed", a[i]); i++; }
    else { push("added", b[j]); j++; }
  }
  while (i < n) push("removed", a[i++]);
  while (j < m) push("added", b[j++]);
  return out;
}

const MAX_SPAN = 3;
const bare = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").trim();

/**
 * The words a person swapped for others, where a short run went and a short run came in its
 * place: what they would rather say. Insertions, deletions and long rewrites are not spellings.
 */
export function replacementsIn(before: string, after: string): Array<{ from: string; to: string }> {
  const parts = wordDiff(before, after);
  const out: Array<{ from: string; to: string }> = [];
  for (let k = 0; k < parts.length - 1; k++) {
    const x = parts[k];
    const y = parts[k + 1];
    const pair = x.kind === "removed" && y.kind === "added" ? { from: x.text, to: y.text } : x.kind === "added" && y.kind === "removed" ? { from: y.text, to: x.text } : null;
    if (!pair) continue;
    k++;
    if (pair.from.split(" ").length > MAX_SPAN || pair.to.split(" ").length > MAX_SPAN) continue;
    const f = bare(pair.from);
    const t = bare(pair.to);
    // The same words with more or fewer around them is an addition or a cut, not a swap.
    if (!f || !t || f === t || f.startsWith(t) || t.startsWith(f)) continue;
    const from = pair.from.replace(/[.,;:!?]+$/, "");
    const to = pair.to.replace(/[.,;:!?]+$/, "");
    if (!out.some((r) => r.from.toLowerCase() === from.toLowerCase() && r.to.toLowerCase() === to.toLowerCase())) out.push({ from, to });
  }
  return out;
}
