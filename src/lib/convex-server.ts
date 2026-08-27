/// <reference types="vite/client" />
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

/**
 * Everything the Vercel server needs to talk to Convex: a read client, the two
 * guarded write endpoints, and the function references those reads use.
 */

function convexUrl(): string {
  // import.meta.env, not process.env. Vite statically replaces VITE_ variables
  // into the SSR bundle at build time; on Vercel the deploy writes
  // VITE_CONVEX_URL for the build only, so at runtime process.env does not have
  // it. router.tsx reads the same variable the same way.
  const url = import.meta.env.VITE_CONVEX_URL;
  if (!url) throw new Error("missing VITE_CONVEX_URL");
  return url;
}

/**
 * A NEW client per call, deliberately. ConvexHttpClient pins a read timestamp
 * for `consistentQuery`, and a Convex backend only reads about 30 seconds into
 * the past, so a module-level instance works in dev and starts failing in
 * production once a lambda has been warm for a minute. Constructing one parses
 * a URL; there is no connection to reuse and nothing to pool.
 */
export function convexServer(): ConvexHttpClient {
  return new ConvexHttpClient(convexUrl());
}

/** Convex serves `httpAction` routes from `.convex.site`, same deployment name. */
function convexSiteUrl(): string {
  const explicit = import.meta.env.VITE_CONVEX_SITE_URL;
  if (explicit) return explicit;
  return convexUrl().replace(/\.convex\.cloud$/, ".convex.site");
}

/**
 * The Convex queries this server surface reads, referenced by name rather than
 * through `api`. `convex/_generated/api.d.ts` only knows the modules that have
 * been pushed, so `api.board.destination` does not typecheck until W1's
 * `convex/board.ts` lands. The signatures are the ones pinned in ADR section 5;
 * swap these two for `api.board.*` once the generated types cover them.
 */
export const boardDestination = makeFunctionReference<
  "query",
  { slug: string },
  { listingId: string; url: string } | null
>("board:destination");

export const boardPricing = makeFunctionReference<
  "query",
  { window: "all" | "today" },
  { topBid: number; priceForTop: number; topName: string | null; topIconUrl: string | null }
>("board:pricing");

/** UTC day key, the dedupe and rollup unit on both write endpoints. */
export function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

type EdgeBody = {
  "/track/click": { listingId: string; sid: string; day: string };
  "/track/beat": { sid: string; day: string };
};

/**
 * POST to one of Convex's two guarded write endpoints. The mutations behind
 * them are `internalMutation`, which ConvexHttpClient cannot reach at all, so
 * this shared secret is the only thing between a script and the tap counts that
 * are the product's proof of value.
 *
 * Awaited by every caller: Vercel may freeze the function once its response is
 * sent. Failures are logged and swallowed, because a missed count must never
 * cost a visitor their redirect or 500 a page render. A deploy with no
 * EDGE_SECRET (every preview) simply does not count, which is correct.
 */
export async function trackEdge<P extends keyof EdgeBody>(path: P, body: EdgeBody[P]): Promise<void> {
  const secret = process.env.EDGE_SECRET;
  if (!secret) return;
  try {
    await fetch(convexSiteUrl() + path, {
      method: "POST",
      headers: { "content-type": "application/json", "x-iosrank-edge": secret },
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.error(`[edge] ${path}`, error);
  }
}
