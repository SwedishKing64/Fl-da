"use client";

import { useActionState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveApiKeyAction, skipSetupStepAction } from "@/app/(catalog)/actions";
import { Alert, Button, Card, Field, INPUT } from "@/app/(catalog)/ui";
import type { KeySource } from "@/lib/catalog/anthropic";
import { ActionForm } from "@/app/(catalog)/ActionForm";

/**
 * The key that lets PDFs, photos and web pages be read. Spreadsheets work without it. The same
 * form sits on Settings; in setup it moves on once the key is kept.
 */
export function ApiKeyForm({ source, tail, next }: { source: KeySource; tail: string; next?: string }) {
  const [state, action, pending] = useActionState(saveApiKeyAction, null);
  const router = useRouter();
  useEffect(() => { if (next && state?.ok) router.push(next); }, [state, next, router]);

  if (source === "host") {
    return <Alert tone="success">The key is set by the host this copy runs on (ANTHROPIC_API_KEY), so there is nothing to paste here.</Alert>;
  }
  return (
    <ActionForm action={action} state={state} className="space-y-3">
      {source === "settings" && <Alert tone="success">A key ending {tail} is kept. Paste another to replace it, or save empty to remove it.</Alert>}
      {source === "floda" && <Alert tone="success">Reading is included in your Flöda plan, so there is nothing to set up. Paste a key of your own only if you would rather reading was billed to your own Anthropic account.</Alert>}
      <Field label="Anthropic API key" hint="From console.anthropic.com → API keys. It is kept in this copy's own database and sent nowhere but to Anthropic.">
        <input name="key" type="password" className={INPUT} placeholder="sk-ant-…" autoComplete="off" />
      </Field>
      {state && (state.ok ? <Alert tone="success">{state.message}</Alert> : <Alert tone="danger">{state.error}</Alert>)}
      <Button type="submit" variant="primary" icon="🔑" disabled={pending}>{pending ? "Trying the key…" : next ? "Keep the key and continue" : "Keep the key"}</Button>
    </ActionForm>
  );
}

export function AiStep({ source, tail }: { source: KeySource; tail: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const included = source === "host" || source === "floda";
  return (
    <Card title="Reading documents">
      <p className="mb-4 text-[14px] text-[var(--ink-soft)]">
        Spreadsheets and CSVs are read on their own. PDFs, photographs of paperwork, handwriting and the brand pages that supply descriptions and pictures are read by Claude{included ? ", and that reading is included in your plan." : ", which needs an API key. Usage is billed by Anthropic to the key\u2019s account; a season\u2019s paperwork costs a few dollars."}
      </p>
      <ApiKeyForm source={source} tail={tail} next="/setup?step=done" />
      <div className="mt-5 flex items-center justify-between border-t border-[var(--line-soft)] pt-4 text-[13px] text-[var(--ink-soft)]">
        <span>{included ? "" : "You can add it later in Settings."}</span>
        <Button size="sm" variant={included ? "primary" : "ghost"} disabled={pending} onClick={() => start(async () => { if (!included) await skipSetupStepAction("ai"); router.push("/setup?step=done"); })}>{included ? "Continue →" : "Skip for now"}</Button>
      </div>
    </Card>
  );
}
