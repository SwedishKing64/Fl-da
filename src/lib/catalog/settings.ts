import { prisma, parseJson } from "./db";
import { cleanChecks } from "./checks";
import { DEFAULT_SETTINGS, type AppSettings } from "./types";

const KEY = "app";

export async function getSettings(): Promise<AppSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  const stored = parseJson<Partial<AppSettings>>(row?.value, {});
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    fxRates: { ...DEFAULT_SETTINGS.fxRates, ...(stored.fxRates ?? {}) },
    shopify: { ...DEFAULT_SETTINGS.shopify, ...(stored.shopify ?? {}) },
    locations: stored.locations ?? [],
    packages: { ...DEFAULT_SETTINGS.packages, ...(stored.packages ?? {}) },
    checks: cleanChecks(stored.checks),
  };
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const next: AppSettings = {
    ...current,
    ...patch,
    fxRates: { ...current.fxRates, ...(patch.fxRates ?? {}) },
    shopify: { ...current.shopify, ...(patch.shopify ?? {}) },
    packages: { ...current.packages, ...(patch.packages ?? {}) },
    // The checks are saved whole, so a rules file or an undo can take one back to its default.
    checks: patch.checks ? cleanChecks(patch.checks) : current.checks,
  };
  await prisma.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  });
  return next;
}
