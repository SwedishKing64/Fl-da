import Link from "next/link";
import { cx } from "@/app/(catalog)/ui";

/**
 * Three steps, not four.
 *
 * Mapping columns used to sit between upload and review. It is gone as a step: the suggestion is
 * applied automatically as soon as a file is read, and where it gets a column wrong the place to
 * fix it is the review grid. The mapping screen still exists at /map for the rare layout nothing
 * can be made of, reached from the upload page when it is actually needed.
 *
 * A step you have been through is ticked and stays clickable; the one you are on is filled; the
 * ones ahead are dimmed because there is genuinely nothing there yet. Which is which is decided by
 * the batch's status rather than by where you happen to have navigated, so it is honest about how
 * far the work has actually got.
 */
const STEPS = [
  { key: "upload", label: "Upload", path: "" },
  { key: "review", label: "Review & price", path: "/review" },
  { key: "export", label: "Export", path: "/export" },
];

const BUILT = ["REVIEW", "EXPORTED", "PUSHED", "ROLLED_BACK"];
const DONE = ["EXPORTED", "PUSHED"];

export function Steps({ batchId, current, status }: { batchId: string; current: string; status: string }) {
  const unlocked: Record<string, boolean> = { upload: true, review: BUILT.includes(status), export: BUILT.includes(status) };
  const passed: Record<string, boolean> = {
    upload: BUILT.includes(status),
    review: DONE.includes(status),
    export: DONE.includes(status) && current !== "export",
  };
  return (
    <nav className="steps mb-5" aria-label="Where this batch is up to">
      {STEPS.map((s, i) => {
        const active = s.key === current;
        const cls = cx("step", active ? "on" : passed[s.key] ? "done" : unlocked[s.key] ? "done" : "");
        const inner = <><span className="n">{passed[s.key] && !active ? "✓" : i + 1}</span>{s.label}</>;
        return (
          <span key={s.key} className="contents">
            {i > 0 && <span className="step-sep" aria-hidden>→</span>}
            {unlocked[s.key] && !active
              ? <Link href={`/batches/${batchId}${s.path}`} className={cls}>{inner}</Link>
              : <span className={cls} aria-current={active ? "step" : undefined}>{inner}</span>}
          </span>
        );
      })}
      {current === "map" && <><span className="step-sep" aria-hidden>→</span><span className="step on"><span className="n">↳</span>Column mapping</span></>}
    </nav>
  );
}
