"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { lookupProductsAction } from "@/app/(catalog)/actions";
import { Alert, Button } from "@/app/(catalog)/ui";

/**
 * Filling in what the invoice did not carry, from the brand's own site.
 *
 * This is the point of the API key, and until now nothing on any page called it. The only lookup
 * that ever ran was the automatic one at the tail of the upload request — which shares a sixty
 * second function with a vision call over a photographed invoice, so in practice it got through
 * one or two products and the rest were left marked "never looked up" with nothing to say so.
 *
 * So: it says how many are outstanding, it starts by itself, and it keeps going. One pass is
 * bounded on purpose — each lookup is a web search taking tens of seconds — and it reports what is
 * left, so this simply calls again until nothing is left or a pass stops making progress.
 */
interface Props {
  batchId: string;
  /** Products with no description, no brand, or no price on any variant. */
  outstanding: number;
  enabled: boolean;
}

interface Progress { done: number; prices: number; descriptions: number; remaining: number }

export function LookupPanel({ batchId, outstanding, enabled }: Props) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  // One automatic start per page load, and never a second one racing the first.
  const started = useRef(false);

  const run = useCallback(async (retry: boolean) => {
    if (running) return;
    setRunning(true);
    setError(null);
    setFinished(false);
    let done = 0, prices = 0, descriptions = 0;
    try {
      // Keep asking for another pass while one is still finding things to do. A pass that attempts
      // nothing is the stopping condition — without it a product the web cannot answer for would
      // be asked about forever.
      for (let pass = 0; pass < 12; pass++) {
        const r = await lookupProductsAction(batchId, pass === 0 && retry ? { retry: true } : {});
        if (!r.ok) { setError(r.error); break; }
        const d = r.data!;
        done += d.attempted;
        prices += d.prices;
        descriptions += d.descriptions;
        setProgress({ done, prices, descriptions, remaining: d.remaining });
        router.refresh();
        if (d.attempted === 0 || d.remaining === 0) break;
      }
      setFinished(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }, [batchId, router, running]);

  useEffect(() => {
    if (started.current || !enabled || outstanding === 0) return;
    started.current = true;
    void run(false);
  }, [enabled, outstanding, run]);

  if (!enabled) {
    return <Alert tone="warning" className="mb-3">No API key is set, so descriptions and recommended retail prices cannot be looked up. Add <strong>ANTHROPIC_API_KEY</strong> in Settings.</Alert>;
  }
  if (outstanding === 0 && !progress) return null;

  return (
    <Alert tone={error ? "danger" : running ? "info" : finished ? "success" : "info"} className="mb-3">
      <div className="flex flex-wrap items-center gap-3">
        {running && <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-blue-300 border-t-blue-700" aria-hidden />}
        <div className="min-w-0 flex-1">
          {error ? (
            <div><strong>The lookup stopped:</strong> {error}</div>
          ) : running ? (
            <div>
              Searching the brands&rsquo; websites for what the invoice did not carry — {progress ? `${progress.done} done, ${progress.remaining} to go` : `${outstanding} product${outstanding === 1 ? "" : "s"} to check`}.
              <span className="block text-xs">Each one is a web search, so this takes a while. The grid fills in as it goes and you can keep working.</span>
            </div>
          ) : finished && progress ? (
            <div>
              Looked up {progress.done} product{progress.done === 1 ? "" : "s"}: <strong>{progress.prices}</strong> recommended retail price{progress.prices === 1 ? "" : "s"} and <strong>{progress.descriptions}</strong> description{progress.descriptions === 1 ? "" : "s"} found.
              {progress.remaining > 0 && <span className="block text-xs">{progress.remaining} could not be found on the web — fill those in here or in Shopify.</span>}
            </div>
          ) : (
            <div>{outstanding} product{outstanding === 1 ? "" : "s"} still need a description or a price.</div>
          )}
        </div>
        <Button size="sm" disabled={running} onClick={() => void run(true)}>{running ? "Searching…" : finished ? "Search again" : "Find them now"}</Button>
      </div>
    </Alert>
  );
}
