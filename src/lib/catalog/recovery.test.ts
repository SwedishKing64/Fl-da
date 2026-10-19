import { afterEach, describe, expect, it } from "vitest";
import { recoveryEnabled, recoveryUser } from "./auth";

describe("the recovery sign-in", () => {
  afterEach(() => { delete process.env.RUBIN_RECOVERY_EMAILS; delete process.env.RUBIN_RECOVERY_PASSWORD; });

  it("is off unless both values are set, and the password is long enough", () => {
    expect(recoveryEnabled()).toBe(false);
    process.env.RUBIN_RECOVERY_EMAILS = "contact@example.com";
    process.env.RUBIN_RECOVERY_PASSWORD = "short";
    expect(recoveryEnabled()).toBe(false);
    process.env.RUBIN_RECOVERY_PASSWORD = "long-enough-password";
    expect(recoveryEnabled()).toBe(true);
  });

  it("never lets in an email it does not name, or a wrong password", async () => {
    process.env.RUBIN_RECOVERY_EMAILS = "contact@example.com, reception@example.com";
    process.env.RUBIN_RECOVERY_PASSWORD = "long-enough-password";
    expect(await recoveryUser("someone@example.com", "long-enough-password")).toBeNull();
    expect(await recoveryUser("contact@example.com", "long-enough-passwore")).toBeNull();
    expect(await recoveryUser("contact@example.com", "")).toBeNull();
  });
});
