import { prisma, parseJson } from "@/lib/catalog/db";
import { Card, Empty, PageHeader, fmtDate } from "@/app/catalog/ui";
import { LibraryForm, DeleteEntryButton } from "./LibraryForms";

export default async function ImagesPage(props: PageProps<"/catalog/images">) {
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const entries = await prisma.imageLibraryEntry.findMany({ where: q ? { OR: [{ brand: { contains: q.toLowerCase() } }, { modelCode: { contains: q.toLowerCase() } }] } : undefined, orderBy: { updatedAt: "desc" }, take: 200 });
  return (
    <>
      <PageHeader title="Image library" subtitle="Brand + model code → image URLs. Grows automatically every time a batch is exported, so next season's colourways reuse the same photos." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" title={<form className="flex items-center gap-2"><input name="q" defaultValue={q} placeholder="Search brand or model code" className="rounded-lg border border-[var(--line)] px-2 py-1 text-sm font-normal" /><button className="text-xs text-[var(--violet)]">Search</button></form>}>
          {entries.length === 0 ? <Empty>No library entries yet.</Empty> : (
            <ul className="divide-y divide-[var(--line-soft)]">
              {entries.map((e) => {
                const urls = parseJson<string[]>(e.urls, []);
                return (
                  <li key={e.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                    <div className="flex gap-1">{urls.slice(0, 3).map((u) => (
                      // eslint-disable-next-line @next/next/no-img-element -- supplier CDN hosts are arbitrary
                      <img key={u} src={u} alt="" className="h-10 w-10 rounded border border-[var(--line)] object-cover" />
                    ))}</div>
                    <div className="min-w-0 flex-1"><div className="font-medium">{e.brand} · {e.modelCode}{e.colour && ` · ${e.colour}`}</div><div className="truncate text-xs text-[var(--ink-soft)]">{urls.length} image{urls.length === 1 ? "" : "s"} · {e.source.toLowerCase()} · {fmtDate(e.updatedAt)}</div></div>
                    <DeleteEntryButton id={e.id} />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card title="Add entry"><LibraryForm /></Card>
      </div>
    </>
  );
}
