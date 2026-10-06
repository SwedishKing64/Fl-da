"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { auditBatchAction, reviewBatchAction } from "@/app/(catalog)/actions";
import { Alert, Button, Card } from "@/app/(catalog)/ui";

/**
 * The build, looked over the way a person would before anyone else sees it.
 *
 * Runs itself once after every build, where the API is available: the files are read again,
 * forensically, and a column read wrong is put right and the batch rebuilt; then every product is
 * checked against the shop's conventions and the chat. What it changed and what it could not
 * settle is said in the instruction chat. The button runs it again — after an answer
 * in the chat, or an edit by hand.
 */
/** How long one of the two requests is given before the card says so. The host allows a minute. */
const PATIENCE_MS = 75_000;

function withinTime<T>(work: Promise<T>, doing: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`The check stopped while ${doing}: no answer came back in time. It is saved as far as it got — press Check the build to carry on.`)), PATIENCE_MS);
    work.then((v) => { clearTimeout(timer); resolve(v); }, (err: unknown) => {
      clearTimeout(timer);
      reject(new Error(`The check stopped while ${doing}: ${err instanceof Error ? err.message : String(err)}. It is saved as far as it got — press Check the build to carry on.`));
    });
  });
}

export function BuildCheck({ batchId, needed, aiEnabled, locked }: { batchId: string; needed: boolean; aiEnabled: boolean; locked: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ tone: "info" | "success" | "warning" | "danger"; text: string } | null>(null);
  const [step, setStep] = useState<"files" | "products">("files");
  const ran = useRef(false);

  // Two requests, not one: the forensic read of the files and then the product review are each
  // a long model call, and together they outlast what a deployed request is allowed. Either one
  // failing — cut off by the host, the network dropping — is said here, in this card, and never
  // thrown: an error escaping a transition took the whole page down to "Something went wrong".
  const run = () => start(async () => {
    try {
      setStep("files");
      const audit = await withinTime(auditBatchAction(batchId), "re-reading the files");
      if (!audit.ok) { setResult({ tone: "danger", text: audit.error }); return; }
      setStep("products");
      const r = await withinTime(reviewBatchAction(batchId, { audited: true }), "checking the products");
      if (!r.ok) { setResult({ tone: "danger", text: `${audit.data!.summary} ${r.error}` }); return; }
      const { summary, changed, questions: asked } = r.data!;
      const questions = [...audit.data!.questions, ...asked];
      setResult({ tone: questions.length ? "warning" : changed ? "success" : "info", text: `${audit.data!.summary} ${summary}${changed ? ` ${changed} change${changed === 1 ? "" : "s"} made.` : ""}${questions.length ? ` ${questions.length} question${questions.length === 1 ? "" : "s"} for you in the chat.` : ""}` });
    } catch (err) {
      setResult({ tone: "danger", text: err instanceof Error ? err.message : String(err) });
    } finally {
      router.refresh();
    }
  });

  // Once per build: a rebuild — from the chat, from a new file — makes the check needed again,
  // and it runs again then. A check that failed is not repeated on its own; the button is there.
  useEffect(() => {
    if (!needed) { ran.current = false; return; }
    if (aiEnabled && !locked && !ran.current) { ran.current = true; run(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needed, aiEnabled, locked]);

  if (!aiEnabled) return null;
  return (
    <Card title="Build check" actions={<Button size="sm" disabled={pending || locked} onClick={run}>{pending ? "Checking…" : "Check the build"}</Button>}>
      {pending && <p className="text-sm text-[var(--ink-soft)]">{step === "files" ? "Reading the files again, forensically — every tab, every column, the totals. Up to a minute…" : "Files read. Now every product against how the shop lists this brand and what was said in the chat. Up to a minute…"}</p>}
      {!pending && result && <Alert tone={result.tone}>{result.text}</Alert>}
      {!pending && !result && <p className="text-sm text-[var(--ink-soft)]">{needed ? "This build has not been checked yet." : "Checked. The result is in the chat above; run it again after you answer or edit."}</p>}
    </Card>
  );
}
