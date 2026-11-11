import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addShop, newShopId, openShop, readShopList, renameShop, wholeList } from "./shops";

const desktop = createRequire(import.meta.url)("../../../desktop/shops.cjs") as {
  readShops: (root: string) => { current: string; shops: Array<{ id: string; name: string }> };
  shopDir: (root: string, id: string) => string;
  shopsFile: (root: string) => string;
  watchShops: (root: string, on: (l: unknown) => void, ms?: number) => () => void;
};

let root = "";
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "floda-shops-"));
  process.env.FLODA_SHOPS_FILE = desktop.shopsFile(root);
});
afterEach(() => {
  delete process.env.FLODA_SHOPS_FILE;
  rmSync(root, { recursive: true, force: true });
});

describe("the shops on this computer", () => {
  it("start as the one shop the app always had, in the app-data folder itself", async () => {
    expect(await readShopList()).toEqual({ current: "main", shops: [{ id: "main", name: "My shop" }] });
    expect(desktop.shopDir(root, "main")).toBe(root);
  });

  it("are added, renamed and opened by writing the list the desktop app reads", async () => {
    const bike = await addShop("  Spoke & Chain Bikes ");
    expect(bike.id).toMatch(/^spoke-chain-bikes-[0-9a-f]{6}$/);
    await renameShop("main", "Alpsport");
    await openShop(bike.id);
    const seen = desktop.readShops(root);
    expect(seen).toEqual({ current: bike.id, shops: [{ id: "main", name: "Alpsport" }, { id: bike.id, name: "Spoke & Chain Bikes" }] });
    expect(desktop.shopDir(root, bike.id)).toBe(join(root, "shops", bike.id));
    expect(JSON.parse(readFileSync(desktop.shopsFile(root), "utf8")).current).toBe(bike.id);
  });

  it("refuses a nameless shop, a second one of the same name, and a shop that is not there", async () => {
    await expect(addShop("   ")).rejects.toThrow(/name/);
    await addShop("Surf Co");
    await expect(addShop("surf co")).rejects.toThrow(/already/);
    await expect(openShop("nope")).rejects.toThrow(/No such shop/);
  });

  it("never lets a hand-edited list point anywhere else: odd ids are dropped and an unknown shop opens the first", () => {
    const list = wholeList({ current: "../../etc", shops: [{ id: "../../etc", name: "x" }, { id: "ok-1", name: "" }] });
    expect(list).toEqual({ current: "main", shops: [{ id: "main", name: "My shop" }, { id: "ok-1", name: "Shop" }] });
    expect(desktop.readShops(root).current).toBe("main");
  });

  it("is told to the desktop app when the open shop changes", async () => {
    const seen: unknown[] = [];
    const stop = desktop.watchShops(root, (l) => seen.push(l), 50);
    const shop = await addShop("Second");
    await openShop(shop.id);
    await new Promise((r) => setTimeout(r, 400));
    stop();
    expect(seen.at(-1)).toMatchObject({ current: shop.id });
  });

  it("gives every new shop an id that is safe as a folder name", () => {
    expect(newShopId("Café Ölberg / Nord")).toMatch(/^cafe-olberg-nord-[0-9a-f]{6}$/);
    expect(newShopId("!!!")).toMatch(/^shop-[0-9a-f]{6}$/);
  });
});
