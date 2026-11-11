import { describe, expect, it } from "vitest";
import { uploadToShopifyFiles } from "./shopify-files";
import { localPictureRef } from "./picture-publish";

const cfg = { storeDomain: "shop.myshopify.com", accessToken: "t", apiVersion: "2025-07" };

function fakeShopify(answers: unknown[]) {
  const asked: Array<{ query: string; variables: Record<string, unknown> }> = [];
  const ask = async <T,>(_c: unknown, query: string, variables: Record<string, unknown>): Promise<T> => {
    asked.push({ query, variables });
    return answers.shift() as T;
  };
  return { ask, asked };
}

const staged = { stagedUploadsCreate: { stagedTargets: [{ url: "https://upload.example/x", resourceUrl: "https://upload.example/x/key", parameters: [{ name: "key", value: "k" }] }], userErrors: [] } };

describe("a picture kept in the shop's Shopify Files", () => {
  it("is staged, sent, made a file, and comes back with its cdn address once Shopify has it ready", async () => {
    const { ask, asked } = fakeShopify([
      staged,
      { fileCreate: { files: [{ id: "gid://shopify/MediaImage/1", fileStatus: "UPLOADED", image: null }], userErrors: [] } },
      { node: { fileStatus: "PROCESSING", image: null } },
      { node: { fileStatus: "READY", image: { url: "https://cdn.shopify.com/s/files/1/pic.jpg" } } },
    ]);
    const sent: string[] = [];
    const send = (async (url: string) => { sent.push(url); return new Response("", { status: 201 }); }) as unknown as typeof fetch;
    const url = await uploadToShopifyFiles("pic.jpg", Buffer.from("jpeg"), "image/jpeg", "A jacket", { config: cfg, ask, send, wait: async () => {} });
    expect(url).toBe("https://cdn.shopify.com/s/files/1/pic.jpg");
    expect(sent).toEqual(["https://upload.example/x"]);
    expect(asked[0].variables).toMatchObject({ input: [{ filename: "pic.jpg", mimeType: "image/jpeg", resource: "IMAGE", httpMethod: "POST", fileSize: "4" }] });
    expect(asked[1].variables).toMatchObject({ files: [{ originalSource: "https://upload.example/x/key", contentType: "IMAGE", alt: "A jacket" }] });
  });

  it("says why when Shopify refuses, rather than handing back an address that is not there", async () => {
    const { ask } = fakeShopify([{ stagedUploadsCreate: { stagedTargets: [], userErrors: [{ message: "Access denied for stagedUploadsCreate field." }] } }]);
    await expect(uploadToShopifyFiles("pic.jpg", Buffer.from("x"), "image/jpeg", "", { config: cfg, ask, wait: async () => {} })).rejects.toThrow(/Access denied/);
  });

  it("stops on a file Shopify could not process", async () => {
    const { ask } = fakeShopify([
      staged,
      { fileCreate: { files: [{ id: "gid://shopify/MediaImage/2", fileStatus: "UPLOADED", image: null }], userErrors: [] } },
      { node: { fileStatus: "FAILED", image: null } },
    ]);
    const send = (async () => new Response(null, { status: 204 })) as unknown as typeof fetch;
    await expect(uploadToShopifyFiles("pic.jpg", Buffer.from("x"), "image/jpeg", "", { config: cfg, ask, send, wait: async () => {} })).rejects.toThrow(/could not process/);
  });
});

describe("which pictures are still on this computer", () => {
  it("knows its own file addresses, and nothing else", () => {
    expect(localPictureRef("http://127.0.0.1:3456/api/catalog/files/images/2026-10/ab12-jacket.jpg")).toBe("images/2026-10/ab12-jacket.jpg");
    expect(localPictureRef("/api/catalog/files/images/2026-10/a%20b.jpg")).toBe("images/2026-10/a b.jpg");
    expect(localPictureRef("https://cdn.shopify.com/s/files/1/pic.jpg")).toBeNull();
    expect(localPictureRef("https://shop.example.com/api/catalog/files/images/2026-10/x.jpg")).toBeNull();
    expect(localPictureRef("http://127.0.0.1:3456/api/catalog/files/invoices/2026-10/x.pdf")).toBeNull();
  });
});
