import { afterEach, describe, expect, it } from "vitest";
import { CHECK_EVERY_MS, GRACE_MS, licenceFromAnswer, licenceState, newLicenceKey, normaliseKey, verdictFor, type Licence } from "./licence";

const day = 86_400_000;

describe("licence keys", () => {
  it("are four groups of four readable characters", () => {
    const key = newLicenceKey();
    expect(key).toMatch(/^FL-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(newLicenceKey()).not.toBe(key);
  });

  it("are read however they were typed", () => {
    expect(normaliseKey(" fl-abcd-efgh-jklm-npqr ")).toBe("FL-ABCD-EFGH-JKLM-NPQR");
    expect(normaliseKey("ABCDEFGHJKLMNPQR")).toBe("FL-ABCD-EFGH-JKLM-NPQR");
    expect(normaliseKey("FL-ABCD-EFGH-JKLM-NPQ")).toBeUndefined(); // too short
    expect(normaliseKey("FL-ABCD-EFGH-JKLM-NPQ0")).toBeUndefined(); // a zero is never issued
  });
});

describe("what a client record allows", () => {
  const now = new Date("2026-10-14T00:00:00Z");
  it("lets an active client run, and says how long a dated one has", () => {
    expect(verdictFor({ status: "ACTIVE", expiresAt: null }, now)).toEqual({ ok: true, status: "ACTIVE", expiresAt: null, daysLeft: null });
    const v = verdictFor({ status: "TRIAL", expiresAt: new Date(now.getTime() + 10 * day) }, now);
    expect(v.ok && v.daysLeft).toBe(10);
  });
  it("refuses a key that is not ours, a paused one, an ended one and a lapsed trial", () => {
    expect(verdictFor(null, now)).toMatchObject({ ok: false, status: "UNKNOWN" });
    expect(verdictFor({ status: "PAUSED", expiresAt: null }, now)).toMatchObject({ ok: false, why: "This licence is paused." });
    expect(verdictFor({ status: "ENDED", expiresAt: null }, now)).toMatchObject({ ok: false, why: "This licence has ended." });
    expect(verdictFor({ status: "TRIAL", expiresAt: new Date(now.getTime() - day) }, now)).toMatchObject({ ok: false, why: "The trial has ended." });
  });
});

describe("how an installed copy stands", () => {
  const now = new Date("2026-10-14T00:00:00Z");
  const good: Licence = { key: "FL-AAAA-BBBB-CCCC-DDDD", client: "Northside Bikes", plan: "founding", status: "ACTIVE", expiresAt: null, checkedAt: now.toISOString() };
  const server = process.env.FLODA_LICENCE_SERVER;
  afterEach(() => { if (server === undefined) delete process.env.FLODA_LICENCE_SERVER; else process.env.FLODA_LICENCE_SERVER = server; });

  it("has nothing to check when no vendor is configured", () => {
    delete process.env.FLODA_LICENCE_SERVER;
    expect(licenceState(good, now)).toEqual({ kind: "unlicensed" });
  });

  it("runs on a fresh answer, and still runs on a stale one inside the grace month", () => {
    process.env.FLODA_LICENCE_SERVER = "https://floda.example";
    expect(licenceState(null, now)).toEqual({ kind: "none" });
    expect(licenceState(good, now)).toMatchObject({ kind: "ok", stale: false });
    const later = new Date(now.getTime() + CHECK_EVERY_MS + 1000);
    expect(licenceState(good, later)).toMatchObject({ kind: "ok", stale: true });
    const much = new Date(now.getTime() + GRACE_MS + 1000);
    expect(licenceState(good, much)).toMatchObject({ kind: "lapsed" });
  });

  it("lapses on what the vendor last said", () => {
    process.env.FLODA_LICENCE_SERVER = "https://floda.example";
    const paused = licenceFromAnswer(good.key, { ok: false, status: "PAUSED", why: "This licence is paused." }, good, now);
    expect(paused.client).toBe("Northside Bikes"); // kept from before, so the banner can name it
    expect(licenceState(paused, now)).toMatchObject({ kind: "lapsed", why: "This licence is paused." });
    const back = licenceFromAnswer(good.key, { ok: true, client: "Northside Bikes", plan: "founding", status: "ACTIVE", expiresAt: null }, paused, now);
    expect(licenceState(back, now)).toMatchObject({ kind: "ok" });
  });
});
