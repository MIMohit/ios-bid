"use node";

import Stripe from "stripe";
import { ConvexError, v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { AppMeta } from "./schema";
import { MAX_BID, MIN_BID } from "./rules";

/**
 * Fail closed. An unset variable on a money path must never fall back to a
 * plausible-looking default: SITE_ORIGIN defaulting to localhost sent every
 * paying customer to a dead URL the moment their card cleared, and it looked
 * like a scam rather than like a misconfiguration.
 */
function required(name: string): string {
  const value = process.env[name];
  if (value) return value;
  // Named in the logs, generic to the buyer: a misconfigured deployment is ours
  // to see, not theirs to read.
  console.error(`${name} is not set on this deployment`);
  throw new ConvexError({
    code: "config",
    message: "Payments are not configured yet. Try again shortly.",
  });
}

let client: Stripe | null = null;
const stripe = (): Stripe => (client ??= new Stripe(required("STRIPE_SECRET_KEY")));

const origin = (): string => required("SITE_ORIGIN").replace(/\/$/, "");

/**
 * A paid rank is online advertising, which is what this tax code says. EU and
 * UK VAT on a B2C electronically supplied service has no registration threshold
 * for a non-EU supplier: it is due from the first euro, at 17 to 27 percent.
 * Stripe Tax computing and recording it is the difference between being able to
 * file and not being able to.
 *
 * `automatic_tax` requires Stripe Tax to be switched on for the account. If it
 * is not, Stripe rejects the whole session with an invalid_request_error and no
 * charge happens. That is the correct failure: an untaxed sale we did not know
 * about is the one outcome that cannot be unwound later.
 */
const TAX_CODE = "txcd_10701000"; // Website Advertising

/**
 * Apple sits on the highest-value click on the site, so it gets a short leash
 * and a fallback rather than a veto. Bounded here rather than at the fetch,
 * because the 8s timeout in lib/appstore.ts is the right budget for the lookup
 * the form does while someone types and the wrong one for the submit click.
 */
const LOOKUP_BUDGET_MS = 2_500;

/**
 * Metadata for the listing this payment will create or refresh, from Apple when
 * Apple answers and from the board's own row when it does not.
 *
 * A raise therefore survives an iTunes outage and a slow lookup costs the buyer
 * LOOKUP_BUDGET_MS instead of the full fetch timeout. A brand-new listing has
 * no fallback and still waits: a row on this board is never built out of
 * anything a stranger typed.
 */
async function snapshotFor(ctx: ActionCtx, appId: string, listed: AppMeta | null): Promise<AppMeta> {
  if (!listed) {
    const found = await ctx.runAction(api.appstore.lookup, { input: appId });
    if (!("match" in found)) {
      throw new ConvexError({ code: "appstore", message: "That app is no longer on the App Store." });
    }
    return found.match;
  }

  const fresh = ctx
    .runAction(api.appstore.lookup, { input: appId })
    .then((found) => ("match" in found ? found.match : null))
    .catch((err: unknown) => {
      console.error("appstore lookup failed at checkout, using the listed snapshot", appId, err);
      return null;
    });
  const capped = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), LOOKUP_BUDGET_MS);
  });

  return (await Promise.race([fresh, capped])) ?? listed;
}

export const createCheckout = action({
  args: { appId: v.string(), amount: v.number() },
  returns: v.object({ url: v.string() }),
  handler: async (ctx, { appId, amount }): Promise<{ url: string }> => {
    if (!Number.isInteger(amount) || amount < MIN_BID || amount > MAX_BID) {
      throw new ConvexError({
        code: "amount",
        message: `Bids are whole US dollars, ${MIN_BID} or more.`,
        minimum: MIN_BID,
      });
    }

    // Reprice server side. The client's number is never what gets charged, and
    // the same read hands back the board's copy of Apple's metadata.
    const quote = await ctx.runQuery(internal.bids.quoteInternal, { appId, amount });
    const snapshot = await snapshotFor(ctx, appId, quote.listed);

    const bidId = await ctx.runMutation(internal.bids.createPending, {
      appId,
      amount: quote.charge,
      snapshot,
    });

    const site = origin();
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      success_url: `${site}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: site,
      // The three tax parameters. The address is what makes a filing record
      // possible at all; the tax id turns an EU business sale into a reverse
      // charge instead of us collecting VAT we should not have collected.
      billing_address_collection: "required",
      automatic_tax: { enabled: true },
      tax_id_collection: { enabled: true },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            // The only place cents exist in this codebase.
            unit_amount: quote.charge * 100,
            // Exclusive, and load-bearing: the bid is what lands on the board
            // and in siteStat.revenue, so VAT is added on top of it rather than
            // carved out of it. Inclusive would make every settled amount an
            // overstatement of what we were actually paid.
            tax_behavior: "exclusive",
            product_data: { name: `${snapshot.name} on iosbid.lol`, tax_code: TAX_CODE },
          },
        },
      ],
      // Both, because a refund or a dispute arrives as a PaymentIntent event
      // and the session metadata is not on it.
      metadata: { bidId, appId },
      payment_intent_data: { metadata: { bidId, appId } },
    });

    await ctx.runMutation(internal.bids.attachCheckout, { bidId, checkoutId: session.id });

    if (!session.url) {
      throw new ConvexError({ code: "stripe", message: "Stripe did not return a checkout URL." });
    }
    return { url: session.url };
  },
});

/** Stripe puts our metadata on every object it hands back, but not in its types. */
function bidIdOf(event: Stripe.Event): Id<"bids"> | null {
  const object = event.data.object;
  if (!("metadata" in object)) return null;
  const bidId = object.metadata?.bidId;
  // The signature already proved Stripe echoed back metadata we wrote.
  return bidId ? (bidId as Id<"bids">) : null;
}

/**
 * The Stripe endpoint at $VITE_CONVEX_SITE_URL/stripe has to be subscribed to
 * all six of the event types below. Subscribing to the checkout ones only is the
 * silent version of having no refund handling at all, which is what this file
 * used to have.
 */
export const verifyAndSettle = internalAction({
  args: { signature: v.string(), payload: v.string() },
  returns: v.object({
    status: v.union(v.literal("ok"), v.literal("invalid"), v.literal("transient")),
  }),
  handler: async (ctx, { signature, payload }) => {
    // Throws rather than returning "transient": both make http.ts answer 500 so
    // Stripe keeps retrying, but a missing secret is a deployment error and
    // belongs in the exception log, not in the handled-normally path where it
    // sat while every payment stayed pending and /success said "Payment
    // received".
    const secret = required("STRIPE_WEBHOOK_SECRET");

    let event: Stripe.Event;
    try {
      // Synchronous, so it needs node:crypto. This is the entire reason
      // http.ts hands the raw bytes over to a "use node" action.
      event = stripe().webhooks.constructEvent(payload, signature, secret);
    } catch (err) {
      // Deliberately reported as handled: a payload that fails the signature
      // will never pass it, so 40 retries over 3 days accomplish nothing.
      console.error("stripe signature rejected", err);
      return { status: "invalid" as const };
    }

    try {
      switch (event.type) {
        case "checkout.session.completed":
        case "checkout.session.async_payment_succeeded": {
          const session = event.data.object;
          const bidId = bidIdOf(event);
          // A delayed payment method completes the session unpaid and settles
          // later, through async_payment_succeeded.
          if (!bidId || session.payment_status === "unpaid") return { status: "ok" as const };
          await ctx.runMutation(internal.bids.settle, {
            bidId,
            paymentIntent:
              typeof session.payment_intent === "string" ? session.payment_intent : undefined,
            country: session.customer_details?.address?.country ?? undefined,
          });
          return { status: "ok" as const };
        }
        case "checkout.session.expired":
        case "checkout.session.async_payment_failed": {
          const bidId = bidIdOf(event);
          if (bidId) await ctx.runMutation(internal.bids.fail, { bidId });
          return { status: "ok" as const };
        }
        // Money going back out. Resolved by PaymentIntent rather than by
        // metadata: Stripe does not copy a PaymentIntent's metadata onto its
        // Charge, and a Dispute carries none at all.
        //
        // charge.dispute.closed is deliberately not here. Winning a dispute
        // returns the money but not the rank, because quietly reinstating a
        // listing weeks later is worse than leaving it off and refunding.
        case "charge.refunded":
        case "charge.dispute.created": {
          const paymentIntent = event.data.object.payment_intent;
          if (typeof paymentIntent !== "string") return { status: "ok" as const };
          await ctx.runMutation(internal.bids.reverse, { paymentIntent });
          return { status: "ok" as const };
        }
        default:
          return { status: "ok" as const };
      }
    } catch (err) {
      // 500, so Stripe retries. settle latches on bid.status === "paid" and
      // reverse on bid.reversed, so a retry of either is a pure read.
      console.error("stripe webhook failed", event.type, err);
      return { status: "transient" as const };
    }
  },
});
