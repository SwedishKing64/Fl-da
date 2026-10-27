/**
 * Which build of Flöda the server is running, so a page left open across an update can tell it is
 * out of date (the store asked 2026-10-23: a tab opened before a fix went live kept the old rule).
 * Nothing secret: the commit the deployment was built from.
 */
export const dynamic = "force-dynamic";

export function GET() {
  const build = process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_BUILD || "dev";
  return Response.json({ build }, { headers: { "cache-control": "no-store" } });
}
