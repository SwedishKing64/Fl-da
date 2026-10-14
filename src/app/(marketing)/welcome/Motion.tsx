"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";

/**
 * The page's motion, all of it driven by scrolling: things rise into place as they enter the
 * viewport, numbers count up once seen, the header turns solid once the page is moving. Each
 * respects the viewer's reduced-motion setting, where everything is simply there.
 */

const QUERY = "(prefers-reduced-motion: reduce)";
const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

/** Whether the viewer has asked for less motion. False on the server, so the markup matches. */
function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
}

function reduced(): boolean {
  return typeof window !== "undefined" && window.matchMedia(QUERY).matches;
}

/** Rises into place when it scrolls into view. `delay` staggers siblings, in steps of 80ms. */
export function Reveal({ children, delay = 0, as: Tag = "div", className = "", style, once = true }: { children: ReactNode; delay?: number; as?: "div" | "section" | "li" | "p" | "h2" | "figure"; className?: string; style?: CSSProperties; once?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const still = useReducedMotion();
  const [entered, setSeen] = useState(false);
  const seen = entered || still;
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced()) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) { setSeen(true); if (once) io.disconnect(); } else if (!once) setSeen(false);
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [once]);
  const Component = Tag as "div";
  return (
    <Component ref={ref as never} className={`reveal ${seen ? "in" : ""} ${className}`.trim()} style={{ ...style, transitionDelay: seen ? `${delay * 80}ms` : "0ms" }}>
      {children}
    </Component>
  );
}

/** Counts from 0 to the figure the first time it is seen. Non-numeric text is shown as is. */
export function CountUp({ to, suffix = "", prefix = "", duration = 1400 }: { to: number; suffix?: string; prefix?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const still = useReducedMotion();
  const [counted, setN] = useState(0);
  const n = still ? to : counted;
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced()) return;
    let raf = 0;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      const start = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        setN(Math.round(to * eased));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.5 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [to, duration]);
  return <span ref={ref}>{prefix}{n.toLocaleString("en-AU")}{suffix}</span>;
}

/** The header: transparent over the hero, solid glass once the page has moved. */
export function Bar({ children }: { children: ReactNode }) {
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return <header className={`bar ${solid ? "solid" : ""}`}>{children}</header>;
}

/**
 * The hero's demonstration: an order form's lines arrive, are read, and become listings, over
 * and over. Pure CSS once the `play` class is on; this only starts it when it is in view, so the
 * loop is not running unseen.
 */
export function Demo({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const still = useReducedMotion();
  const [seen, setPlay] = useState(false);
  const play = seen || still;
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced()) return;
    const io = new IntersectionObserver((entries) => setPlay(entries.some((e) => e.isIntersecting)), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={`demo ${play ? "play" : ""}`}>{children}</div>;
}

/** Follows the cursor a little, the way a product shot does on a launch page. */
export function Tilt({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced() || !window.matchMedia("(hover: hover)").matches) return;
    const move = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty("--rx", `${(-y * 4).toFixed(2)}deg`);
      el.style.setProperty("--ry", `${(x * 6).toFixed(2)}deg`);
    };
    const leave = () => { el.style.setProperty("--rx", "0deg"); el.style.setProperty("--ry", "0deg"); };
    el.addEventListener("mousemove", move);
    el.addEventListener("mouseleave", leave);
    return () => { el.removeEventListener("mousemove", move); el.removeEventListener("mouseleave", leave); };
  }, []);
  return <div ref={ref} className={`tilt ${className}`.trim()}>{children}</div>;
}
