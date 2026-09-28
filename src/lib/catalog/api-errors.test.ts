/**
 * The reading service's failures, told apart by the SDK's own classes and status codes.
 *
 * Built with APIError.generate, the same factory the SDK uses on a real response, from the exact
 * body the bulk page showed: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}.
 */

import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { describeApiError, isTransient, retrying } from "./api-errors";

const fromApi = (status: number, type: string, message: string) =>
  Anthropic.APIError.generate(status, { type: "error", error: { type, message } }, undefined, new Headers());

describe("an error from the reading service", () => {
  const overloaded = fromApi(529, "overloaded_error", "Overloaded");

  it("reads an overload as about the moment, so the row is tried again", () => {
    expect(isTransient(overloaded)).toBe(true);
    expect(isTransient(fromApi(429, "rate_limit_error", "Rate limited"))).toBe(true);
    expect(isTransient(fromApi(500, "api_error", "Internal"))).toBe(true);
    expect(isTransient(new Anthropic.APIConnectionError({ message: "socket hang up" }))).toBe(true);
  });

  it("does not retry a request the service rejected as wrong — asking again gets the same answer", () => {
    expect(isTransient(fromApi(400, "invalid_request_error", "bad"))).toBe(false);
    expect(isTransient(fromApi(401, "authentication_error", "bad key"))).toBe(false);
    expect(isTransient(new Error("not from the API"))).toBe(false);
  });

  it("never puts the API's JSON in front of anyone", () => {
    const said = describeApiError(overloaded)!;
    expect(said).not.toContain("{");
    expect(said).not.toContain("overloaded_error");
    expect(said).toContain("overloaded");
    expect(said).toContain("Nothing was changed");
  });

  it("leaves an error that did not come from the API to the caller", () => {
    expect(describeApiError(new Error("something else"))).toBeNull();
  });
});

/**
 * The one that actually reached the page.
 *
 * An overload in the MIDDLE of a streamed answer is not a failed request — the request succeeded,
 * with a 200 — so the SDK throws it exactly like this, from its own streaming code: no status, the
 * raw body as the message, and the type on `.type`. Classifying by status alone missed it, and it
 * went to the page as its JSON. Built here the same way the SDK builds it.
 */
describe("an overload in the middle of a streamed answer", () => {
  const body = { type: "error", error: { details: null, type: "overloaded_error", message: "Overloaded" }, request_id: "req_011CfVGhsKFq2XaKZ3fhxGaw" };
  const midStream = new Anthropic.APIError(undefined, body, undefined, new Headers(), "overloaded_error");

  it("is the message that was on the page", () => {
    // Proves this test builds the real thing: no status, and the bare JSON as the message.
    expect(midStream.status).toBeUndefined();
    expect(midStream.message).toContain('"overloaded_error"');
  });

  it("is read as an overload although it has no status", () => {
    expect(isTransient(midStream)).toBe(true);
    const said = describeApiError(midStream)!;
    expect(said).toContain("overloaded");
    expect(said).not.toContain("{");
  });

  it("is asked again, because the SDK's own retries never see it", async () => {
    let calls = 0;
    const answer = await retrying(async () => {
      calls++;
      if (calls < 3) throw midStream;
      return "read";
    }, [1, 1, 1]);
    expect(answer).toBe("read");
    expect(calls).toBe(3);
  });

  it("gives up after its waits, and hands back the error to be described", async () => {
    let calls = 0;
    await expect(retrying(async () => { calls++; throw midStream; }, [1, 1])).rejects.toBe(midStream);
    expect(calls).toBe(3);
  });

  it("does not ask again when the request itself was wrong", async () => {
    let calls = 0;
    const wrong = fromApi(400, "invalid_request_error", "bad");
    await expect(retrying(async () => { calls++; throw wrong; }, [1, 1])).rejects.toBe(wrong);
    expect(calls).toBe(1);
  });
});
