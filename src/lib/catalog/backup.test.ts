import { describe, expect, it } from "vitest";
import { backupName, parseBackupName, pruneNames, sqliteFile } from "./backup";

describe("backups", () => {
  it("names a backup so that the names sort by time", () => {
    const a = backupName(new Date(2026, 9, 15, 6, 30), "nightly");
    const b = backupName(new Date(2026, 9, 15, 18, 5), "manual");
    expect(a).toBe("floda-2026-10-15-0630-nightly.db");
    expect([b, a].sort()).toEqual([a, b]);
    expect(parseBackupName(b)).toEqual({ at: new Date("2026-10-15T18:05:00"), reason: "manual" });
    expect(parseBackupName("floda.db")).toBeNull();
  });
  it("keeps the newest fourteen and ignores what is not a backup", () => {
    const names = Array.from({ length: 16 }, (_, i) => backupName(new Date(2026, 9, i + 1, 2, 0), "nightly"));
    expect(pruneNames([...names, "notes.txt"])).toEqual(names.slice(0, 2));
    expect(pruneNames(names.slice(0, 3))).toEqual([]);
  });
  it("knows a file database from a server", () => {
    expect(sqliteFile({ DATABASE_URL: "file:/data/floda.db" })).toBe("/data/floda.db");
    expect(sqliteFile({ DATABASE_URL: "postgresql://x/y" })).toBeNull();
    expect(sqliteFile({})).toBeNull();
  });
});
