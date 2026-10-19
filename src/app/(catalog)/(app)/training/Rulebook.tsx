"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteTagRuleAction, ruleReachAction, setTagRuleActiveAction, type RuleReach } from "@/app/(catalog)/actions";
import { Badge, Button, cx } from "@/app/(catalog)/ui";
import { sourceWord, type RulebookStage, type RuleEntry } from "@/lib/catalog/rulebook";

/**
 * The rulebook on the page: every rule in force, by stage, in plain words. A rule the shop set
 * has an Edit link to its form; a tag rule can be switched off, deleted or tried on the latest
 * batch right here. Flöda's own rules are listed so the shop knows them, and marked as its.
 */
export function Rulebook({ stages, counts }: { stages: RulebookStage[]; counts: { shop: number; floda: number } }) {
  const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(stages.map((s) => [s.key, true])));
  return (
    <div className="space-y-4">
      <p className="text-[14px] text-[var(--ink-soft)]">
        Everything Flöda does to a listing, in the order it does it. <strong>{counts.shop}</strong> of these rules are yours and <strong>{counts.floda}</strong>{" "}are Flöda&rsquo;s own. Change any of yours from its Edit link; switch a tag rule off, delete it, or try it on the latest batch to see what it would touch.
      </p>
      {stages.map((s) => (
        <section key={s.key} className="rounded-[12px] border border-[var(--line)] bg-white">
          <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" onClick={() => setOpen((o) => ({ ...o, [s.key]: !o[s.key] }))} aria-expanded={open[s.key]}>
            <span>
              <span className="block text-[15px] font-semibold">{s.title}</span>
              <span className="block text-[13px] text-[var(--ink-soft)]">{s.blurb}</span>
            </span>
            <span className="shrink-0 text-[12px] text-[var(--ink-soft)]">{s.rules.length} rule{s.rules.length === 1 ? "" : "s"} {open[s.key] ? "▾" : "▸"}</span>
          </button>
          {open[s.key] && (
            <ol className="divide-y divide-[var(--line-soft)] border-t border-[var(--line-soft)]">
              {s.rules.map((r) => <RuleRow key={r.id} rule={r} />)}
              {s.rules.length === 0 && <li className="px-4 py-3 text-[13px] text-[var(--ink-soft)]">Nothing set for this stage yet.</li>}
            </ol>
          )}
        </section>
      ))}
    </div>
  );
}

function RuleRow({ rule }: { rule: RuleEntry }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reach, setReach] = useState<RuleReach | null>(null);
  const [note, setNote] = useState("");
  const own = rule.source !== "floda";
  const tagRule = Boolean(rule.tagRuleId);
  const off = rule.active === false;

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setNote("");
      const r = await fn();
      if (!r.ok) setNote(r.error ?? "That did not work.");
      router.refresh();
    });

  return (
    <li className={cx("flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-2.5", off && "opacity-60")}>
      <div className="min-w-0 flex-1 text-[14px] leading-relaxed">
        <span className={cx(off && "line-through")}>{rule.sentence}</span>
        {reach && (
          <div className="mt-1 text-[12.5px] text-[var(--ink-soft)]">
            On <strong>{reach.batch}</strong>: touches {reach.matched} of {reach.of} product{reach.of === 1 ? "" : "s"}{reach.examples.length ? `: ${reach.examples.join("; ")}${reach.matched > reach.examples.length ? "; …" : ""}` : "."}
          </div>
        )}
        {note && <div className="mt-1 text-[12.5px] text-[var(--danger)]">{note}</div>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Badge tone={own ? "info" : "neutral"}>{sourceWord(rule.source)}</Badge>
        {tagRule && (
          <>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => { setNote(""); const r = await ruleReachAction(rule.tagRuleId!); if (r.ok && r.data) setReach(r.data); else if (!r.ok) setNote(r.error); })}>Try it</Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => setTagRuleActiveAction(rule.tagRuleId!, off))}>{off ? "Switch on" : "Switch off"}</Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => { if (confirm("Delete this rule? A rule from a kind of product or from How you list comes back the next time that form is kept.")) act(() => deleteTagRuleAction(rule.tagRuleId!)); }}>Delete</Button>
          </>
        )}
        {own && rule.editHref && <Link href={rule.editHref} className="text-[13px] font-semibold text-[var(--meta)]">Edit →</Link>}
      </div>
    </li>
  );
}
