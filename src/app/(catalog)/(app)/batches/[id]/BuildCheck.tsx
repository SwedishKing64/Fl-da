"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reviewBatchAction } from "@/app/(catalog)/actions";
import { Alert, Button, Card } from "@/app/(catalog)/ui";

/**
 * The build, looked over the way a person would before anyone else sees it.
 *
 * Runs itself once after every build, where the API is available, and says in the instruction
 * chat what it changed and what it could not settle. The button runs it again — after an answer
 * in the chat, or an edit by hand.
 */
export function BuildCheck({ batchId, needed, aiEnabled, locked }: { batchId: string; needed: boolean; aiEnabled: boolean; locked: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ tone: "info" | "success" | "warning" | "danger"; text: string } | null>(null);
  const ran = useRef(false);

  const run = () => start(async () => {
    const r = await reviewBatchAction(batchId);
    if (!r.ok) { setResult({ tone: "danger", text: r.error }); return; }
    const { summary, changed, questions } = r.data!;
    setResult({ tone: questions.length ? "warning" : changed ? "success" : "info", text: `${summary}${changed ? ` ${changed} change${changed === 1 ? "" : "s"} made.` : ""}${questions.length ? ` ${questions.length} question${questions.length === 1 ? "" : "s"} for you in the chat.` : ""}` });
    router.refresh();
  });

  useEffect(() => {
    if (needed && aiEnabled && !locked && !ran.current) { ran.current = true; run(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needed, aiEnabled, locked]);

  if (!aiEnabled) return null;
  return (
    <Card title="Build check" actions={<Button size="sm" disabled={pending || locked} onClick={run}>{pending ? "Checking…" : "Check the build"}</Button>}>
      {pending && <p className="text-sm text-[var(--ink-soft)]">Looking over every product against how the shop lists this brand and what was said in the chat…</p>}
      {!pending && result && <Alert tone={result.tone}>{result.text}</Alert>}
      {!pending && !result && <p className="text-sm text-[var(--ink-soft)]">{needed ? "This build has not been checked yet." : "Checked. The result is in the chat above; run it again after you answer or edit."}</p>}
    </Card>
  );
}
