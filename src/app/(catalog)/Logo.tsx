"use client";

import { useState } from "react";

/**
 * The shop's mark.
 *
 * It renders `public/alpsport-logo.png` when that file is there, and draws the wordmark itself
 * when it is not — so the app looks like Alpsport out of the box and looks exactly like Alpsport
 * the moment someone drops the real artwork in. Nothing else has to change.
 */
export function Logo({ className, height = 34 }: { className?: string; height?: number }) {
  const [missing, setMissing] = useState(false);

  if (!missing) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- the file is optional; onError is the fallback
      <img
        src="/alpsport-logo.png"
        alt="Alpsport"
        height={height}
        style={{ height, width: "auto" }}
        className={className}
        onError={() => setMissing(true)}
      />
    );
  }

  return <Wordmark className={className} height={height} />;
}

/** The oval, the peak and the two-tone wordmark, drawn rather than loaded. */
export function Wordmark({ className, height = 34 }: { className?: string; height?: number }) {
  return (
    <svg viewBox="0 0 240 88" height={height} style={{ height, width: "auto" }} className={className} role="img" aria-label="Alpsport — Snow & Outdoor">
      <defs>
        <linearGradient id="alp-oval" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2f8fd8" />
          <stop offset="55%" stopColor="#0b4ea2" />
          <stop offset="100%" stopColor="#06356f" />
        </linearGradient>
      </defs>
      <ellipse cx="120" cy="44" rx="118" ry="42" fill="url(#alp-oval)" stroke="#ffd400" strokeWidth="4" />
      <path d="M36 54 L57 24 L71 44 L79 34 L100 54 Z" fill="#ffffff" opacity="0.95" />
      <path d="M57 24 L64 34 L50 34 Z" fill="#dce9f7" />
      <text x="120" y="52" textAnchor="middle" fontFamily="system-ui, -apple-system, Segoe UI, sans-serif" fontSize="34" fontWeight="800" fontStyle="italic" letterSpacing="-0.5">
        <tspan fill="#ffffff">Alp</tspan>
        <tspan fill="#ffd400">sport</tspan>
      </text>
      <text x="120" y="70" textAnchor="middle" fontFamily="system-ui, -apple-system, Segoe UI, sans-serif" fontSize="11" fontWeight="600" fill="#ffd400" letterSpacing="1.5">
        SNOW &amp; OUTDOOR
      </text>
    </svg>
  );
}
