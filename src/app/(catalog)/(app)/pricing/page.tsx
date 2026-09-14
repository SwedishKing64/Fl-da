import { getSettings } from "@/lib/catalog/settings";
import { requireUser } from "@/lib/catalog/auth";
import { Card, PageHeader } from "@/app/(catalog)/ui";
import { PricingSettingsForm } from "./PricingEditors";
import { PriceCalculator } from "./PriceCalculator";

export default async function PricingPage() {
  const user = await requireUser();
  const settings = await getSettings();
  const isAdmin = user.role === "ADMIN";
  const shape = { gstRate: settings.gstRate, pricesIncludeGst: settings.pricesIncludeGst, minMarginPct: settings.minMarginPct, fxRates: settings.fxRates };
  return (
    <>
      <PageHeader title="Pricing" subtitle="Work out what a product should sell for. Drag the margin, or type a price and see the margin it gives you." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card title="Price calculator">
          <PriceCalculator settings={shape} />
        </Card>
        <Card title="GST and margins">
          <PricingSettingsForm settings={shape} isAdmin={isAdmin} />
        </Card>
      </div>
    </>
  );
}
