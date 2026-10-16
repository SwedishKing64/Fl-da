import { redirect } from "next/navigation";
import { getCurrentUser, usersExist } from "@/lib/catalog/auth";
import { apiKeySource, keyTail } from "@/lib/catalog/anthropic";
import { ensureConventions, getHouseConventions, getLearnedVocabulary, getShopProfile, getStoredApiKey } from "@/lib/catalog/shop-profile";
import { productTypes } from "@/lib/catalog/taxonomy";
import { houseTagRules } from "@/app/(catalog)/actions";
import { AccountStep } from "./AccountStep";
import { ShopStep } from "./ShopStep";
import { LearnStep } from "./LearnStep";
import { AiStep } from "./AiStep";
import { HouseStep } from "./HouseStep";
import { DoneStep } from "./DoneStep";
import { SuppliersStep } from "./SuppliersStep";
import { TrialStep } from "./TrialStep";
import { licenceServer } from "@/lib/catalog/licence";
import { openMode } from "@/lib/catalog/open";
import { currentLicence, getServerOverride, servers } from "@/lib/catalog/licence-store";
import { prisma } from "@/lib/catalog/db";
import { CANONICAL_FIELDS } from "@/lib/catalog/types";
import { Stepper, type SetupStep } from "./Stepper";

export const dynamic = "force-dynamic";
/** Teaching from a large export is several requests; each takes the page's limit. */
export const maxDuration = 300;

/**
 * Setup, as a walk-through: the admin account, then the shop, then its catalogue, then the key
 * that reads documents. Each step after the first can be come back to from Home or Settings, so
 * the page takes `?step=` and shows that step to a signed-in admin.
 */
export default async function SetupPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  // An open copy has no account step: its owner is signed in by /open, made there the first time.
  if (openMode() && !(await getCurrentUser())) redirect("/open?next=/setup");
  if (!(await usersExist())) {
    return <><Stepper current="account" /><AccountStep /></>;
  }
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/setup");
  if (user.role !== "ADMIN") redirect("/");
  await ensureConventions();

  const { step: asked } = await searchParams;
  const [profile, learned, storedKey, house, tagRules, templates, batches] = await Promise.all([getShopProfile(), getLearnedVocabulary(), getStoredApiKey(), getHouseConventions(), houseTagRules(), prisma.mappingTemplate.count(), prisma.importBatch.count()]);
  // A copy that checks a licence picks its plan before anything else; the vendor and development do not.
  const needsPlan = Boolean(licenceServer()) && (await currentLicence()).kind === "none";
  const wanted = (["plan", "shop", "learn", "house", "ai", "suppliers", "done"] as const).find((s) => s === asked && (s !== "plan" || licenceServer()));
  const suppliersDone = templates > 0 || batches > 0 || Boolean(profile.skipped.suppliers);
  const step: SetupStep = wanted ?? (needsPlan ? "plan" : !profile.name ? "shop" : !learned && !profile.skipped.learn ? "learn" : !house.savedAt && !profile.skipped.house ? "house" : apiKeySource() === "none" && !profile.skipped.ai ? "ai" : !suppliersDone ? "suppliers" : "done");

  return (
    <>
      <Stepper current={step} hidePlan={!licenceServer()} />
      {step === "plan" && <TrialStep email={user.email} next="/setup?step=shop" servers={await servers()} override={await getServerOverride()} />}
      {step === "shop" && <ShopStep profile={profile} />}
      {step === "learn" && <LearnStep learned={learned} kinds={house.kinds} />}
      {step === "house" && <HouseStep house={house} tagRules={tagRules} kinds={productTypes()} />}
      {step === "ai" && <AiStep source={apiKeySource()} tail={keyTail(storedKey)} />}
      {step === "suppliers" && <SuppliersStep fields={CANONICAL_FIELDS.map((f) => ({ key: f.key, label: f.label, required: Boolean(f.required) }))} templates={templates} next="/setup?step=done" />}
      {step === "done" && <DoneStep shopName={profile.name} learned={Boolean(learned)} aiReady={apiKeySource() !== "none"} skipped={profile.skipped} />}
    </>
  );
}
