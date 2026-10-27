/**
 * Pictures kept in the shop's own Shopify Files, for a copy with nowhere public of its own.
 *
 * A desktop copy keeps pictures on the computer, at 127.0.0.1, which Shopify cannot fetch, so a
 * CSV carrying them imported with no pictures (asked 2026-10-27). A shop that has connected its
 * store has somewhere better: Shopify's own file store, which is free to the shop, never goes away
 * with a brand's page, and is where Shopify would have copied the picture to anyway. Each picture
 * is staged (`stagedUploadsCreate`), sent to the address Shopify gives, made a file (`fileCreate`),
 * and its cdn.shopify.com address is what the listing carries.
 *
 * Needs the `write_files` and `read_files` scopes. A token without them is refused once, and the
 * picture is kept where it would have been.
 */

import { graphql, shopifyConfig, type ShopifyConfig } from "./shopify";

const STAGE = `mutation Stage($input: [StagedUploadInput!]!) {
  stagedUploadsCreate(input: $input) {
    stagedTargets { url resourceUrl parameters { name value } }
    userErrors { field message }
  }
}`;

const CREATE = `mutation CreateFile($files: [FileCreateInput!]!) {
  fileCreate(files: $files) {
    files { id fileStatus ... on MediaImage { image { url } } }
    userErrors { field message }
  }
}`;

const READ = `query FileUrl($id: ID!) {
  node(id: $id) { ... on MediaImage { fileStatus image { url } } }
}`;

interface StageAnswer {
  stagedUploadsCreate: { stagedTargets: Array<{ url: string; resourceUrl: string; parameters: Array<{ name: string; value: string }> }>; userErrors: Array<{ message: string }> };
}
interface CreateAnswer {
  fileCreate: { files: Array<{ id: string; fileStatus: string; image?: { url: string } | null }>; userErrors: Array<{ message: string }> };
}
interface ReadAnswer {
  node: { fileStatus?: string; image?: { url: string } | null } | null;
}

export interface FilesDeps {
  config?: ShopifyConfig;
  ask?: <T>(cfg: ShopifyConfig, query: string, variables: Record<string, unknown>) => Promise<T>;
  send?: typeof fetch;
  wait?: (ms: number) => Promise<void>;
}

/** How long Shopify gets to make a picture ready, all told. */
const READY_MS = 60_000;

/** Keep a picture in the shop's Shopify Files; its public cdn.shopify.com address. Throws when it could not. */
export async function uploadToShopifyFiles(filename: string, data: Buffer, mimeType: string, alt = "", deps: FilesDeps = {}): Promise<string> {
  const cfg = deps.config ?? (await shopifyConfig());
  const ask = deps.ask ?? graphql;
  const send = deps.send ?? fetch;
  const wait = deps.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  const staged = await ask<StageAnswer>(cfg, STAGE, { input: [{ filename, mimeType, resource: "IMAGE", httpMethod: "POST", fileSize: String(data.length) }] });
  const stageErrors = staged.stagedUploadsCreate.userErrors;
  const target = staged.stagedUploadsCreate.stagedTargets[0];
  if (stageErrors.length || !target) throw new Error(stageErrors.map((e) => e.message).join("; ") || "Shopify gave nowhere to send the picture");

  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  form.append("file", new Blob([new Uint8Array(data)], { type: mimeType }), filename);
  const sent = await send(target.url, { method: "POST", body: form, signal: AbortSignal.timeout(60_000) });
  if (!sent.ok) throw new Error(`Shopify's file store answered ${sent.status}`);

  const created = await ask<CreateAnswer>(cfg, CREATE, { files: [{ originalSource: target.resourceUrl, contentType: "IMAGE", alt: alt.slice(0, 512) }] });
  const createErrors = created.fileCreate.userErrors;
  const file = created.fileCreate.files[0];
  if (createErrors.length || !file) throw new Error(createErrors.map((e) => e.message).join("; ") || "Shopify did not make the file");
  if (file.image?.url) return file.image.url;

  // Shopify makes the file in the background: asked again until it has an address.
  const until = Date.now() + READY_MS;
  for (let delay = 500; Date.now() < until; delay = Math.min(delay * 2, 4000)) {
    await wait(delay);
    const read = await ask<ReadAnswer>(cfg, READ, { id: file.id });
    if (read.node?.fileStatus === "FAILED") throw new Error("Shopify could not process the picture");
    if (read.node?.image?.url) return read.node.image.url;
  }
  throw new Error("Shopify did not have the picture ready in time");
}
