"use client";

/**
 * Last resort. Anything that escapes the database gate and the page-level boundaries lands
 * here rather than on Vercel's blank "a server error occurred" page, which tells nobody
 * anything. Shows the digest so a deployment log can be matched to what the user saw.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", background: "#F6F5F9", color: "#16151C" }}>
        <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 16px" }}>
          <div style={{ width: "100%", maxWidth: 560, background: "#fff", border: "1px solid #E2E0E9", borderRadius: 12, padding: 24 }}>
            <h1 style={{ margin: 0, fontSize: 18, letterSpacing: "-0.02em" }}>Something went wrong</h1>
            <p style={{ marginTop: 8, fontSize: 14, lineHeight: 1.6, color: "#4A4757" }}>
              The page could not be rendered. This is almost always the database: either the deployment has no connection
              string, or it has one that points somewhere unreachable.
            </p>
            <p style={{ marginTop: 8, fontSize: 14, lineHeight: 1.6, color: "#4A4757" }}>
              Reload to see the database diagnostics, which name the variable in use and what failed.
            </p>
            <div style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => reset()}
                style={{ background: "#16151C", color: "#fff", border: 0, borderRadius: 6, padding: "8px 14px", fontSize: 14, cursor: "pointer" }}
              >
                Try again
              </button>
              {error.digest && (
                <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, color: "#6A6678" }}>digest {error.digest}</span>
              )}
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
