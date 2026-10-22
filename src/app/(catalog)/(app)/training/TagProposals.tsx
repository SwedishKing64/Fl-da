"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decideTagProposalAction } from "@/app/(catalog)/actions";
import { Badge, Button, cx } from "@/app/(catalog)/ui";

export interface TagProposal {
  id: string;
  tag: string;
  status: string;
  count: number;
  example: string;
}

/**
 * The tags a build wanted to write that the shop has never used. Each is put forward once, with
 * the product it was meant for and how many products have asked for it since. Approved, it joins
 * the shop's vocabulary and the next build may write it; rejected, it is never proposed again.
 */
export function TagProposals({ proposals }: { proposals: TagProposal[] }) {
  const pending = proposals.filter((p) => p.status === "PENDING");
  const decided = proposals.filter((p) => p.status !== "PENDING");
  const [showDecided, setShowDecided] = useState(false);
  return (
    <div className="space-y-3">
      <p className="text-[14px] text-[var(--ink-soft)]">
        A build only writes tags your shop already uses: the ones on your listings, the ones your rules add, the ones your kinds of product carry. A tag it wanted that none of those know is listed here instead, with the product it was meant for. Approve it and it is one of yours from now on; reject it and it is never put forward again.
      </p>
      {pending.length === 0 ? (
        <p className="text-[13px] text-[var(--ink-soft)]">Nothing waiting. Every tag on the latest build is one your shop uses.</p>
      ) : (
        <ul className="divide-y divide-[var(--line-soft)] rounded-[12px] border border-[var(--line)] bg-white">
          {pending.map((p) => <ProposalRow key={p.id} proposal={p} />)}
        </ul>
      )}
      {decided.length > 0 && (
        <div>
          <button type="button" className="text-[13px] font-semibold text-[var(--meta)]" onClick={() => setShowDecided((s) => !s)} aria-expanded={showDecided}>
            {showDecided ? "Hide" : "Show"} {decided.length} decided {decided.length === 1 ? "tag" : "tags"} {showDecided ? "▾" : "▸"}
          </button>
          {showDecided && (
            <ul className="mt-2 flex flex-wrap gap-2">
              {decided.map((p) => (
                <li key={p.id} className={cx("inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] px-2.5 py-0.5 text-[12.5px]", p.status === "REJECTED" && "line-through opacity-60")}>
                  {p.tag}
                  <Badge tone={p.status === "APPROVED" ? "success" : "neutral"}>{p.status === "APPROVED" ? "yours" : "no"}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ProposalRow({ proposal }: { proposal: TagProposal }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [note, setNote] = useState("");
  const decide = (approve: boolean) =>
    start(async () => {
      setNote("");
      const r = await decideTagProposalAction(proposal.id, approve);
      if (!r.ok) setNote(r.error ?? "That did not work.");
      router.refresh();
    });
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
      <div className="min-w-0 flex-1 text-[14px]">
        <span className="font-semibold">{proposal.tag}</span>
        <span className="ml-2 text-[12.5px] text-[var(--ink-soft)]">
          wanted on {proposal.count} product{proposal.count === 1 ? "" : "s"}{proposal.example ? `, first for ${proposal.example}` : ""}
        </span>
        {note && <div className="mt-1 text-[12.5px] text-[var(--danger)]">{note}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button size="sm" variant="primary" disabled={busy} onClick={() => decide(true)}>Approve</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => decide(false)}>Reject</Button>
      </div>
    </li>
  );
}
