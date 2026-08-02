-- Afterword reference schema (Postgres).
--
-- You do NOT need to run this by hand: when DATABASE_URL is set, src/lib/db/postgres.ts
-- creates these tables on first use. This file is here for documentation and for anyone
-- who prefers to provision the schema up front.

-- OAuth access tokens, one row per installed shop.
CREATE TABLE IF NOT EXISTS shops (
  shop         TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Scheduled post-purchase follow-up emails.
-- id is `${shop}:${order_id}` so the same order is never queued twice.
CREATE TABLE IF NOT EXISTS follow_ups (
  id        TEXT PRIMARY KEY,
  shop      TEXT NOT NULL,
  order_id  TEXT NOT NULL,
  email     TEXT NOT NULL,
  product   TEXT NOT NULL,
  send_at   BIGINT NOT NULL,   -- epoch milliseconds
  sent      BOOLEAN NOT NULL DEFAULT false
);

-- Speeds up the cron "what's due?" scan.
CREATE INDEX IF NOT EXISTS follow_ups_due ON follow_ups (sent, send_at);
