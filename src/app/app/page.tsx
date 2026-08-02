import { analyzeItems, usingClaude } from "@/lib/analyze-server";
import { insightsFrom } from "@/lib/insights";
import { FEEDBACK } from "@/mocks/feedback";
import DashboardClient from "./DashboardClient";

// Analysis runs server-side (Claude when ANTHROPIC_API_KEY is set, deterministic
// otherwise), so the API key never reaches the browser. Force dynamic so a keyed
// deploy analyzes per request rather than baking a build-time result.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const analysed = await analyzeItems(FEEDBACK);
  const insights = insightsFrom(analysed);
  return <DashboardClient analysed={analysed} insights={insights} live={usingClaude()} />;
}
