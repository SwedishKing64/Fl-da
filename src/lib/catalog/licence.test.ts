import { afterEach, describe, expect, it } from "vitest";
import { CHECK_EVERY_MS, GRACE_MS, describeReachFailure, isServerUrl, licenceFromAnswer, licenceServer, licenceServers, licenceState, newLicenceKey, normaliseKey, reachVendor, verdictFor, type Licence } from "./licence";

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

  it("checks nothing on an open copy, whatever vendor the build named", () => {
    process.env.FLODA_LICENCE_SERVER = "https://floda.example";
    process.env.FLODA_OPEN = "1";
    try {
      expect(licenceServer()).toBe("");
      expect(licenceServers("https://typed.example")).toEqual([]);
      expect(licenceState(null, now)).toEqual({ kind: "unlicensed" });
    } finally {
      delete process.env.FLODA_OPEN;
    }
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

describe("reaching the vendor", () => {
  it("lists the addresses to try: the person's, the built-in one, then the fallbacks, once each", () => {
    process.env.FLODA_LICENCE_SERVER = "https://floda.ai/";
    expect(licenceServers()).toEqual(["https://floda.ai", "https://fl-da.vercel.app"]);
    expect(licenceServers("https://fl-da.vercel.app")).toEqual(["https://fl-da.vercel.app", "https://floda.ai"]);
    expect(licenceServers("http://localhost:3101/")).toEqual(["http://localhost:3101", "https://floda.ai", "https://fl-da.vercel.app"]);
    process.env.FLODA_LICENCE_SERVER = "https://fl-da.vercel.app";
    expect(licenceServers()).toEqual(["https://fl-da.vercel.app", "https://floda.ai"]);
    process.env.FLODA_LICENCE_SERVER = "";
    expect(licenceServers("https://x.test")).toEqual([]);
  });
  it("knows an address it could ask from one it could not", () => {
    expect(isServerUrl("https://floda.ai")).toBe(true);
    expect(isServerUrl("http://localhost:3101")).toBe(true);
    expect(isServerUrl("http://floda.ai")).toBe(false);
    expect(isServerUrl("https://floda.ai/api/licence")).toBe(false);
    expect(isServerUrl("floda")).toBe(false);
  });
  it("says why an address could not be reached", () => {
    const notFound = Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } });
    expect(describeReachFailure("https://floda.ai", notFound)).toBe("floda.ai: the address does not exist — no DNS record answers for it");
    const refused = Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
    expect(describeReachFailure("http://localhost:3101", refused)).toBe("localhost:3101: nothing is answering there");
    const slow = Object.assign(new Error("The operation was aborted"), { name: "TimeoutError" });
    expect(describeReachFailure("https://floda.ai", slow)).toContain("did not answer within 15 seconds");
  });
  it("passes over an address that cannot be reached, remembers the one that answered, and says why when none can", async () => {
    const notFound = Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } });
    const asked: string[] = [];
    const call = async (server: string) => { asked.push(server); if (server === "https://floda.ai") throw notFound; return `from ${server}`; };
    await expect(reachVendor(["https://floda.ai", "https://fl-da.vercel.app"], call)).resolves.toBe("from https://fl-da.vercel.app");
    asked.length = 0;
    await reachVendor(["https://floda.ai", "https://fl-da.vercel.app"], call);
    expect(asked[0]).toBe("https://fl-da.vercel.app");
    await expect(reachVendor(["https://floda.ai"], async () => { throw notFound; })).rejects.toThrow(/floda.ai: the address does not exist.*Settings → Licence/);
    // The vendor's own refusal is not a reach failure and is not passed over.
    await expect(reachVendor(["https://floda.ai", "https://fl-da.vercel.app"], async () => { throw new Error("Flöda answered 403 without a verdict"); })).rejects.toThrow("403");
  });
});
