import Link from "next/link";
import { cx } from "@/app/(catalog)/ui";

/**
 * Three steps, not four.
 *
 * Mapping columns used to sit between upload and review. It is gone as a step: the suggestion is
 * applied automatically as soon as a file is read, and where it gets a column wrong the place to
 * fix it is the review grid. The mapping screen still exists at /map for the rare layout nothing
 * can be made of, reached from the upload page when it is actually needed.
 */
const STEPS = [
  { key: "upload", label: "1. Upload", path: "" },
  { key: "review", label: "2. Review & price", path: "/review" },
  { key: "export", label: "3. Export", path: "/export" },
];

const BUILT = ["REVIEW", "EXPORTED", "PUSHED", "ROLLED_BACK"];

export function Steps({ batchId, current, status }: { batchId: string; current: string; status: string }) {
  const unlocked: Record<string, boolean> = { upload: true, map: status !== "UPLOADED", review: BUILT.includes(status), export: BUILT.includes(status) };
  return (
    <nav className="mb-5 flex flex-wrap gap-1 rounded-xl border border-[var(--line)] bg-white p-1 text-sm">
      {STEPS.map((s) => {
        const active = s.key === current;
        const cls = cx("rounded-lg px-3 py-1.5", active ? "bg-[var(--ink)] text-white" : unlocked[s.key] ? "hover:bg-neutral-100" : "text-neutral-400");
        const style = active ? { color: "#fff" } : undefined;
        return unlocked[s.key] ? <Link key={s.key} href={`/batches/${batchId}${s.path}`} className={cls} style={style}>{s.label}</Link> : <span key={s.key} className={cls} style={style}>{s.label}</span>;
      })}
      {current === "map" && <span className="rounded-lg bg-[var(--ink)] px-3 py-1.5" style={{ color: "#fff" }}>Column mapping</span>}
    </nav>
  );
}
