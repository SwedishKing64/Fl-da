export type SetupStep = "account" | "plan" | "shop" | "learn" | "house" | "ai" | "suppliers" | "done";

export const STEPS: Array<{ key: SetupStep; label: string }> = [
  { key: "account", label: "Your account" },
  { key: "plan", label: "Your plan" },
  { key: "shop", label: "Your shop" },
  { key: "learn", label: "Your catalogue" },
  { key: "house", label: "How you list" },
  { key: "ai", label: "Reading documents" },
  { key: "suppliers", label: "Your suppliers" },
  { key: "done", label: "Ready" },
];

/**
 * Where you are in setup, as a row of numbered steps. It sits on its own white panel: the page
 * is pulled up over the header's wave, the way the sign-in card is, and the steps were being
 * drawn across the graphic.
 */
export function Stepper({ current, hidePlan = false }: { current: SetupStep; hidePlan?: boolean }) {
  const steps = hidePlan ? STEPS.filter((s) => s.key !== "plan") : STEPS;
  const at = steps.findIndex((s) => s.key === current);
  return (
    <ol className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-[13px] shadow-[var(--shadow-sm)]" aria-label="Setup steps">
      {steps.map((s, i) => {
        const state = i < at ? "done" : i === at ? "now" : "later";
        return (
          <li key={s.key} className="flex items-center gap-2">
            <span
              className={
                state === "done"
                  ? "grid h-6 w-6 place-items-center rounded-full bg-[var(--meta)] text-[11px] font-bold text-white"
                  : state === "now"
                    ? "grid h-6 w-6 place-items-center rounded-full border-2 border-[var(--meta)] bg-white text-[11px] font-bold text-[var(--meta)]"
                    : "grid h-6 w-6 place-items-center rounded-full border border-[var(--line)] bg-white text-[11px] font-semibold text-[var(--ink-soft)]"
              }
              aria-hidden
            >
              {state === "done" ? "✓" : i + 1}
            </span>
            <span className={state === "now" ? "font-semibold text-[var(--ink)]" : "text-[var(--ink-soft)]"} aria-current={state === "now" ? "step" : undefined}>
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
