/**
 * The reading service's failures, told apart by the SDK's own classes and status codes.
 *
 * Built with APIError.generate, the same factory the SDK uses on a real response, from the exact
 * body the bulk page showed: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}.
 */

import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { describeApiError, isTransient } from "./api-errors";

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
