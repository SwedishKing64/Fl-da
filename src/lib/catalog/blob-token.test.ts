/**
 * The same trap as the database connection string, one store along.
 *
 * A Blob store attached to a Vercel project under a prefix is written as
 * `<PREFIX>_BLOB_READ_WRITE_TOKEN`, and looking only for the bare name means a store that is
 * genuinely connected reads as not connected — uploads then go to a disk that does not survive the
 * next request, and the only symptom is images going missing later.
 */

import { describe, expect, it } from "vitest";
import { BLOB_TOKEN, blobEnvNamesPresent, findBlobToken } from "./blob-token";

const TOKEN = "vercel_blob_rw_A1b2C3d4E5f6G7h8_i9J0kL1mN2oP3qR4sT5uV6w";
const OTHER = "vercel_blob_rw_Z9y8X7w6V5u4T3s2_a1B2c3D4e5F6g7H8i9J0k";

describe("finding the Blob token", () => {
  it("finds the plain variable a single store sets", () => {
    expect(findBlobToken({ BLOB_READ_WRITE_TOKEN: TOKEN })).toEqual({ key: "BLOB_READ_WRITE_TOKEN", token: TOKEN });
  });

  it("finds a store attached under a prefix, which is the whole point", () => {
    expect(findBlobToken({ ALPSPORT_BLOB_READ_WRITE_TOKEN: TOKEN })).toEqual({ key: "ALPSPORT_BLOB_READ_WRITE_TOKEN", token: TOKEN });
  });

  it("finds it under a name nobody would have guessed", () => {
    expect(findBlobToken({ store_2_rw: TOKEN })?.token).toBe(TOKEN);
  });

  it("prefers the canonical name, so one store behaves exactly as it always did", () => {
    const found = findBlobToken({ ALPSPORT_BLOB_READ_WRITE_TOKEN: OTHER, BLOB_READ_WRITE_TOKEN: TOKEN });
    expect(found).toEqual({ key: "BLOB_READ_WRITE_TOKEN", token: TOKEN });
  });

  it("picks the same store on every boot when two are attached under prefixes", () => {
    const env = { ZZZ_BLOB_READ_WRITE_TOKEN: OTHER, AAA_BLOB_READ_WRITE_TOKEN: TOKEN };
    const a = findBlobToken(env);
    const b = findBlobToken({ AAA_BLOB_READ_WRITE_TOKEN: TOKEN, ZZZ_BLOB_READ_WRITE_TOKEN: OTHER });
    expect(a).toEqual(b);
    expect(a?.key).toBe("AAA_BLOB_READ_WRITE_TOKEN");
  });

  it("is not fooled by a variable that is merely named like one", () => {
    expect(findBlobToken({ BLOB_READ_WRITE_TOKEN: "" })).toBeNull();
    expect(findBlobToken({ BLOB_READ_WRITE_TOKEN: "changeme" })).toBeNull();
    expect(findBlobToken({ MY_BLOB_URL: "https://blob.vercel-storage.com/x" })).toBeNull();
    expect(findBlobToken({})).toBeNull();
  });

  it("ignores a read-only token, which cannot be used to upload", () => {
    expect(findBlobToken({ BLOB_READ_ONLY_TOKEN: "vercel_blob_ro_A1b2C3d4_e5F6g7H8" })).toBeNull();
  });

  it("tolerates whitespace around a value pasted by hand", () => {
    expect(findBlobToken({ BLOB_READ_WRITE_TOKEN: `  ${TOKEN}\n` })?.token).toBe(TOKEN);
  });

  it("recognises the documented token shape and nothing looser", () => {
    expect(BLOB_TOKEN.test(TOKEN)).toBe(true);
    expect(BLOB_TOKEN.test("vercel_blob_rw_")).toBe(false);
    expect(BLOB_TOKEN.test(`prefix ${TOKEN}`)).toBe(false);
  });

  it("lists Blob-ish names for the panel, and never a token value", () => {
    const names = blobEnvNamesPresent({ ALPSPORT_BLOB_READ_WRITE_TOKEN: TOKEN, DATABASE_URL: "postgres://x", blob_store_id: "abc" });
    expect(names).toEqual(["ALPSPORT_BLOB_READ_WRITE_TOKEN", "blob_store_id"]);
    expect(names.join(" ")).not.toContain(TOKEN);
  });
});
