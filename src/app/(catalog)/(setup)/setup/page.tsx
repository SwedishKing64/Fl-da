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
  if (!(await usersExist())) {
    return <><Stepper current="account" /><AccountStep /></>;
  }
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/setup");
  if (user.role !== "ADMIN") redirect("/");
  await ensureConventions();

  const { step: asked } = await searchParams;
  const [profile, learned, storedKey, house, tagRules] = await Promise.all([getShopProfile(), getLearnedVocabulary(), getStoredApiKey(), getHouseConventions(), houseTagRules()]);
  const wanted = (["shop", "learn", "house", "ai", "done"] as const).find((s) => s === asked);
  const step: SetupStep = wanted ?? (!profile.name ? "shop" : !learned && !profile.skipped.learn ? "learn" : !house.savedAt && !profile.skipped.house ? "house" : apiKeySource() === "none" && !profile.skipped.ai ? "ai" : "done");

  return (
    <>
      <Stepper current={step} hidePlan={!licenceServer()} />
      {step === "plan" && <TrialStep email={user.email} next="/setup?step=shop" />}
      {step === "shop" && <ShopStep profile={profile} />}
      {step === "learn" && <LearnStep learned={learned} />}
      {step === "house" && <HouseStep house={house} tagRules={tagRules} kinds={productTypes()} />}
      {step === "ai" && <AiStep source={apiKeySource()} tail={keyTail(storedKey)} />}
      {step === "done" && <DoneStep shopName={profile.name} learned={Boolean(learned)} aiReady={apiKeySource() !== "none"} skipped={profile.skipped} />}
    </>
  );
}
