# iosbid.lol

A pay-to-rank public leaderboard for iOS apps — clone of the outbid.lol mechanic,
built specifically around the App Store. Every listing is a real app pulled live
from Apple's iTunes Lookup API (icon, rating, screenshots, category), so there's
no manual submission form and no fake listings.

## How it works

- Rank is the bid, nothing else. New listings start at **$5**.
- Taking **#1** costs at least **$5** more than the current top bid.
- Paying less than #1 still places you on the board wherever that bid ranks.
- Re-submitting the same app **raises** its bid — you only pay the difference
  (minimum **+$1**), and nobody else can steal your rank by paying just that gap.
- Two boards: **All-time** and **Today** (rolling 24h window).
- A completed Stripe payment is what claims the rank — settlement happens in
  the webhook, and is idempotent so Stripe retries never double-charge a rank.

Full rules: [`/rules`](http://localhost:3001/rules).

## Stack

- **Next.js 16** (App Router, Turbopack) + React 19 + TypeScript
- **Postgres** via Docker, **Prisma 7** (driver adapters, `@prisma/adapter-pg`)
- **Stripe Checkout** for payment, webhook-settled
- **Tailwind CSS v4** for styling
- Apple's public `itunes.apple.com/lookup` and `/search` endpoints for app data

## Local setup

```bash
npm install
npm run db:up          # starts Postgres in Docker on port 5433
npm run db:push        # creates the schema
npm run db:seed        # optional: seeds ~9 real apps so the board isn't empty
npm run dev
```

Copy `.env.example` to `.env` and fill in:

- `STRIPE_SECRET_KEY` — from the [Stripe dashboard](https://dashboard.stripe.com/test/apikeys)
- `STRIPE_WEBHOOK_SECRET` — printed by `npm run stripe:listen` (requires the
  [Stripe CLI](https://docs.stripe.com/stripe-cli))

To run the whole board **without** Stripe configured (e.g. for a quick demo),
set `BYPASS_PAYMENTS="1"` — checkout settles the bid instantly instead of
opening Stripe.

In a second terminal, forward Stripe webhooks to your local server:

```bash
npm run stripe:listen
```

## Project layout

- `src/lib/appstore.ts` — App Store lookup/search, URL parsing, redirect resolution
- `src/lib/bidding.ts` — all ranking rules, board queries, the settlement transaction
- `src/lib/categories.ts` — Apple genre → board category mapping
- `src/app/api/checkout` — creates the Stripe Checkout session for a bid
- `src/app/api/webhooks/stripe` — settles the bid once payment is confirmed
- `src/components/Board.tsx` — the shared leaderboard renderer used by every board page

## Deploying

1. Provision a Postgres database (Neon, Supabase, RDS, etc.) and set `DATABASE_URL`.
2. Run `npx prisma db push` against it once.
3. Set real `STRIPE_SECRET_KEY`, and add a webhook endpoint in the Stripe
   dashboard pointing at `https://yourdomain.com/api/webhooks/stripe` for the
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.expired`, and `checkout.session.async_payment_failed` events
   — copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
4. Set `NEXT_PUBLIC_SITE_URL` to your real domain.
5. `npm run build && npm start`.
