// Access-token storage stub. In-memory only — replace with a DB/KV table
// (shop → access_token) for production. Serverless instances won't share this.
const TOKENS = new Map<string, string>();

export function saveShopToken(shop: string, token: string): void {
  TOKENS.set(shop, token);
}
export function getShopToken(shop: string): string | undefined {
  return TOKENS.get(shop);
}
export function deleteShopToken(shop: string): void {
  TOKENS.delete(shop);
}
