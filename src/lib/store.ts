// Access-token storage. Delegates to the persistence layer (in-memory by default,
// Postgres when DATABASE_URL is set) so tokens survive restarts in production.
import { db } from "./db";

export function saveShopToken(shop: string, token: string): Promise<void> {
  return db.saveShopToken(shop, token);
}
export function getShopToken(shop: string): Promise<string | undefined> {
  return db.getShopToken(shop);
}
export function deleteShopToken(shop: string): Promise<void> {
  return db.deleteShopToken(shop);
}
