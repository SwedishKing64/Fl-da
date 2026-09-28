/**
 * What went wrong with a call to the reading service, in words, and whether waiting would help.
 *
 * The API's own error text is its JSON body — `{"type":"error","error":{"type":"overloaded_error",…`
 * — and that is exactly what the bulk page was putting in front of somebody pricing a sale. Read by
 * the SDK's typed classes and status codes, never by matching the text, because the text is not a
 * contract and the status is.
 */

import Anthropic from "@anthropic-ai/sdk";

/** Load, rate limits, the service being briefly down, a dropped connection: about the moment. */
export function isTransient(err: unknown): boolean {
  if (err instanceof Anthropic.APIConnectionError) return true;           // includes timeouts
  if (err instanceof Anthropic.APIError) {
    const status = err.status ?? 0;
    return status === 429 || status === 529 || status >= 500;
  }
  return false;
}

/** A sentence somebody can act on, or null when the error did not come from the API at all. */
export function describeApiError(err: unknown): string | null {
  if (err instanceof Anthropic.APIConnectionError) {
    return "The reading service could not be reached, even after trying again. Nothing was changed. Try again in a minute — if it keeps happening, the connection from the server is down.";
  }
  if (!(err instanceof Anthropic.APIError)) return null;
  const status = err.status ?? 0;
  if (status === 529) return "The reading service is overloaded right now and turned this away, even after waiting and trying again several times. Nothing was changed. This is on the service's side, not your file — try again in a few minutes.";
  if (status === 429) return "Too much was sent to the reading service at once and it turned this away. Nothing was changed. Wait a minute and try again.";
  if (status >= 500) return "The reading service had a fault of its own and this was not read. Nothing was changed. Try again in a minute.";
  if (status === 401 || status === 403) return "The reading service refused the API key. Check ANTHROPIC_API_KEY in Settings.";
  if (status === 400) return `The reading service could not accept this request: ${err.message}`;
  return null;
}
