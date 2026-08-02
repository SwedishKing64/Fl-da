// Storage contract. Two backends implement it: an in-memory one (default, zero setup,
// used by tests) and a Postgres one (used automatically when DATABASE_URL is set).

export interface FollowUp {
  id: string; // `${shop}:${orderId}` — the natural dedupe key
  shop: string;
  orderId: string;
  email: string;
  product: string;
  sendAt: number; // epoch ms
  sent: boolean;
}

export interface FulfilledOrder {
  id: string | number;
  email?: string;
  line_items?: Array<{ title?: string }>;
}

export interface Backend {
  // Shop access tokens (OAuth)
  saveShopToken(shop: string, token: string): Promise<void>;
  getShopToken(shop: string): Promise<string | undefined>;
  deleteShopToken(shop: string): Promise<void>;

  // Scheduled follow-up emails
  insertFollowUp(f: FollowUp): Promise<boolean>; // false if the id already exists (dedupe)
  dueFollowUps(now: number): Promise<FollowUp[]>;
  markSent(id: string): Promise<void>;

  // GDPR redaction
  purgeShop(shop: string): Promise<number>;
  purgeEmail(email: string): Promise<number>;
}
