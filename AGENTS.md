# iosbid.lol

A pay-to-rank public leaderboard of iOS App Store apps. Rank is the bid, nothing else.

The build contract is `scratchpad/research/00-ADR.md` plus `OWNER-DECISIONS.md`. This file covers
only what you need to run the thing.

## Stack

TanStack Start (React 19, Vite 8, Nitro 3) on Vercel. Convex Cloud is both the database and the
backend. Stripe Checkout for payments. Tailwind 4. pnpm. No Next.js, no Prisma, no Postgres, no
Docker, and no authentication anywhere.

The `convex/` directory is compiled and uploaded by the Convex CLI, entirely outside Vite. Vite
contributes nothing to it and it contributes nothing to `vite.config.ts`.

## House rules

- No `any`. Prefer inferred and derived types.
- True black `#000` in dark, Apple's system light palette in light. Information dense, minimal copy,
  no decorative card or pill chrome.
- **No em dashes** anywhere: code, comments, copy, commit messages.
- `backdrop-filter` may appear on at most two selectors in the whole codebase, both structural
  (the sticky header, the bid bar). Never on a row, rail item, ticker item, divider, icon, hover or
  focus state.
- No `@keyframes` that runs without a user gesture. No spinners, shimmer, pulse or ambient motion.
- Whole US dollars only. Cents exist in exactly one place: Stripe `unit_amount = dollars * 100`.
- There is no per-listing detail page. The string "see details" must not appear in the codebase.
- Never import from `convex/_generated/server` inside `src/`. That pulls the Convex function runtime
  into the browser bundle.

## Commands

```
pnpm dev            vite dev on :3000
pnpm dev:convex     convex dev, a watch loop. Run it in its own terminal
pnpm typecheck      tsc --noEmit over src/ and convex/
pnpm test           vitest, convex-test suites under convex/**/*.test.ts
pnpm build          vite build
pnpm stripe:listen  forwards Stripe events to the Convex deployment
```

`pnpm dev` and `pnpm dev:convex` are two processes. The Vite server does not push Convex functions
and the Convex CLI does not serve the app.

**Never run a bare `npx convex dev` from a script or an agent.** It blocks forever on a watch loop.
Use `npx convex dev --once`.

## Convex deployments

The project is `iosbid` on team `mimohit77`. Development runs against a **cloud** dev deployment, not
a local one, because a local deployment has no public URL and Stripe could not deliver a webhook to
it. The whole payment path is untestable locally.

First time on a machine:

```
npx convex login
npx convex dev --once --configure existing --team mimohit77 --project iosbid --dev-deployment cloud
```

That writes `CONVEX_DEPLOYMENT`, `VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL` into `.env.local`,
which is gitignored. Note that convex 1.45 detects Vite and writes the `VITE_`-prefixed names
directly, so there is nothing to copy by hand. Vite only exposes `VITE_`-prefixed variables to the
client; without `VITE_CONVEX_URL` the router throws `missing VITE_CONVEX_URL` at runtime.

After a schema or function change: `npx convex dev --once` pushes and regenerates
`convex/_generated/`, which is **committed**.

Switching deployments later:

```
npx convex login                    # change account
npx convex deployment select dev    # pick a different dev deployment
```

### Deployment environment variables

These live on the deployment, not in any file. Set them with `npx convex env set NAME value`.

| Name | Purpose |
|---|---|
| `STRIPE_SECRET_KEY` | Checkout session creation. `sk_test_...` until launch |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature verification |
| `SITE_ORIGIN` | `https://iosbid.lol`, used to build Stripe success and cancel URLs |
| `EDGE_SECRET` | Guards the two write `httpAction` endpoints. Same value as the Vercel one |

Convex injects `CONVEX_CLOUD_URL` and `CONVEX_SITE_URL` into the function runtime itself. Do not
hardcode either. Note the asymmetry: **inside** a Convex function the site URL is
`process.env.CONVEX_SITE_URL`; **outside** it, on the Vercel server or in the browser bundle, it is
`VITE_CONVEX_SITE_URL`, which is what the CLI writes into `.env.local`. Code that posts to
`/track/click` or `/track/beat` from the Vercel side reads the `VITE_` name.

### The Stripe webhook

**The Stripe endpoint points at `$VITE_CONVEX_SITE_URL/stripe`**, the `.convex.site` host, never
`.convex.cloud` (which returns 404 forever) and never through Vercel. `convex/http.ts` owns the
route. Locally:

```
set -a && . ./.env.local && set +a && pnpm stripe:listen
```

`.env.local` is not loaded into a shell by pnpm, only by Vite, so the script needs it sourced first.

## Vercel

`vercel.json` runs `npx convex deploy --cmd-url-env-var-name VITE_CONVEX_URL --cmd 'pnpm build'`.
The backend deploys first, then the URL is injected, then the frontend builds. A backend that fails
to deploy means no frontend is built, so **adding** a Convex function is safe and **renaming or
deleting** one is not. Add, migrate, delete in a later deploy.

Vercel environment variables: `CONVEX_DEPLOY_KEY` (a separate key for production and for preview),
`EDGE_SECRET`, and `VITE_DATAFAST_ID` on production only. Never set `VITE_CONVEX_URL` by hand; the
build writes it, and setting it manually is how a preview ends up writing to production data.

## Known state during the rewrite

- `/` returns 404 until W6 lands `src/routes/index.tsx`. The shell, the 404 page and the error
  boundary all render correctly in the meantime.
- `public/` does not exist yet (W7 owns it), so `/favicon.ico`, `/icon-512.png` and
  `/apple-touch-icon.png` 404.
- `patches/@tanstack__router-ssr-query-core@1.169.1.patch` fixes an upstream bug: the client
  hydration reader calls `hydrate(queryClient, value)` before checking `done`, so the terminal read
  always passes `undefined` and logs `Error reading query stream` on every page load. Two-line
  guard. Drop the patch when upstream fixes it; pnpm will fail the install if it stops applying.

## Theme

Two themes, one variable set, defined in `src/styles/tokens.css` under `:root[data-theme="dark"]`
and `:root[data-theme="light"]`. A blocking inline script in `src/routes/__root.tsx` resolves
`localStorage("iosbid-theme")` then `prefers-color-scheme` and stamps `data-theme` on `<html>`
before first paint, so there is no flash. The storage key and the script both live in
`src/lib/theme.ts`; import `THEME_STORAGE_KEY` from there rather than retyping it.

`<html>` carries `suppressHydrationWarning` because the server deliberately renders without
`data-theme` and the script adds it. That is the one attribute where a mismatch is the design.
