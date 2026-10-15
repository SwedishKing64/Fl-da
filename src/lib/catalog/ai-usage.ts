/**
 * Metering for reading through Flöda.
 *
 * A shop on a plan reads documents through the vendor's relay (`/api/ai`) rather than with a key
 * of its own. The relay forwards each call to the reading service with the vendor's key and
 * counts what the call used, so the Clients page can show what each shop's reading costs and so
 * a shop cannot run up more than its fortnight's allowance. Pure; the route keeps the rows.
 */

export interface Usage {
  input: number;
  cacheWrite: number;
  cacheRead: number;
  output: number;
}

export const NO_USAGE: Usage = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 };

/** Cents per million tokens, at the Opus rates the relay's model is billed on. */
export const RATES: Usage = { input: 500, cacheWrite: 625, cacheRead: 50, output: 2500 };

/** What the reading service charges for this much, to the cent. */
export function costCents(u: Usage): number {
  return Math.round((u.input * RATES.input + u.cacheWrite * RATES.cacheWrite + u.cacheRead * RATES.cacheRead + u.output * RATES.output) / 1_000_000);
}

export function addUsage(a: Usage, b: Usage): Usage {
  return { input: a.input + b.input, cacheWrite: a.cacheWrite + b.cacheWrite, cacheRead: a.cacheRead + b.cacheRead, output: a.output + b.output };
}

export function noUsage(u: Usage): boolean {
  return u.input === 0 && u.cacheWrite === 0 && u.cacheRead === 0 && u.output === 0;
}

const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);

/** The `usage` object the reading service puts on a message, read leniently. */
export function usageOf(raw: unknown): Usage {
  if (!raw || typeof raw !== "object") return { ...NO_USAGE };
  const u = raw as Record<string, unknown>;
  return { input: n(u.input_tokens), cacheWrite: n(u.cache_creation_input_tokens), cacheRead: n(u.cache_read_input_tokens), output: n(u.output_tokens) };
}

/**
 * Reads a streamed answer as it passes through and keeps what it used. The service says the
 * input on `message_start` and the running output total on each `message_delta`.
 */
export class StreamMeter {
  usage: Usage = { ...NO_USAGE };
  private rest = "";

  feed(text: string): void {
    const lines = (this.rest + text).split("\n");
    this.rest = lines.pop() ?? "";
    for (const line of lines) this.line(line);
  }

  /** Whatever is left when the stream closes. */
  end(): Usage {
    if (this.rest) { this.line(this.rest); this.rest = ""; }
    return this.usage;
  }

  private line(line: string): void {
    if (!line.startsWith("data:")) return;
    let event: { type?: string; message?: { usage?: unknown }; usage?: unknown };
    try { event = JSON.parse(line.slice(5).trim()); } catch { return; }
    if (event.type === "message_start") {
      const u = usageOf(event.message?.usage);
      this.usage = { ...u, output: Math.max(this.usage.output, u.output) };
    } else if (event.type === "message_delta") {
      const u = usageOf(event.usage);
      this.usage = {
        input: u.input || this.usage.input,
        cacheWrite: u.cacheWrite || this.usage.cacheWrite,
        cacheRead: u.cacheRead || this.usage.cacheRead,
        output: Math.max(this.usage.output, u.output),
      };
    }
  }
}

/** The fortnight a reading falls in, as the Client row keeps it (in the column once named for the month). */
/**
 * The billing period a moment falls in: fortnights counted from a fixed Monday, so every copy and
 * the vendor agree on where one ends without a calendar. Kept on the Client row in the columns
 * named for the month they used to hold (`aiMonth`, `useMonth`).
 */
const PERIOD_MS = 14 * 86_400_000;
const PERIOD_EPOCH = Date.UTC(2026, 0, 5); // a Monday
export function periodKey(now = new Date()): string {
  return `F${Math.floor((now.getTime() - PERIOD_EPOCH) / PERIOD_MS)}`;
}
/** When the current fortnight began. */
export function periodStart(now = new Date()): Date {
  return new Date(PERIOD_EPOCH + Math.floor((now.getTime() - PERIOD_EPOCH) / PERIOD_MS) * PERIOD_MS);
}
/** The old name. */
export const monthKey = periodKey;

/** What a Client row keeps about its reading. */
export interface MeteredClient {
  aiMonth: string;
  aiInput: number;
  aiCacheWrite: number;
  aiCacheRead: number;
  aiOutput: number;
  aiCalls: number;
  /** The fortnight's allowance in cents; 0 means no limit. */
  aiCapCents: number;
}

export interface Allowance {
  month: string;
  usage: Usage;
  calls: number;
  spentCents: number;
  capCents: number;
  /** The fortnight's allowance is used up, so the relay turns the next call away. */
  exhausted: boolean;
}

/** Where a client stands this fortnight. A row from an earlier fortnight counts as nothing spent. */
export function allowanceOf(c: MeteredClient, now = new Date()): Allowance {
  const month = periodKey(now);
  const current = c.aiMonth === month;
  const usage: Usage = current ? { input: c.aiInput, cacheWrite: c.aiCacheWrite, cacheRead: c.aiCacheRead, output: c.aiOutput } : { ...NO_USAGE };
  const spentCents = costCents(usage);
  return { month, usage, calls: current ? c.aiCalls : 0, spentCents, capCents: c.aiCapCents, exhausted: c.aiCapCents > 0 && spentCents >= c.aiCapCents };
}

export function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** One line for the Clients page: "$4.20 of $60 this fortnight, 12 readings". */
export function describeAllowance(a: Allowance): string {
  const cap = a.capCents > 0 ? ` of ${dollars(a.capCents)}` : "";
  const calls = `${a.calls} reading${a.calls === 1 ? "" : "s"}`;
  return `${dollars(a.spentCents)}${cap} this fortnight, ${calls}${a.exhausted ? " · allowance used up" : ""}`;
}
