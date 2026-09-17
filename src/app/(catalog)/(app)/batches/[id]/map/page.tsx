import { notFound } from "next/navigation";
import { prisma } from "@/lib/catalog/db";
import { mappingState } from "@/lib/catalog/pipeline";
import { Alert, LinkButton, PageHeader } from "@/app/(catalog)/ui";
import { CANONICAL_FIELDS } from "@/lib/catalog/types";
import { Steps } from "../Steps";
import { MappingEditor } from "./MappingEditor";

export default async function MapPage(props: PageProps<"/batches/[id]/map">) {
  const { id } = await props.params;
  const batch = await prisma.importBatch.findUnique({ where: { id }, include: { supplier: true, _count: { select: { products: true } } } });
  if (!batch) notFound();
  const groups = await mappingState(id);
  const locked = ["EXPORTED", "PUSHED"].includes(batch.status);
  return (
    <>
      <PageHeader title={batch.name} subtitle="Columns are matched automatically when a file is read. This is here for a layout that came out wrong — what you set is saved for this supplier and reused next time." actions={<LinkButton href={`/batches/${id}`}>← Files</LinkButton>} />
      <Steps batchId={id} current="map" status={batch.status} />
      {locked && <Alert tone="warning" className="mb-4">This batch has been exported. Re-mapping would rebuild its products, so it is locked.</Alert>}
      {groups.length === 0 ? (
        <Alert tone="warning">No extracted rows yet. Upload a file that extracted successfully first.</Alert>
      ) : (
        <MappingEditor batchId={id} groups={groups} fields={CANONICAL_FIELDS.map((f) => ({ key: f.key, label: f.label, required: Boolean(f.required) }))} supplierName={batch.supplier?.name ?? null} hasProducts={batch._count.products > 0} disabled={locked} />
      )}
    </>
  );
}
