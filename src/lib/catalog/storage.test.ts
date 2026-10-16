import { describe, expect, it } from "vitest";
import { publicFileUrl } from "./storage";

describe("a stored file's public address", () => {
  it("is the base address and the file route when the base is public", () => {
    expect(publicFileUrl("images/2026-10/a b.jpg", "https://tools.example.com/")).toBe("https://tools.example.com/api/catalog/files/images/2026-10/a%20b.jpg");
  });
  it("is nothing when the base is a copy's own address, since Shopify cannot fetch from there", () => {
    expect(publicFileUrl("images/a.jpg", "http://127.0.0.1:51299")).toBeNull();
    expect(publicFileUrl("images/a.jpg", "http://localhost:3000")).toBeNull();
    expect(publicFileUrl("images/a.jpg", "https://floda.local")).toBeNull();
  });
  it("keeps a remote reference as it is", () => {
    expect(publicFileUrl("https://blob.example.com/x.jpg", "")).toBe("https://blob.example.com/x.jpg");
  });
});
