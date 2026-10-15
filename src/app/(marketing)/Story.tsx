"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * A scroll story: the steps on one side scroll past, and the panel on the other side stays put
 * and changes to match whichever step is in the middle of the viewport. The panel is pinned with
 * position: sticky, so there is nothing to fight the scroll; only which step is current is read.
 */
export function Story({ steps, panels }: { steps: Array<{ title: string; text: string }>; panels: ReactNode[] }) {
  const [current, setCurrent] = useState(0);
  const refs = useRef<Array<HTMLLIElement | null>>([]);
  useEffect(() => {
    const els = refs.current.filter(Boolean) as HTMLLIElement[];
    if (els.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setCurrent(Number((e.target as HTMLElement).dataset.i));
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [steps.length]);
  return (
    <div className="story">
      <div className="story-pin" aria-hidden>
        {panels.map((p, i) => <div key={i} className={`story-panel ${i === current ? "on" : ""}`}>{p}</div>)}
      </div>
      <ol className="story-steps">
        {steps.map((s, i) => (
          <li key={s.title} ref={(el) => { refs.current[i] = el; }} data-i={i} className={i === current ? "on" : ""} onClick={() => setCurrent(i)}>
            <span className="n">{i + 1}</span>
            <h3>{s.title}</h3>
            <p>{s.text}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** One question that opens; opening another closes it, so the page stays short. */
export function Faq({ items }: { items: Array<{ q: string; a: ReactNode }> }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="faq">
      {items.map((it, i) => (
        <div key={it.q} className={`q ${open === i ? "open" : ""}`}>
          <button type="button" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
            <span>{it.q}</span><span className="pm" aria-hidden>{open === i ? "–" : "+"}</span>
          </button>
          <div className="a" hidden={open !== i}><div>{it.a}</div></div>
        </div>
      ))}
    </div>
  );
}
