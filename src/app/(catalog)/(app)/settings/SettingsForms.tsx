"use client";

import { useActionState, useTransition } from "react";
import { createUserAction, deleteUserAction } from "@/app/(catalog)/actions";
import { Alert, Button, Field, INPUT } from "@/app/(catalog)/ui";
import { ActionForm } from "@/app/(catalog)/ActionForm";

/**
 * Read-only: what is set, where the files go, and how far away the database is.
 *
 * Nothing here can be changed from the page. It is here because each line reports a condition that
 * otherwise costs someone an afternoon before anybody notices it — uploads quietly discarded, or
 * every page waiting on a database on the other side of the world.
 */
export function Status({ aiConfigured, storage, latency, blobFrom, blobNames }: { aiConfigured: boolean; storage: "blob" | "disk" | "ephemeral"; latency: { ms: number; region: string | null } | null; blobFrom?: string | null; blobNames?: string[] }) {
  return (
    <div className="space-y-3">
      {storage === "blob" && <Alert tone="success">Files are stored in Vercel Blob; uploaded images get public URLs automatically.{blobFrom && blobFrom !== "BLOB_READ_WRITE_TOKEN" ? <> The token came from <strong>{blobFrom}</strong>, which is how Vercel names a store attached under a prefix.</> : null}</Alert>}
      {storage === "ephemeral" && (
        <Alert tone="danger">
          <div className="font-semibold">Running on Vercel with no Blob store it can see — uploads will be lost between requests.</div>
          <p className="mt-1">A token is recognised by its value, so the variable can be named anything. It has to look like <span className="mono">vercel_blob_rw_…</span>.</p>
          {blobNames && blobNames.length > 0
            ? <p className="mt-1">These variables mention Blob but none of them holds a token of that shape: <strong>{blobNames.join(", ")}</strong>. If the store is connected, the project may need a redeploy for the variable to reach the running app.</p>
            : <p className="mt-1">No variable here mentions Blob at all. In Vercel: Storage → connect a Blob store to this project, then redeploy.</p>}
        </Alert>
      )}
      {storage === "disk" && <Alert tone="info">Files are stored on this machine&apos;s disk. Set APP_PUBLIC_URL so Shopify can fetch uploaded images.</Alert>}
      <Alert tone={aiConfigured ? "success" : "warning"}>{aiConfigured ? "ANTHROPIC_API_KEY is set: PDFs, photos and the web lookup all work." : "ANTHROPIC_API_KEY is not set. Spreadsheets and CSVs still work — the shop's sale template is read without it — but PDFs, photos and the web lookup cannot run."}</Alert>
      {latency && <Alert tone={latency.ms < 40 ? "success" : latency.ms < 120 ? "info" : "warning"}>
        {`The database answers in about ${latency.ms}ms${latency.region ? `, from ${latency.region}` : ""}. `}
        {latency.ms < 40
          ? "That is next door; pages are as quick as they will get."
          : latency.ms < 120
            ? "Workable. Every page waits on a few of these, so it is felt but not painful."
            : "That is a long way. Every page waits on several of these, which is most of why the app feels slow — the app and the database are almost certainly in different parts of the world. Moving them together is the single biggest thing that would speed this up."}
      </Alert>}
    </div>
  );
}

export function UserForm() {
  const [state, action, pending] = useActionState(createUserAction, null);
  return (
    <ActionForm action={action} state={state} resetOnSuccess className="grid gap-3 sm:grid-cols-2">
      <Field label="Name"><input name="name" required className={INPUT} /></Field>
      <Field label="Email"><input name="email" type="email" required className={INPUT} /></Field>
      <Field label="Password"><input name="password" type="password" minLength={8} required className={INPUT} /></Field>
      <Field label="Role"><select name="role" defaultValue="STAFF" className={INPUT}><option value="STAFF">Staff</option><option value="ADMIN">Admin</option></select></Field>
      {state && <div className="sm:col-span-2">{state.ok ? <Alert tone="success">{state.message}</Alert> : <Alert tone="danger">{state.error}</Alert>}</div>}
      <div><Button type="submit" variant="primary" icon="👤" disabled={pending}>Add account</Button></div>
    </ActionForm>
  );
}

export function DeleteUserButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return <Button size="sm" variant="ghost" disabled={pending} onClick={() => { if (confirm("Remove this account?")) start(async () => { const r = await deleteUserAction(id); if (!r.ok) alert(r.error); }); }}>Remove</Button>;
}
