"use client";

import { useActionState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveApiKeyAction, skipSetupStepAction } from "@/app/(catalog)/actions";
import { Alert, Button, Card, Field, INPUT } from "@/app/(catalog)/ui";
import { ActionForm } from "@/app/(catalog)/ActionForm";

/**
 * The key that lets PDFs, photos and web pages be read. Spreadsheets work without it. The same
 * form sits on Settings; in setup it moves on once the key is kept.
 */
export function ApiKeyForm({ source, tail, next }: { source: "host" | "settings" | "none"; tail: string; next?: string }) {
  const [state, action, pending] = useActionState(saveApiKeyAction, null);
  const router = useRouter();
  useEffect(() => { if (next && state?.ok) router.push(next); }, [state, next, router]);

  if (source === "host") {
    return <Alert tone="success">The key is set by the host this copy runs on (ANTHROPIC_API_KEY), so there is nothing to paste here.</Alert>;
  }
  return (
    <ActionForm action={action} state={state} className="space-y-3">
      {source === "settings" && <Alert tone="success">A key ending {tail} is kept. Paste another to replace it, or save empty to remove it.</Alert>}
      <Field label="Anthropic API key" hint="From console.anthropic.com → API keys. It is kept in this copy's own database and sent nowhere but to Anthropic.">
        <input name="key" type="password" className={INPUT} placeholder="sk-ant-…" autoComplete="off" />
      </Field>
      {state && (state.ok ? <Alert tone="success">{state.message}</Alert> : <Alert tone="danger">{state.error}</Alert>)}
      <Button type="submit" variant="primary" icon="🔑" disabled={pending}>{pending ? "Trying the key…" : next ? "Keep the key and continue" : "Keep the key"}</Button>
    </ActionForm>
  );
}

export function AiStep({ source, tail }: { source: "host" | "settings" | "none"; tail: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Card title="Reading documents">
      <p className="mb-4 text-[14px] text-[var(--ink-soft)]">
        Spreadsheets and CSVs are read on their own. PDFs, photographs of paperwork, handwriting and the brand pages that supply descriptions and pictures are read by Claude, which needs an API key. Usage is billed by Anthropic to the key&rsquo;s account; a season&rsquo;s paperwork costs a few dollars.
      </p>
      <ApiKeyForm source={source} tail={tail} next="/setup?step=done" />
      <div className="mt-5 flex items-center justify-between border-t border-[var(--line-soft)] pt-4 text-[13px] text-[var(--ink-soft)]">
        <span>{source === "host" ? "" : "You can add it later in Settings."}</span>
        <Button size="sm" variant={source === "host" ? "primary" : "ghost"} disabled={pending} onClick={() => start(async () => { if (source !== "host") await skipSetupStepAction("ai"); router.push("/setup?step=done"); })}>{source === "host" ? "Continue →" : "Skip for now"}</Button>
      </div>
    </Card>
  );
}
