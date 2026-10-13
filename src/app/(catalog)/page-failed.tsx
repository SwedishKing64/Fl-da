import { unstable_rethrow } from "next/navigation";
import { Alert } from "@/app/(catalog)/ui";

/**
 * A page that says why it could not load, in the page.
 *
 * In production Next.js replaces a server error's message with a digest before the browser
 * sees it, so a page that threw while loading its data could only say "something failed".
 * Rendering the failure as content — this component, built by the page's own catch — keeps the
 * message, because it is not an error any more, it is what the page shows. Next's own signals
 * (not found, redirect) are rethrown untouched.
 */
export async function guarded(render: () => Promise<React.ReactNode>): Promise<React.ReactNode> {
  try {
    return await render();
  } catch (err) {
    unstable_rethrow(err);
    const message = err instanceof Error ? err.message : String(err);
    const name = err instanceof Error ? err.name : "Error";
    const code = err && typeof err === "object" && "code" in err ? String((err as { code?: unknown }).code ?? "") : "";
    console.error("[page] could not load:", err);
    return (
      <div className="mx-auto max-w-2xl space-y-4 py-10">
        <h1 className="text-xl font-semibold tracking-tight">This page could not load</h1>
        <Alert tone="danger">
          <p><strong>What the server said:</strong> {message}</p>
          <p className="mt-2 font-mono text-xs opacity-80">{name}{code ? ` · ${code}` : ""}</p>
          <p className="mt-2 text-sm">Reload to try again. If it keeps happening, send the line above to whoever looks after this app — it is the whole of what went wrong.</p>
        </Alert>
      </div>
    );
  }
}
