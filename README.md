# Afterword

**Understand what your customers actually say — don't just collect stars.**

Every Shopify review app (Judge.me, Loox, Yotpo) is a *collect-and-display* tool. Afterword
is a *read-and-act* tool: it reads each post-purchase reply, tags the themes, scores sentiment,
flags what's urgent, ranks **what to fix first**, drafts replies to unhappy customers, and turns
glowing ones into one-click testimonials.

See [TEARDOWN.md](TEARDOWN.md) for the competitive analysis this is built against.

## What's here

- **The insight engine** (`src/lib/analyze.ts`, `src/lib/insights.ts`) — pure, deterministic,
  fully tested. Turns replies into sentiment + themes + severity + drafted response, then
  aggregates into a score and a ranked "fix first" list. Swap `analyzeFeedback` for an LLM call
  behind the same signature to go from good to great.
- **The product UI** — a marketing page (`/`) and the live **dashboard** (`/app`) running on
  mock feedback so it works with zero setup.
- **The Shopify app skeleton** — real OAuth + webhook-HMAC + scheduled-send:
  - `GET /api/auth` → install, `GET /api/auth/callback` → token exchange + webhook registration
  - `POST /api/webhooks/orders-fulfilled` → schedule a follow-up (HMAC-verified)
  - `POST /api/cron/dispatch` → send everything that's due
  - **Mandatory GDPR compliance webhooks** (App Store requires all three; HMAC-verified):
    - `POST /api/webhooks/customers-data-request`
    - `POST /api/webhooks/customers-redact`
    - `POST /api/webhooks/shop-redact`
    Register these three URLs in the Partner Dashboard → *App setup → Compliance webhooks*
    (or under `[webhooks]` in `shopify.app.toml`). They already verify the HMAC and, for
    the redact topics, purge the shop/customer from the current in-memory stores — swap
    those stubs for real DB deletes in production.
  - Needs a Shopify Partner app + the env in [.env.example](.env.example) to run live.

## Develop

```sh
npm run dev          # http://localhost:3000  (/ and /app)
npm test             # vitest — engine + schedule tests
npx tsc --noEmit
```

## Status

Prototype: the insight engine and dashboard are real and tested on mock data; the Shopify
integration is a wired skeleton awaiting Partner credentials + a real DB/email provider
(token storage and sending are in-memory stubs, clearly marked). Deployable to Vercel.
