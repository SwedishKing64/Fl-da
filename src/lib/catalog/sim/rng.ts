/**
 * A seeded random number generator, so a simulated shop is the same shop every run: a score that
 * changes between runs is then a change in Flöda, never a different roll of the dice.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = (seed >>> 0) || 1;
  }

  /** The next number in [0, 1). */
  next(): number {
    // mulberry32
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** A whole number from lo to hi, both included. */
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /** Some of the items, at least `min` of them, in their own order. */
  some<T>(items: readonly T[], min: number, max = items.length): T[] {
    const n = Math.min(items.length, this.int(Math.min(min, items.length), Math.min(max, items.length)));
    const chosen = new Set(this.shuffle(items.map((_, i) => i)).slice(0, n));
    return items.filter((_, i) => chosen.has(i));
  }

  /** A generator seeded from this one, for a part of the world that should not disturb the rest. */
  fork(): Rng {
    return new Rng(Math.floor(this.next() * 4294967295));
  }
}
