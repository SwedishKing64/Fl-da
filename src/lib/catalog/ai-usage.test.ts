import { describe, expect, it } from "vitest";
import { allowanceOf, costCents, describeAllowance, limitReachedMessage, periodEnd, periodKey, periodStart, rateFor, requestedModel, StreamMeter, usageOf } from "./ai-usage";

describe("what a reading used", () => {
  it("reads the service's usage object and ignores what is not a count", () => {
    expect(usageOf({ input_tokens: 1200, output_tokens: 300.4, cache_read_input_tokens: -5, cache_creation_input_tokens: "x" })).toEqual({ input: 1200, cacheWrite: 0, cacheRead: 0, output: 300 });
    expect(usageOf(null)).toEqual({ input: 0, cacheWrite: 0, cacheRead: 0, output: 0 });
  });
  it("prices a reading at the Opus rates", () => {
    expect(costCents({ input: 1_000_000, cacheWrite: 0, cacheRead: 0, output: 0 })).toBe(500);
    expect(costCents({ input: 20_000, cacheWrite: 0, cacheRead: 0, output: 4_000 })).toBe(20);
  });
  it("prices a call by the model it asked for, the dearest when the model is unknown", () => {
    const million = { input: 1_000_000, cacheWrite: 0, cacheRead: 0, output: 0 };
    expect(costCents(million, rateFor("claude-opus-5-5"))).toBe(400);
    expect(costCents(million, rateFor("claude-sonnet-5-5"))).toBe(200);
    expect(costCents(million, rateFor("claude-haiku-5-5"))).toBe(10);
    expect(costCents(million, rateFor("claude-opus-5-5", true))).toBe(800);
    expect(costCents(million, rateFor("something-new"))).toBe(500);
    expect(costCents({ input: 0, cacheWrite: 0, cacheRead: 1_000_000, output: 0 }, rateFor("claude-opus-5-5"))).toBe(20);
    expect(requestedModel(JSON.stringify({ model: "claude-haiku-5-5", speed: "fast" }))).toEqual({ model: "claude-haiku-5-5", fast: true });
    expect(requestedModel("not json")).toEqual({ model: "", fast: false });
  });
  it("meters a streamed answer from message_start and the last message_delta", () => {
    const m = new StreamMeter();
    m.feed('event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":900,"cache_read_input_tokens":100,"output_tokens":1}}}\n\n');
    m.feed('event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"text":"hi"}}\n\nevent: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":40}}\n\n');
    m.feed('event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":85}}');
    expect(m.end()).toEqual({ input: 900, cacheWrite: 0, cacheRead: 100, output: 85 });
  });
  it("survives a data line split across chunks", () => {
    const m = new StreamMeter();
    const line = 'data: {"type":"message_start","message":{"usage":{"input_tokens":50,"output_tokens":0}}}\n';
    m.feed(line.slice(0, 30));
    m.feed(line.slice(30));
    expect(m.end().input).toBe(50);
  });
});

describe("a client's month", () => {
  const row = { aiMonth: periodKey(), aiInput: 2_000_000, aiCacheWrite: 0, aiCacheRead: 0, aiOutput: 100_000, aiCalls: 12, aiCapCents: 6000 };
  it("adds up what was read this fortnight against the allowance", () => {
    const a = allowanceOf(row);
    expect(a.spentCents).toBe(1250);
    expect(a.exhausted).toBe(false);
    expect(describeAllowance(a)).toBe("$12.50 of $60.00 this fortnight, 12 readings");
  });
  it("prefers what each call was priced at over the tokens at one rate", () => {
    expect(allowanceOf({ ...row, aiCents: 300 }).spentCents).toBe(300);
    expect(allowanceOf({ ...row, aiCents: 0 }).spentCents).toBe(1250);
    expect(allowanceOf({ ...row, aiCents: 300, aiMonth: "2001-01" }).spentCents).toBe(0);
  });
  it("starts a new month from nothing", () => {
    const a = allowanceOf({ ...row, aiMonth: "2001-01" });
    expect(a.spentCents).toBe(0);
    expect(a.calls).toBe(0);
  });
  it("turns the next reading away once the allowance is spent, unless there is none", () => {
    expect(allowanceOf({ ...row, aiCapCents: 1000 }).exhausted).toBe(true);
    expect(allowanceOf({ ...row, aiCapCents: 0 }).exhausted).toBe(false);
    expect(describeAllowance(allowanceOf({ ...row, aiCapCents: 1000 }))).toContain("allowance used up");
  });
});

describe("the billing fortnight", () => {
  it("runs Monday to Sunday fortnight, the same on every copy", () => {
    const monday = new Date("2026-10-12T00:00:00Z");
    expect(periodStart(new Date("2026-10-15T09:00:00Z")).toISOString()).toBe(monday.toISOString());
    expect(periodKey(new Date("2026-10-15T09:00:00Z"))).toBe(periodKey(new Date("2026-10-25T23:59:59Z")));
    expect(periodKey(new Date("2026-10-26T00:00:00Z"))).not.toBe(periodKey(new Date("2026-10-25T23:59:59Z")));
    expect(periodKey(new Date("2026-10-15T09:00:00Z"))).toMatch(/^F\d+$/);
    expect(periodEnd(new Date("2026-10-15T09:00:00Z")).toISOString()).toBe("2026-10-26T00:00:00.000Z");
  });

  it("says the limit is reached and when it lifts, never a word about a key or a balance", () => {
    const said = limitReachedMessage(new Date("2026-10-15T09:00:00Z"));
    expect(said).toMatch(/^You have reached your fortnightly limit/);
    expect(said).toContain("26 October");
    expect(said).not.toMatch(/balance|credit|API key/i);
  });
});
