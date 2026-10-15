import { cx } from "@/app/(catalog)/ui";

/**
 * The Flöda mark: the umlaut, made into the brand. Two drops over the bowl of the "ö", on a tile
 * that runs from Meta blue to a brighter sky — the name's own letter, and a nod to what the app
 * does: paperwork poured in, listings flowing out.
 *
 * Inline SVG so it is crisp at any size, needs no file, and takes its colours from the page where
 * the wordmark is drawn in ink.
 */
export function Mark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <defs>
        <linearGradient id="floda-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0a4fc2" />
          <stop offset="0.55" stopColor="#0866ff" />
          <stop offset="1" stopColor="#38a9ff" />
        </linearGradient>
        <linearGradient id="floda-sheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="17" fill="url(#floda-tile)" />
      <rect x="2" y="2" width="60" height="30" rx="17" fill="url(#floda-sheen)" />
      <circle cx="23" cy="20" r="5.2" fill="#fff" />
      <circle cx="41" cy="20" r="5.2" fill="#fff" />
      <path d="M15 33.5c0 11 7.6 18.5 17 18.5s17-7.5 17-18.5" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The wordmark: Flöda, set heavy and tight in the display face, its umlaut drawn as the two dots
 * of the mark. `tone` is the ink it is written in — dark on a light page, white on the blue rail.
 */
export function Wordmark({ size = 22, tone = "dark", className }: { size?: number; tone?: "dark" | "light"; className?: string }) {
  const dot = tone === "light" ? "#7fc0ff" : "#0866ff";
  const dot2 = tone === "light" ? "#ffffff" : "#38a9ff";
  return (
    <span className={cx("wordmark", className)} style={{ fontSize: size, color: tone === "light" ? "#fff" : "var(--ink)" }} aria-label="Flöda">
      <span aria-hidden>Fl</span>
      <span className="wordmark-o" aria-hidden>
        o
        <span className="wordmark-dots">
          <i style={{ background: dot }} />
          <i style={{ background: dot2 }} />
        </span>
      </span>
      <span aria-hidden>da</span>
    </span>
  );
}

/** Mark and wordmark side by side, the way the app signs itself. */
export function Logo({ size = 22, tone = "dark", className, mark = true }: { size?: number; tone?: "dark" | "light"; className?: string; mark?: boolean }) {
  return (
    <span className={cx("inline-flex items-center", className)} style={{ gap: Math.round(size * 0.42) }}>
      {mark && <Mark size={Math.round(size * 1.35)} />}
      <Wordmark size={size} tone={tone} />
    </span>
  );
}
