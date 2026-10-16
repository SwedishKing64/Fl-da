"use client";

import { useState, useTransition } from "react";
import { billingLinkAction } from "@/app/(catalog)/actions";
import { Alert, Button } from "@/app/(catalog)/ui";
import { PLANS, per, planOf, type PlanId } from "@/lib/catalog/plans";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/catalog/support";

/**
 * Paying for a plan from inside the copy. Each plan is a button that asks the vendor for a
 * Stripe checkout page and opens it in the browser; a copy that has paid gets a button for the
 * billing page instead, where the card, the plan and cancelling live. When the vendor has no
 * Stripe set up it says so, and the fallback is a person.
 */
export function BillingButtons({ mode, current, clientName, licenceKey }: { mode: "subscribe" | "manage"; current?: string; clientName?: string; licenceKey?: string }) {
  const [note, setNote] = useState<{ tone: "info" | "danger" | "success"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string>("");

  const open = (what: "checkout" | "portal", plan?: PlanId) =>
    start(async () => {
      setBusy(plan ?? what);
      setNote(null);
      const r = await billingLinkAction(what, plan);
      setBusy("");
      if (!r.ok || !r.data) return setNote({ tone: "danger", text: r.ok ? "No link came back." : r.error });
      window.open(r.data.url, "_blank", "noopener");
      setNote({ tone: "success", text: what === "checkout" ? "The payment page is open in your browser. When it says paid, come back here and press “Check the key”; the plan is on within a minute." : "The billing page is open in your browser. Changes show here the next time the key is checked." });
    });

  const mailto = `${SUPPORT_MAILTO}?subject=${encodeURIComponent(`Flöda plan${clientName ? ` for ${clientName}` : ""}`)}&body=${encodeURIComponent(`Hi Flöda,\n\nWe'd like to go on the ${planOf(current).name} plan.${licenceKey ? ` Our licence key is ${licenceKey}.` : ""}\n\nThanks`)}`;

  if (mode === "manage") {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" disabled={pending} onClick={() => open("portal")}>{busy === "portal" ? "Opening…" : "Card, plan and invoices"}</Button>
          <span className="text-[12.5px] text-[var(--ink-soft)]">Opens Stripe’s billing page in your browser: change the card or the plan, download invoices, or cancel.</span>
        </div>
        {note && <Alert tone={note.tone}>{note.text}</Alert>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {PLANS.map((p) => (
          <Button key={p.id} variant={p.id === current ? "primary" : "secondary"} disabled={pending} onClick={() => open("checkout", p.id)}>
            {busy === p.id ? "Opening…" : `Pay for ${p.name} · $${p.price} ${per(p)}`}
          </Button>
        ))}
      </div>
      <p className="text-[12.5px] text-[var(--ink-soft)]">Paid on Stripe in advance (Own key monthly, the rest every two weeks), cancel any time; the period you paid for runs out before anything stops. Would rather talk to a person? Write to <a className="underline" href={mailto}>{SUPPORT_EMAIL}</a>.</p>
      {note && <Alert tone={note.tone}>{note.text}</Alert>}
    </div>
  );
}
