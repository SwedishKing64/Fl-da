"use client";

import { useEffect, useState } from "react";

/**
 * "Flöda has been updated — reload": a page keeps running the version it was opened with, so a fix
 * that went live after it was opened never reaches it until it is reloaded (2026-10-23). The build
 * this page came with is compared with the server's, on a timer and whenever the tab comes back
 * into view.
 */
const MINE = process.env.NEXT_PUBLIC_BUILD || "dev";

export function UpdateBanner() {
  const [stale, setStale] = useState(false);
  useEffect(() => {
    if (MINE === "dev") return;
    let stopped = false;
    const check = async () => {
      try {
        const r = await fetch(`/api/version?t=${Date.now()}`, { cache: "no-store" });
        const { build } = (await r.json()) as { build?: string };
        if (!stopped && build && build !== "dev" && build !== MINE) setStale(true);
      } catch { /* offline for a moment: try again next time */ }
    };
    void check();
    const timer = window.setInterval(check, 2 * 60_000);
    const onShow = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onShow);
    return () => { stopped = true; window.clearInterval(timer); document.removeEventListener("visibilitychange", onShow); };
  }, []);
  if (!stale) return null;
  return (
    <div role="status" className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-3 bg-amber-100 px-4 py-2 text-sm text-amber-900 shadow">
      <span><strong>Flöda has been updated.</strong> Reload the page to use the latest version — until then this page keeps working the old way.</span>
      <button type="button" className="rounded-lg bg-amber-900 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-800" onClick={() => window.location.reload()}>Reload now</button>
    </div>
  );
}
