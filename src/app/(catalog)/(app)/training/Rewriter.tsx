"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptChangeAction, rewriteInVoiceAction } from "@/app/(catalog)/actions";
import { Button, INPUT, cx } from "@/app/(catalog)/ui";
import { replacementsIn, wordDiff } from "@/lib/catalog/word-diff";

/**
 * Teaching by correction. Paste a maker's paragraph; Snaben writes it in your voice beside it;
 * edit that until it reads like yours, and the words you swapped are offered as your spellings.
 */
export function Rewriter({ aiEnabled, types, brands }: { aiEnabled: boolean; types: string[]; brands: string[] }) {
  const router = useRouter();
  const [original, setOriginal] = useState("");
  const [type, setType] = useState("");
  const [brand, setBrand] = useState("");
  const [written, setWritten] = useState("");
  const [edited, setEdited] = useState("");
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [kept, setKept] = useState<string[]>([]);

  const rewrite = () => start(async () => {
    setNote(""); setWritten(""); setEdited(""); setKept([]);
    const r = await rewriteInVoiceAction(original, { vendor: brand, productType: type });
    if (!r.ok || !r.data) return setNote(r.ok ? "No answer." : r.error);
    setWritten(r.data.text);
    setEdited(r.data.text);
  });
  const swaps = written && edited !== written ? replacementsIn(written, edited).filter((s) => !kept.includes(`${s.from}→${s.to}`)) : [];
  const keep = (from: string, to: string) => start(async () => {
    const r = await acceptChangeAction({ kind: "voice", spellings: [{ from, to, brand }] });
    if (!r.ok) return setNote(r.error);
    setKept((k) => [...k, `${from}→${to}`]);
    router.refresh();
  });

  return (
    <div className="space-y-4">
      <p className="text-[14px] text-[var(--ink-soft)]">Paste a supplier&rsquo;s paragraph. Snaben writes it the way your shop would, from what it has been taught so far. Edit the result until it reads like yours; each word you swap can be kept as the way you say it.</p>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-sm"><span className="mb-1.5 block text-[13.5px] font-semibold text-[var(--ink-2)]">The supplier&rsquo;s copy</span><textarea className={cx(INPUT, "min-h-[140px]")} value={original} onChange={(e) => setOriginal(e.target.value)} placeholder="Paste the maker's description here" /></label>
        <div className="space-y-2">
          <label className="block text-sm"><span className="mb-1.5 block text-[13.5px] font-semibold text-[var(--ink-2)]">Product type</span><input className={INPUT} list="rewriter-types" value={type} onChange={(e) => setType(e.target.value)} placeholder="Backpacks" /><datalist id="rewriter-types">{types.map((t) => <option key={t} value={t} />)}</datalist></label>
          <label className="block text-sm"><span className="mb-1.5 block text-[13.5px] font-semibold text-[var(--ink-2)]">Brand</span><input className={INPUT} list="rewriter-brands" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Osprey" /><datalist id="rewriter-brands">{brands.map((b) => <option key={b} value={b} />)}</datalist></label>
          <Button variant="primary" disabled={!aiEnabled || pending || !original.trim()} onClick={rewrite}>{pending && !written ? "Writing…" : "Write it in our voice"}</Button>
          {!aiEnabled && <p className="text-[12.5px] text-[var(--ink-soft)]">Needs a reading key (Settings).</p>}
        </div>
      </div>
      {note && <p className="text-[13px] text-[var(--danger)]">{note}</p>}
      {written && (
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm"><span className="mb-1.5 block text-[13.5px] font-semibold text-[var(--ink-2)]">Snaben&rsquo;s version, yours to edit</span><textarea className={cx(INPUT, "min-h-[200px]")} value={edited} onChange={(e) => setEdited(e.target.value)} /></label>
          <div className="text-sm">
            <span className="mb-1.5 block text-[13.5px] font-semibold text-[var(--ink-2)]">What you changed</span>
            <p className="min-h-[200px] rounded-[12px] border border-[var(--line)] bg-white p-3 text-[14px] leading-relaxed">
              {wordDiff(written, edited).map((part, i) => part.kind === "same" ? <span key={i}>{part.text} </span> : part.kind === "removed" ? <del key={i} className="rounded bg-[var(--detractor-tint)] px-0.5 text-[#8f2318]">{part.text} </del> : <ins key={i} className="rounded bg-[var(--promoter-tint)] px-0.5 no-underline text-[#0b5e43]">{part.text} </ins>)}
            </p>
            {swaps.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {swaps.map((s) => (
                  <li key={`${s.from}→${s.to}`} className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-[var(--line)] bg-white px-3 py-2 text-[13.5px]">
                    <span>You say <strong>{s.to}</strong>, not <em>{s.from}</em>{brand ? ` (for ${brand})` : ""}.</span>
                    <Button size="sm" variant="primary" disabled={pending} onClick={() => keep(s.from, s.to)}>Always</Button>
                  </li>
                ))}
              </ul>
            )}
            {kept.length > 0 && <p className="mt-2 text-[12.5px] text-[var(--promoter)]">Kept: {kept.join(", ")}.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
