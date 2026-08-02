// Postgres backend — used automatically when DATABASE_URL is set. Uses the lightweight
// `postgres` driver (no ORM). Tables are created on first use, so no separate migration
// step is required for a fresh database. Point DATABASE_URL at a pooled connection
// string (e.g. Neon's -pooler host) for serverless.

import postgres from "postgres";
import type { Backend, FollowUp } from "./types";

export function createPostgresBackend(): Backend {
  const sql = postgres(process.env.DATABASE_URL!, { max: 3, idle_timeout: 20 });

  let ready: Promise<void> | null = null;
  const migrate = () => {
    if (!ready) {
      ready = (async () => {
        await sql`CREATE TABLE IF NOT EXISTS shops (
          shop TEXT PRIMARY KEY,
          access_token TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`;
        await sql`CREATE TABLE IF NOT EXISTS follow_ups (
          id TEXT PRIMARY KEY,
          shop TEXT NOT NULL,
          order_id TEXT NOT NULL,
          email TEXT NOT NULL,
          product TEXT NOT NULL,
          send_at BIGINT NOT NULL,
          sent BOOLEAN NOT NULL DEFAULT false
        )`;
        await sql`CREATE INDEX IF NOT EXISTS follow_ups_due ON follow_ups (sent, send_at)`;
      })();
    }
    return ready;
  };

  return {
    async saveShopToken(shop, token) {
      await migrate();
      await sql`
        INSERT INTO shops (shop, access_token, updated_at) VALUES (${shop}, ${token}, now())
        ON CONFLICT (shop) DO UPDATE SET access_token = EXCLUDED.access_token, updated_at = now()`;
    },
    async getShopToken(shop) {
      await migrate();
      const rows = await sql<{ access_token: string }[]>`SELECT access_token FROM shops WHERE shop = ${shop}`;
      return rows[0]?.access_token;
    },
    async deleteShopToken(shop) {
      await migrate();
      await sql`DELETE FROM shops WHERE shop = ${shop}`;
    },

    async insertFollowUp(f) {
      await migrate();
      const rows = await sql`
        INSERT INTO follow_ups (id, shop, order_id, email, product, send_at, sent)
        VALUES (${f.id}, ${f.shop}, ${f.orderId}, ${f.email}, ${f.product}, ${f.sendAt}, ${f.sent})
        ON CONFLICT (id) DO NOTHING
        RETURNING id`;
      return rows.length > 0;
    },
    async dueFollowUps(now) {
      await migrate();
      const rows = await sql<
        { id: string; shop: string; order_id: string; email: string; product: string; send_at: string; sent: boolean }[]
      >`SELECT * FROM follow_ups WHERE sent = false AND send_at <= ${now}`;
      return rows.map(
        (r): FollowUp => ({
          id: r.id,
          shop: r.shop,
          orderId: r.order_id,
          email: r.email,
          product: r.product,
          sendAt: Number(r.send_at),
          sent: r.sent,
        }),
      );
    },
    async markSent(id) {
      await migrate();
      await sql`UPDATE follow_ups SET sent = true WHERE id = ${id}`;
    },

    async purgeShop(shop) {
      await migrate();
      const rows = await sql`DELETE FROM follow_ups WHERE shop = ${shop} RETURNING id`;
      return rows.length;
    },
    async purgeEmail(email) {
      await migrate();
      const rows = await sql`DELETE FROM follow_ups WHERE lower(email) = ${email.trim().toLowerCase()} RETURNING id`;
      return rows.length;
    },
  };
}
