import { getSettings } from "@/lib/catalog/settings";
import { requireUser } from "@/lib/catalog/auth";
import { Card, PageHeader } from "@/app/(catalog)/ui";
import { PriceCalculator } from "./PriceCalculator";
import { MarginBand } from "./MarginBand";

export default async function PricingPage() {
  await requireUser();
  const settings = await getSettings();
  return (
    <>
      <PageHeader title="Pricing" subtitle="Work out what a product should sell for. Drag the margin, or type a price and see the margin it gives you." />
      <Card title="Price calculator">
        <PriceCalculator settings={{ gstRate: settings.gstRate, pricesIncludeGst: settings.pricesIncludeGst, minMarginPct: settings.minMarginPct, fxRates: settings.fxRates }} />
      </Card>
      <Card title="The margin a price can have" className="mt-6">
        <MarginBand minMarginPct={settings.minMarginPct} maxMarginPct={settings.maxMarginPct} />
      </Card>
    </>
  );
}
