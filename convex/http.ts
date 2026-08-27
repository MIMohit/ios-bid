import { httpRouter, makeFunctionReference } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

/**
 * W3 owns convex/clicks.ts and convex/presence.ts, so `internal.clicks.*` is
 * absent from _generated/api until it lands. These references are built by name
 * against the signatures pinned in ADR section 5; the runtime target is
 * identical and they should be swapped for `internal.x.y` at integration.
 */
const trackClick = makeFunctionReference<
  "mutation",
  { listingId: Id<"listings">; sid: string; day: string },
  boolean
>("clicks:track");

const touchPresence = makeFunctionReference<
  "mutation",
  { sid: string; day: string },
  null
>("presence:touch");

const http = httpRouter();

http.route({
  path: "/stripe",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const signature = request.headers.get("stripe-signature");
    // No signature at all is not Stripe. 200 so nothing retries it.
    if (!signature) return new Response(null, { status: 200 });

    // Raw bytes. request.json() reparses and re-serializes, and the signature
    // is computed over exactly what Stripe sent.
    const payload = await request.text();

    // Caught rather than left to the platform's error mapping, because the one
    // thing this endpoint must never do is answer 2xx for work it did not do.
    // verifyAndSettle throws when STRIPE_WEBHOOK_SECRET is unset, and Stripe's
    // retries are what settle the backlog once somebody sets it.
    const result = await ctx
      .runAction(internal.stripe.verifyAndSettle, { signature, payload })
      .catch((err: unknown) => {
        console.error("stripe webhook failed before it could be handled", err);
        return { status: "transient" as const };
      });

    // Stripe retries on any non-2xx, so this choice is binary. 200 means never
    // send this again, and that is right for a settled bid AND for a signature
    // that will never verify. 500 is reserved for genuinely transient failures.
    return result.status === "transient"
      ? new Response("retry", { status: 500 })
      : new Response(null, { status: 200 });
  }),
});

/**
 * The two write endpoints the Vercel server calls. They exist so the mutations
 * behind them can stay internal: a public mutation is callable by anyone
 * holding VITE_CONVEX_URL, which is public by design, and a script minting sids
 * would inflate the tap counts that are the entire product.
 */
function authorized(request: Request): boolean {
  const secret = process.env.EDGE_SECRET;
  // Timing-safe compare needs node:crypto, which the httpAction V8 runtime does
  // not have. A random secret over TLS is not a practical timing target.
  return !!secret && request.headers.get("x-iosrank-edge") === secret;
}

/** Shared shape of both track bodies. Anything else is a 400 and no Convex write. */
function readBody(body: unknown): { sid: string; day: string; listingId?: string } | null {
  if (typeof body !== "object" || body === null) return null;
  const { sid, day, listingId } = body as Record<string, unknown>;
  if (typeof sid !== "string" || !sid) return null;
  // YYYY-MM-DD, UTC. Also stops a caller shredding the dedupe table with junk keys.
  if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  if (listingId !== undefined && (typeof listingId !== "string" || !listingId)) return null;
  return { sid, day, ...(listingId === undefined ? {} : { listingId }) };
}

async function parse(request: Request): Promise<ReturnType<typeof readBody>> {
  try {
    return readBody(await request.json());
  } catch {
    return null;
  }
}

http.route({
  path: "/track/click",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!authorized(request)) return new Response(null, { status: 401 });
    const body = await parse(request);
    if (!body?.listingId) return new Response(null, { status: 400 });

    await ctx.runMutation(trackClick, {
      // The id came from a board row we rendered, and track re-reads it anyway.
      listingId: body.listingId as Id<"listings">,
      sid: body.sid,
      day: body.day,
    });
    return new Response(null, { status: 204 });
  }),
});

http.route({
  path: "/track/beat",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!authorized(request)) return new Response(null, { status: 401 });
    const body = await parse(request);
    if (!body) return new Response(null, { status: 400 });

    await ctx.runMutation(touchPresence, { sid: body.sid, day: body.day });
    return new Response(null, { status: 204 });
  }),
});

export default http;
