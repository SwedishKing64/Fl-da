import Link from "next/link";
import { cx } from "@/app/catalog/ui";

const STEPS = [
  { key: "upload", label: "1. Upload", path: "" },
  { key: "map", label: "2. Map columns", path: "/map" },
  { key: "review", label: "3. Review & price", path: "/review" },
  { key: "export", label: "4. Export", path: "/export" },
];

export function Steps({ batchId, current, status }: { batchId: string; current: string; status: string }) {
  const unlocked = { upload: true, map: status !== "UPLOADED", review: ["REVIEW", "EXPORTED", "PUSHED", "ROLLED_BACK"].includes(status), export: ["REVIEW", "EXPORTED", "PUSHED", "ROLLED_BACK"].includes(status) } as Record<string, boolean>;
  return (
    <nav className="mb-5 flex flex-wrap gap-1 rounded-xl border border-[var(--line)] bg-white p-1 text-sm">
      {STEPS.map((s) => {
        const active = s.key === current;
        const cls = cx("rounded-lg px-3 py-1.5", active ? "bg-[var(--ink)] text-white" : unlocked[s.key] ? "hover:bg-neutral-100" : "text-neutral-400");
        const style = active ? { color: "#fff" } : undefined;
        return unlocked[s.key] ? <Link key={s.key} href={`/catalog/batches/${batchId}${s.path}`} className={cls} style={style}>{s.label}</Link> : <span key={s.key} className={cls} style={style}>{s.label}</span>;
      })}
    </nav>
  );
}
