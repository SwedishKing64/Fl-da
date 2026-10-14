export type SetupStep = "account" | "shop" | "learn" | "ai" | "done";

export const STEPS: Array<{ key: SetupStep; label: string }> = [
  { key: "account", label: "Your account" },
  { key: "shop", label: "Your shop" },
  { key: "learn", label: "Your catalogue" },
  { key: "ai", label: "Reading documents" },
  { key: "done", label: "Ready" },
];

/** Where you are in setup, as a row of numbered steps. */
export function Stepper({ current }: { current: SetupStep }) {
  const at = STEPS.findIndex((s) => s.key === current);
  return (
    <ol className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]" aria-label="Setup steps">
      {STEPS.map((s, i) => {
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
