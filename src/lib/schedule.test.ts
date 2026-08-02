import { describe, expect, it } from "vitest";
import { FOLLOWUP_DELAY_DAYS, dispatchDue, dueFollowUps, scheduleFollowUp } from "./schedule";

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

describe("scheduleFollowUp", () => {
  it("queues a follow-up N days after fulfillment", async () => {
    const f = await scheduleFollowUp("store-a.myshopify.com", { id: 101, email: "a@x.com", line_items: [{ title: "Hat" }] }, NOW);
    expect(f).not.toBeNull();
    expect(f!.sendAt).toBe(NOW + FOLLOWUP_DELAY_DAYS * DAY);
    expect(f!.product).toBe("Hat");
    // not due yet, due after the delay
    expect((await dueFollowUps(NOW)).some((x) => x.id === f!.id)).toBe(false);
    expect((await dueFollowUps(NOW + FOLLOWUP_DELAY_DAYS * DAY)).some((x) => x.id === f!.id)).toBe(true);
  });

  it("skips orders with no email", async () => {
    expect(await scheduleFollowUp("store-a.myshopify.com", { id: 102 }, NOW)).toBeNull();
  });

  it("dedupes the same order", async () => {
    await scheduleFollowUp("store-b.myshopify.com", { id: 200, email: "b@x.com" }, NOW);
    expect(await scheduleFollowUp("store-b.myshopify.com", { id: 200, email: "b@x.com" }, NOW)).toBeNull();
  });

  it("dispatchDue marks due follow-ups sent", async () => {
    const sent = await dispatchDue(NOW + 10 * DAY);
    expect(sent).toBeGreaterThan(0);
    expect(await dueFollowUps(NOW + 10 * DAY)).toHaveLength(0); // all sent
  });
});
