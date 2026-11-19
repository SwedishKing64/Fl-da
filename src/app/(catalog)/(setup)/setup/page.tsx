import { redirect } from "next/navigation";
import { getCurrentUser, usersExist } from "@/lib/catalog/auth";
import { apiKeySource, keyTail } from "@/lib/catalog/anthropic";
import { ensureConventions, getCorrections, getHouseConventions, getLearnedVocabulary, getShopProfile, getStoredApiKey, getWebsiteCategories } from "@/lib/catalog/shop-profile";
import { storeState } from "@/lib/catalog/store-sync";
import { oauthApp } from "@/lib/catalog/shopify-oauth";
import { describeLearned } from "@/lib/catalog/learn";
import { FirstStep, FoundStep, MenuStep, StoreStep } from "./TutorialSteps";
import { fieldsInForce, productTypes } from "@/lib/catalog/taxonomy";
import { houseTagRules } from "@/app/(catalog)/actions";
import { AccountStep } from "./AccountStep";
import { ShopStep } from "./ShopStep";
import { LearnStep } from "./LearnStep";
import { AiStep } from "./AiStep";
import { HouseStep } from "./HouseStep";
import { DoneStep } from "./DoneStep";
import { SuppliersStep } from "./SuppliersStep";
import { SignInStep } from "./SignInStep";
import { licenceServer } from "@/lib/catalog/licence";
import { openMode } from "@/lib/catalog/open";
import { currentLicence, getServerOverride, servers } from "@/lib/catalog/licence-store";
import { prisma } from "@/lib/catalog/db";
import { getSettings } from "@/lib/catalog/settings";
import { Stepper, type SetupStep } from "./Stepper";

export const dynamic = "force-dynamic";
/** Teaching from a large export is several requests; each takes the page's limit. */
export const maxDuration = 300;

/**
 * Setup, as a walk-through: the admin account, then the shop, then its catalogue, then the key
 * that reads documents. Each step after the first can be come back to from Home or Settings, so
 * the page takes `?step=` and shows that step to a signed-in admin.
 */
export default async function SetupPage({ searchParams }: { searchParams: Promise<{ step?: string; shopify?: string }> }) {
  // An open copy has no account step: its owner is signed in by /open, made there the first time.
  if (openMode() && !(await getCurrentUser())) redirect("/open?next=/setup");
  if (!(await usersExist())) {
    return <><Stepper current="account" /><AccountStep /></>;
  }
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/setup");
  if (user.role !== "ADMIN") redirect("/");
  await ensureConventions();

  const { step: asked, shopify: outcome } = await searchParams;
  const [profile, learned, storedKey, house, tagRules, templates, batches, settings, website, store] = await Promise.all([
    getShopProfile(), getLearnedVocabulary(), getStoredApiKey(), getHouseConventions(), houseTagRules(), prisma.mappingTemplate.count(), prisma.importBatch.count(), getSettings(), getWebsiteCategories(), storeState(),
  ]);
  // A copy that checks a licence picks its plan before anything else; the vendor and development do not.
  const needsPlan = Boolean(licenceServer()) && (await currentLicence()).kind === "none";
  const wanted = (["plan", "store", "shop", "learn", "house", "menu", "ai", "suppliers", "first", "done"] as const).find((s) => s === asked && (s !== "plan" || licenceServer()));
  const firstDone = templates > 0 || batches > 0 || Boolean(profile.skipped.suppliers) || Boolean(profile.skipped.first);
  const step: SetupStep = wanted ?? (
    needsPlan ? "plan"
    : !store.configured && !profile.skipped.store ? "store"
    : !profile.name ? "shop"
    : !learned && !profile.skipped.learn ? "learn"
    : !house.savedAt && !profile.skipped.house ? "house"
    : !website && !profile.skipped.menu ? "menu"
    : apiKeySource() === "none" && !profile.skipped.ai ? "ai"
    : !firstDone ? "first"
    : "done");
  const connected = store.configured ? { domain: store.domain, by: settings.shopify.connectedBy ?? "token" } : null;
  // What the store showed, as kinds to check: the ones already told, else one per Type it found.
  const kinds = house.kinds.length ? house.kinds : (learned?.types ?? []).slice(0, 40).map((t) => ({ type: t.type, calledAs: t.type, tags: [], titleFormat: "", count: t.count }));

  return (
    <>
      <Stepper current={step} hidePlan={!licenceServer()} />
      {step === "plan" && <SignInStep email={user.email} next="/setup?step=store" site={licenceServer()} servers={await servers()} override={await getServerOverride()} />}
      {step === "store" && <StoreStep connected={connected} canInstall={Boolean(oauthApp())} outcome={outcome} />}
      {step === "shop" && <ShopStep profile={profile} />}
      {step === "learn" && (store.configured ? <FoundStep summary={learned ? describeLearned(learned) : []} kinds={kinds} read={Boolean(learned && store.syncedAt)} /> : <LearnStep learned={learned} kinds={house.kinds} />)}
      {step === "house" && <HouseStep house={house} tagRules={tagRules} kinds={productTypes()} priceEnding={house.savedAt || profile.pack.split("+").includes("snow-outdoor") ? settings.defaultRoundTo : "NONE"} />}
      {step === "menu" && <MenuStep saved={website} />}
      {step === "ai" && <AiStep source={apiKeySource()} tail={keyTail(storedKey)} />}
      {step === "suppliers" && <SuppliersStep fields={fieldsInForce().map((f) => ({ key: f.key, label: f.label, required: Boolean(f.required) }))} templates={templates} next="/setup?step=done" />}
      {step === "first" && <FirstStep />}
      {step === "done" && <DoneStep shopName={profile.name} learned={Boolean(learned)} aiReady={apiKeySource() !== "none"} skipped={profile.skipped} store={store.configured ? store.domain : ""} corrections={(await getCorrections()).length} />}
    </>
  );
}
