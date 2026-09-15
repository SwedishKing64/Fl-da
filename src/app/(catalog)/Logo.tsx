"use client";

import { useEffect, useState } from "react";

/**
 * The shop's mark.
 *
 * It renders `public/alpsport-logo.png` when that file is there, and draws the wordmark itself
 * when it is not — so the app looks like Alpsport out of the box and looks exactly like Alpsport
 * the moment someone drops the real artwork in. Nothing else has to change.
 */
export function Logo({ className, height = 34 }: { className?: string; height?: number }) {
  // The drawn mark is what renders until the file is known to be good. Going the other way — render
  // the file and fall back on error — leaves a broken image on screen whenever the error beats
  // hydration to it, which on a server-rendered page it usually does.
  const [artwork, setArtwork] = useState(false);

  useEffect(() => {
    const probe = new Image();
    probe.onload = () => setArtwork(probe.naturalWidth > 0);
    probe.src = "/alpsport-logo.png";
  }, []);

  if (!artwork) return <Wordmark className={className} height={height} />;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- optional artwork, probed above
    <img src="/alpsport-logo.png" alt="Alpsport" height={height} style={{ height, width: "auto" }} className={className} />
  );
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
      {/* The peak sits above the wordmark, the way it sits above it on the sign. */}
      <path d="M78 34 L100 8 L114 24 L122 16 L144 34 Z" fill="#ffffff" opacity="0.92" />
      <path d="M100 8 L107 16 L93 16 Z" fill="#c9ddf2" />
      <text x="120" y="62" textAnchor="middle" fontFamily="system-ui, -apple-system, Segoe UI, sans-serif" fontSize="30" fontWeight="800" fontStyle="italic" letterSpacing="-0.5">
        <tspan fill="#ffffff">Alp</tspan>
        <tspan fill="#ffd400">sport</tspan>
      </text>
      <text x="120" y="78" textAnchor="middle" fontFamily="system-ui, -apple-system, Segoe UI, sans-serif" fontSize="9" fontWeight="700" fill="#ffd400" letterSpacing="2">
        SNOW &amp; OUTDOOR
      </text>
    </svg>
  );
}
