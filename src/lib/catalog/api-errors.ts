/**
 * What went wrong with a call to the reading service, in words, and whether waiting would help.
 *
 * The API's own error text is its JSON body — `{"type":"error","error":{"type":"overloaded_error",…`
 * — and that is exactly what the bulk page was putting in front of somebody pricing a sale. Read by
 * the SDK's typed classes and status codes, never by matching the text, because the text is not a
 * contract and the status is.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { APIError } from "@anthropic-ai/sdk/core/error";

/**
 * The error's type, whichever way it arrived.
 *
 * An error can come back two ways and only one of them has a status code. A request the service
 * turns away is an HTTP 529. But an overload that happens AFTER the response has started — in the
 * middle of a streamed answer — arrives as an `error` event on a request that already succeeded:
 * the SDK throws it with NO status, the raw JSON body as its message, and the type on `.type`. That
 * is exactly the `{"type":"error","error":{"type":"overloaded_error"…` that was reaching the page,
 * and a check on the status alone read it as not-an-overload and passed it straight through.
 */
function typeOf(err: APIError): string {
  if (err.type) return err.type;
  const status = err.status ?? 0;
  if (status === 529) return "overloaded_error";
  if (status === 429) return "rate_limit_error";
  if (status >= 500) return "api_error";
  return "";
}

const PASSING = new Set(["overloaded_error", "rate_limit_error", "api_error", "timeout_error"]);

/** Load, rate limits, the service being briefly down, a dropped connection: about the moment. */
export function isTransient(err: unknown): boolean {
  if (err instanceof Anthropic.APIConnectionError) return true;           // includes timeouts
  if (err instanceof Anthropic.APIError) return PASSING.has(typeOf(err));
  return false;
}

/**
 * Try again when the service was busy — because for a streamed answer, nothing else will.
 *
 * The SDK retries a request that FAILS. A streamed answer that is cut off by an overload did not
 * fail as a request — it started, with a 200 — so the SDK's retries never see it, however many are
 * configured. Every call here that streams is wrapped in this, which waits and asks again on a
 * passing error and on nothing else: a request the service rejected as wrong gets the same answer
 * however many times it is sent.
 *
 * The waits are short on purpose. The bulk page has a minute per request, and a row that is still
 * refused after three tries is marked for "read those rows again" rather than holding up the rest.
 */
export async function retrying<T>(call: () => Promise<T>, waits: number[] = [2_000, 5_000, 10_000]): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await call();
    } catch (err) {
      if (attempt >= waits.length || !isTransient(err)) throw err;
      await new Promise((resolve) => setTimeout(resolve, waits[attempt]));
    }
  }
}

/** A sentence somebody can act on, or null when the error did not come from the API at all. */
export function describeApiError(err: unknown): string | null {
  if (err instanceof Anthropic.APIConnectionError) {
    return "The reading service could not be reached, even after trying again. Nothing was changed. Try again in a minute — if it keeps happening, the connection from the server is down.";
  }
  if (!(err instanceof Anthropic.APIError)) return null;
  const status = err.status ?? 0;
  switch (typeOf(err)) {
    case "overloaded_error": return "The reading service is overloaded right now and turned this away, even after waiting and trying again several times. Nothing was changed. This is on the service's side, not your file — try again in a few minutes.";
    case "rate_limit_error": return "Too much was sent to the reading service at once and it turned this away. Nothing was changed. Wait a minute and try again.";
    case "timeout_error": return "The reading service took too long and this was not read. Nothing was changed. Try again in a minute.";
    case "api_error": return "The reading service had a fault of its own and this was not read. Nothing was changed. Try again in a minute.";
    case "authentication_error":
    case "permission_error": return "The reading service refused the API key. Check ANTHROPIC_API_KEY in Settings.";
    case "billing_error": return "The reading service refused this for a billing reason on the API account. Nothing was changed.";
  }
  if (status === 401 || status === 403) return "The reading service refused the API key. Check ANTHROPIC_API_KEY in Settings.";
  // Anything else from the API still never reaches the page as its JSON body.
  return `The reading service could not read this${status ? ` (error ${status})` : ""}. Nothing was changed. Try again, and if it keeps happening, report it.`;
}
