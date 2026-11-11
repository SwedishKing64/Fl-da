import { cx } from "@/app/(catalog)/ui";

/**
 * The Snaben mark, kept from before the name changed: a heavy geometric F in white on the blue tile,
 * its two bars stepped like lines on a form, so it reads as "F" at 16px in a tab and as a tile on
 * a desktop. Inline SVG so it is crisp at any size and needs no file.
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
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.2" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="17" fill="url(#floda-tile)" />
      <rect x="2" y="2" width="60" height="30" rx="17" fill="url(#floda-sheen)" />
      <rect x="18" y="14" width="10" height="36" rx="2.5" fill="#fff" />
      <rect x="18" y="14" width="29" height="10" rx="2.5" fill="#fff" />
      <rect x="18" y="29" width="22" height="9" rx="2.5" fill="#fff" />
    </svg>
  );
}

/**
 * The wordmark: Snaben, set heavy and tight in the display face, in the same face and weight the
 * mark was drawn for. `tone` is the ink it is written in — dark on a light page, white on the
 * blue rail.
 */
export function Wordmark({ size = 22, tone = "dark", className }: { size?: number; tone?: "dark" | "light"; className?: string }) {
  return (
    <span className={cx("wordmark", className)} style={{ fontSize: size, color: tone === "light" ? "#fff" : "var(--ink)" }} aria-label="Snaben">
      <span aria-hidden>Snaben</span>
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
