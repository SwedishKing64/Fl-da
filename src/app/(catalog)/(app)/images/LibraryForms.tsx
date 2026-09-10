"use client";

import { useActionState, useTransition } from "react";
import { deleteLibraryEntryAction, saveLibraryEntryAction } from "@/app/(catalog)/actions";
import { Alert, Button, Field, INPUT } from "@/app/(catalog)/ui";
import { ActionForm } from "@/app/(catalog)/ActionForm";

export function LibraryForm() {
  const [state, action, pending] = useActionState(saveLibraryEntryAction, null);
  return (
    <ActionForm action={action} state={state} resetOnSuccess className="space-y-3">
      <Field label="Brand"><input name="brand" required className={INPUT} /></Field>
      <Field label="Model / style code"><input name="modelCode" required className={INPUT} /></Field>
      <Field label="Colour (optional)"><input name="colour" className={INPUT} /></Field>
      <Field label="Image URLs (one per line)"><textarea name="urls" rows={4} required className={INPUT} placeholder="https://…" /></Field>
      {state && (state.ok ? <Alert tone="success">{state.message}</Alert> : <Alert tone="danger">{state.error}</Alert>)}
      <Button type="submit" variant="primary" disabled={pending}>Save</Button>
    </ActionForm>
  );
}

export function DeleteEntryButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return <Button size="sm" variant="ghost" disabled={pending} onClick={() => { if (confirm("Delete this entry?")) start(async () => { await deleteLibraryEntryAction(id); }); }}>Delete</Button>;
}
