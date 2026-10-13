import type { Instrumentation } from "next";

/**
 * Every error the server hits, kept where it can be read.
 *
 * In production Next.js hides a server error's message from the browser and shows a digest in
 * its place, so an error page could only say "something failed" — and the one place the message
 * went was a host log nobody was looking at. This records each one in the audit log with its
 * digest, and the error page looks its own digest up and shows what the server actually said.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const message = err instanceof Error ? err.message : String(err);
  const digest = typeof err === "object" && err !== null && "digest" in err ? String((err as { digest?: unknown }).digest ?? "") : "";
  const stack = err instanceof Error && err.stack ? err.stack.split("\n").slice(0, 12).join("\n") : "";
  console.error(`[error] ${context.routeType} ${request.method} ${request.path} digest=${digest || "-"}: ${message}`);
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { prisma } = await import("@/lib/catalog/db");
    await prisma.auditLog.create({
      data: {
        action: "error",
        details: JSON.stringify({ digest, message, stack, path: request.path, method: request.method, routePath: context.routePath, routeType: context.routeType, renderSource: context.renderSource ?? null }),
      },
    });
  } catch (recordErr) {
    console.error("[error] could not record the error:", recordErr instanceof Error ? recordErr.message : String(recordErr));
  }
};
