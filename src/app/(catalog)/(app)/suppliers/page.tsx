import { prisma, parseJson } from "@/lib/catalog/db";
import { Card, Empty, PageHeader, fmtDate } from "@/app/(catalog)/ui";
import { SupplierForm, DeleteSupplierButton, DeleteTemplateButton } from "./SupplierForms";

export default async function SuppliersPage() {
  const suppliers = await prisma.supplier.findMany({ orderBy: { name: "asc" }, include: { templates: true, _count: { select: { batches: true } } } });
  return (
    <>
      <PageHeader title="Suppliers" subtitle="Each supplier keeps its currency, GST treatment and default brand, plus a remembered column layout so its spreadsheets are read automatically next time." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {suppliers.length === 0 && <Empty>No suppliers yet. Add one here or when creating a batch.</Empty>}
          {suppliers.map((s) => (
            <Card key={s.id} title={<span>{s.name} <span className="font-normal text-[var(--ink-soft)]">· {s.defaultCurrency} · cost {s.defaultGstTreatment.toLowerCase()} GST · {s._count.batches} batches</span></span>} actions={<DeleteSupplierButton id={s.id} />}>
              <details className="mb-3"><summary className="cursor-pointer text-xs text-[var(--violet)]">Edit supplier</summary><div className="mt-3"><SupplierForm supplier={{ id: s.id, name: s.name, defaultCurrency: s.defaultCurrency, defaultGstTreatment: s.defaultGstTreatment, defaultBrand: s.defaultBrand ?? "", notes: s.notes ?? "" }} /></div></details>
              {s.templates.length === 0 ? <p className="text-sm text-[var(--ink-soft)]">No saved templates yet — one is saved the first time a file from this supplier is mapped.</p> : (
                <ul className="divide-y divide-[var(--line-soft)] text-sm">
                  {s.templates.map((t) => {
                    const m = parseJson<Record<string, string>>(t.mappings, {});
                    const mapped = Object.entries(m).filter(([, v]) => v);
                    return (
                      <li key={t.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                        <div><div className="font-medium">{t.name}</div><div className="text-xs text-[var(--ink-soft)]">{mapped.map(([k, v]) => `${k} → ${v}`).join(", ")}</div><div className="text-xs text-[var(--ink-soft)]">Updated {fmtDate(t.updatedAt)}</div></div>
                        <DeleteTemplateButton id={t.id} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          ))}
        </div>
        <Card title="Add supplier"><SupplierForm /></Card>
      </div>
    </>
  );
}
