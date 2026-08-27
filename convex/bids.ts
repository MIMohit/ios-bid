import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { appMeta, type AppMeta } from "./schema";
import {
  MAX_BID,
  MAX_DESCRIPTION,
  MAX_PAGE,
  MAX_SCREENSHOTS,
  MIN_BID,
  PAGE_SIZE,
  RAISE_STEP,
  TODAY_WINDOW_MS,
} from "./rules";

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

/* ---------------------------------------------------------------- quote -- */

/**
 * Price a bid against the board's rules. Mirrors the leaderboard exactly:
 * paying less than #1 is never an error, it just buys a lower rank.
 *
 * Every rejection is a `ConvexError` with a `data` payload, because plain
 * `Error` messages are scrubbed in production and the bid form has to render
 * the reason inline. Non-integers and anything under $1 die here, at the trust
 * boundary, not only in the UI: this query is callable by anyone holding the
 * deployment URL and `stripe.createCheckout` prices off its answer.
 */
async function quoteBid(ctx: QueryCtx, appId: string, amount: number) {
  if (!Number.isInteger(amount) || amount < 1) {
    throw new ConvexError({ code: "not_integer", message: "Bids are whole US dollars." });
  }
  if (amount > MAX_BID) {
    throw new ConvexError({ code: "too_large", message: `The maximum bid is ${usd(MAX_BID)}.` });
  }

  const listing = await ctx.db
    .query("listings")
    .withIndex("by_appId", (q) => q.eq("appId", appId))
    .unique();

  if (!listing) {
    if (amount < MIN_BID) {
      throw new ConvexError({
        code: "below_min",
        message: `New listings start at ${usd(MIN_BID)}.`,
        minimum: MIN_BID,
      });
    }
    return { newTotal: amount, charge: amount, isRaise: false, currentBid: 0 };
  }

  const current = listing.totalBid;
  const floor = current + RAISE_STEP;
  if (amount < floor) {
    throw new ConvexError({
      code: "below_raise",
      message:
        `That app is already on the board at ${usd(current)}. ` +
        `Raising it costs at least ${usd(floor)}, and you only pay the difference.`,
      minimum: floor,
    });
  }
  // A raise charges the difference, so nobody can take your rank by paying it.
  return { newTotal: amount, charge: amount - current, isRaise: true, currentBid: current };
}

const quoteArgs = { appId: v.string(), amount: v.number() };

export const quote = query({
  args: quoteArgs,
  handler: (ctx, { appId, amount }) => quoteBid(ctx, appId, amount),
});

/**
 * A listing document minus its board columns is exactly an `AppMeta`, which is
 * why this is a rest spread and not fifteen hand-copied fields: add a column to
 * `listings` and the returns validator fails loudly instead of drifting.
 */
async function listedMeta(ctx: QueryCtx, appId: string): Promise<AppMeta | null> {
  const listing = await ctx.db
    .query("listings")
    .withIndex("by_appId", (q) => q.eq("appId", appId))
    .unique();
  if (!listing) return null;
  const {
    _id, _creationTime, totalBid, negFirstBidAt, todayBid, negTodayFirstAt, firstBidAt, lastBidAt,
    ...meta
  } = listing;
  return meta;
}

/**
 * The same price, re-derived inside `stripe.createCheckout`, plus the board's
 * own copy of Apple's metadata. The client's number is never trusted, and
 * `listed` is what keeps checkout alive when iTunes is not: a listing already on
 * the board carries a snapshot Apple validated when it joined.
 */
export const quoteInternal = internalQuery({
  args: quoteArgs,
  returns: v.object({
    newTotal: v.number(),
    charge: v.number(),
    isRaise: v.boolean(),
    currentBid: v.number(),
    listed: v.union(appMeta, v.null()),
  }),
  handler: async (ctx, { appId, amount }) => ({
    ...(await quoteBid(ctx, appId, amount)),
    listed: await listedMeta(ctx, appId),
  }),
});

/* ------------------------------------------------------------- checkout -- */

/**
 * Write-boundary caps. `board.page` reads whole listing documents, so an
 * oversized snapshot is not a display problem, it is 4,000 of them on the
 * deepest legal page. Applied once here, since this is the only door Apple
 * metadata comes through.
 */
function capMeta(meta: AppMeta): AppMeta {
  return {
    ...meta,
    screenshots: meta.screenshots.slice(0, MAX_SCREENSHOTS),
    description: meta.description?.slice(0, MAX_DESCRIPTION),
  };
}

export const createPending = internalMutation({
  args: { appId: v.string(), amount: v.number(), snapshot: appMeta },
  returns: v.id("bids"),
  handler: (ctx, { appId, amount, snapshot }) =>
    ctx.db.insert("bids", {
      appId,
      amount,
      totalAfter: 0, // real value lands at settle, when the listing total is known
      status: "pending",
      snapshot: capMeta(snapshot),
    }),
});

export const attachCheckout = internalMutation({
  args: { bidId: v.id("bids"), checkoutId: v.string() },
  returns: v.null(),
  handler: async (ctx, { bidId, checkoutId }) => {
    await ctx.db.patch(bidId, { checkoutId });
    return null;
  },
});

export const fail = internalMutation({
  args: { bidId: v.id("bids") },
  returns: v.null(),
  handler: async (ctx, { bidId }) => {
    const bid = await ctx.db.get(bidId);
    // Only a pending bid can fail. Never walk a settled payment backwards.
    if (bid?.status === "pending") await ctx.db.patch(bidId, { status: "failed" });
    return null;
  },
});

/* --------------------------------------------------------------- settle -- */

/**
 * Slugs are display-only (there is no detail page), but `/go/:slug` resolves by
 * them, so they must stay unique. A collision on a different app takes Apple's
 * trackId suffix.
 */
async function uniqueSlug(ctx: MutationCtx, base: string, appId: string): Promise<string> {
  const taken = await ctx.db
    .query("listings")
    .withIndex("by_slug", (q) => q.eq("slug", base))
    .unique();
  return !taken || taken.appId === appId ? base : `${base}-${appId.slice(-5)}`;
}

/**
 * Apply signed deltas to the "all" scope and one category scope. Both rows are
 * created lazily, so a fresh deployment needs no seed step and the board
 * launches genuinely empty.
 *
 * Signed rather than additive because a reversal has to walk the same four
 * counters backwards, and a payment that has already aged out of the Today
 * window moves `total` without moving `today`. Clamped at zero: the board reads
 * these as ground truth and a negative count is a wrong page footer forever.
 */
async function bumpBoardStats(
  ctx: MutationCtx,
  opts: { categorySlug: string; total: number; today: number; listings: number; todayListings: number },
) {
  for (const key of ["all", opts.categorySlug]) {
    const row = await ctx.db
      .query("boardStats")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    const next = {
      listingCount: Math.max(0, (row?.listingCount ?? 0) + opts.listings),
      todayCount: Math.max(0, (row?.todayCount ?? 0) + opts.todayListings),
      totalBid: Math.max(0, (row?.totalBid ?? 0) + opts.total),
      todayTotal: Math.max(0, (row?.todayTotal ?? 0) + opts.today),
    };
    if (row) await ctx.db.patch(row._id, next);
    else await ctx.db.insert("boardStats", { key, ...next });
  }
}

/**
 * Settle a paid bid. Safe to call any number of times for the same bid, which
 * is not optional: Stripe retries `checkout.session.completed` until it gets a
 * 2xx and echoes the same `metadata.bidId` every time.
 *
 * There is no advisory lock. The `by_appId` index-range read below is in this
 * transaction's read set, including when the range is empty, so two people
 * paying for the same not-yet-listed app cannot both take the create branch:
 * the loser's OCC check fails, it retries, and it sees the listing. Both
 * payments land.
 */
export const settle = internalMutation({
  args: {
    bidId: v.id("bids"),
    paymentIntent: v.optional(v.string()),
    country: v.optional(v.string()), // Stripe's billing country, kept as the VAT filing record
  },
  returns: v.union(v.id("listings"), v.null()),
  handler: async (ctx, { bidId, paymentIntent, country }) => {
    const bid = await ctx.db.get(bidId);
    if (!bid) return null;

    // The idempotency latch. Every writing path below also writes this document,
    // so a replay is a pure read and concurrent deliveries collapse to one.
    if (bid.status === "paid") return bid.listingId ?? null;

    const now = Date.now();
    const meta = bid.snapshot;

    const existing = await ctx.db
      .query("listings")
      .withIndex("by_appId", (q) => q.eq("appId", bid.appId))
      .unique();

    let listingId: Id<"listings">;
    let totalAfter: number;

    if (existing) {
      // ---- raise: increment the total, keep the placement, refresh metadata ----
      totalAfter = existing.totalBid + bid.amount;
      const enteringToday = existing.todayBid === 0;
      await ctx.db.patch(existing._id, {
        totalBid: totalAfter,
        todayBid: existing.todayBid + bid.amount,
        // The today streak's start only moves when the streak starts. Later
        // payments are newer by definition, so they are never the oldest live one.
        negTodayFirstAt: enteringToday ? -now : existing.negTodayFirstAt,
        lastBidAt: now,
        // firstBidAt and negFirstBidAt are never touched. Equal bids keep
        // placement order, and a raise must not reset it.
        name: meta.name,
        subtitle: meta.subtitle,
        description: meta.description,
        iconUrl: meta.iconUrl,
        screenshots: meta.screenshots,
        developer: meta.developer,
        price: meta.price,
        formattedPrice: meta.formattedPrice,
        rating: meta.rating,
        ratingCount: meta.ratingCount,
        genre: meta.genre,
        url: meta.url,
      });
      listingId = existing._id;
      await bumpBoardStats(ctx, {
        categorySlug: existing.categorySlug,
        total: bid.amount,
        today: bid.amount,
        listings: 0,
        todayListings: enteringToday ? 1 : 0,
      });
    } else {
      // ---- create: a brand-new listing joins both boards at this amount ----
      totalAfter = bid.amount;
      listingId = await ctx.db.insert("listings", {
        appId: meta.appId,
        slug: await uniqueSlug(ctx, meta.slug, meta.appId),
        name: meta.name,
        subtitle: meta.subtitle,
        description: meta.description,
        iconUrl: meta.iconUrl,
        screenshots: meta.screenshots,
        developer: meta.developer,
        price: meta.price,
        formattedPrice: meta.formattedPrice,
        rating: meta.rating,
        ratingCount: meta.ratingCount,
        genre: meta.genre,
        categorySlug: meta.categorySlug,
        url: meta.url,
        totalBid: bid.amount,
        negFirstBidAt: -now,
        todayBid: bid.amount,
        negTodayFirstAt: -now,
        firstBidAt: now,
        lastBidAt: now,
      });
      await bumpBoardStats(ctx, {
        categorySlug: meta.categorySlug,
        total: bid.amount,
        today: bid.amount,
        listings: 1,
        todayListings: 1,
      });
    }

    await ctx.db.patch(bid._id, {
      status: "paid",
      paidAt: now,
      listingId,
      totalAfter,
      paymentIntent: paymentIntent ?? bid.paymentIntent,
      country: country ?? bid.country,
    });

    // Revenue lives on siteStat, which no board, ticker or rail query reads.
    // Created lazily here for the same reason boardStats is: nothing is seeded.
    // ponytail: one shared siteStat row, so concurrent settles conflict on it
    // and one retries. Free at human bidding rates. Past ~10 settles/second,
    // move revenue to a sharded counter drained by the 20s cron, like visitors.
    const site = await ctx.db.query("siteStat").first();
    if (site) await ctx.db.patch(site._id, { revenue: site.revenue + bid.amount });
    else {
      await ctx.db.insert("siteStat", {
        launchedAt: now,
        revenue: bid.amount,
        visitors: 0,
        onlineCount: 0,
      });
    }

    // The 24h decay, transactional with this mutation: if OCC rolls us back the
    // job is unscheduled with it, so a retried webhook cannot double-subtract.
    // A setTimeout, a queue publish or an outbound HTTP call here would not.
    await ctx.scheduler.runAt(now + TODAY_WINDOW_MS, internal.today.expireBid, { bidId: bid._id });

    return listingId;
  },
});

/* -------------------------------------------------------------- reverse -- */

/**
 * Unwind a settled payment: a refund, or a chargeback. The exact mirror of
 * `settle`, and the reason the disputes clause in /terms is true rather than
 * decorative.
 *
 * Resolved by PaymentIntent and by nothing else. Stripe does not copy a
 * PaymentIntent's metadata onto its Charge, and a Dispute carries none at all,
 * so `by_paymentIntent` is the only link that survives the trip back.
 *
 * `reversed` is the latch, exactly as `status === "paid"` is settle's: Stripe
 * retries `charge.refunded` until it gets a 2xx, and a ledger that subtracts
 * twice is worse than one that never subtracts at all.
 *
 * A partial refund unwinds the whole bid. That is the terms as written: money
 * coming back means the rank does not stand, and there is no fraction of a rank
 * to sell.
 */
export const reverse = internalMutation({
  args: { paymentIntent: v.string() },
  returns: v.null(),
  handler: async (ctx, { paymentIntent }) => {
    const bid = await ctx.db
      .query("bids")
      .withIndex("by_paymentIntent", (q) => q.eq("paymentIntent", paymentIntent))
      .unique();
    // Nothing to walk back: never settled, already reversed, or never listed.
    if (!bid || bid.status !== "paid" || bid.reversed || !bid.listingId) return null;

    // `expired` is latched here too, so the `today.expireBid` already scheduled
    // at paidAt + 24h hits its own guard (today.ts:46) and cannot subtract this
    // amount from the Today counters a second time.
    const stillToday = !bid.expired;
    await ctx.db.patch(bid._id, { reversed: true, expired: true });

    const listing = await ctx.db.get(bid.listingId);
    if (!listing) return null;

    const totalBid = Math.max(0, listing.totalBid - bid.amount);
    const todayBid = stillToday ? Math.max(0, listing.todayBid - bid.amount) : listing.todayBid;

    // The oldest payment still inside the window, so "older bid keeps the higher
    // rank" stays exact after this one is pulled out. Same indexed read as
    // today.expireBid, except that mutation's bid is outside the window by
    // definition and this one is usually inside it, so it has to be skipped.
    let negTodayFirstAt = listing.negTodayFirstAt;
    if (stillToday && todayBid === 0) {
      negTodayFirstAt = 0;
    } else if (stillToday) {
      const cutoff = Date.now() - TODAY_WINDOW_MS;
      for await (const other of ctx.db
        .query("bids")
        .withIndex("by_listing_paidAt", (q) =>
          q.eq("listingId", listing._id).gt("paidAt", cutoff),
        )) {
        if (other._id === bid._id || other.reversed) continue;
        if (other.paidAt) negTodayFirstAt = -other.paidAt;
        break;
      }
    }

    // by_rank and by_today are both ranged on "> 0", so a listing zeroed here
    // leaves both boards without being deleted, and keeps its placement history
    // if someone pays for it again.
    await ctx.db.patch(listing._id, { totalBid, todayBid, negTodayFirstAt });

    await bumpBoardStats(ctx, {
      categorySlug: listing.categorySlug,
      total: -bid.amount,
      today: stillToday ? -bid.amount : 0,
      listings: listing.totalBid > 0 && totalBid === 0 ? -1 : 0,
      todayListings: stillToday && listing.todayBid > 0 && todayBid === 0 ? -1 : 0,
    });

    // No insert branch: with no siteStat row there was never any revenue to
    // take back. dailyStats is left alone on purpose, because a rollup is a
    // record of what happened on a day, not a running balance.
    const site = await ctx.db.query("siteStat").first();
    if (site) await ctx.db.patch(site._id, { revenue: Math.max(0, site.revenue - bid.amount) });

    return null;
  },
});

/* --------------------------------------------------------------- ticker -- */

const RANK_SCAN_LIMIT = MAX_PAGE * PAGE_SIZE;

/**
 * Absolute board ranks for a handful of listings, in ONE pass down `by_rank`
 * with an early exit. Convex cannot count an index range, and `for await` means
 * the read set covers only the prefix actually scanned, so a ticker full of
 * top-20 listings barely reads anything.
 *
 * ponytail: O(deepest rank) scan, capped at 4,000. Past ~5,000 listings swap
 * for @convex-dev/aggregate `indexOf(key)`, which is O(log n) and is the same
 * component that replaces the offset scan in board.page.
 */
async function ranksOf(ctx: QueryCtx, ids: Id<"listings">[]) {
  const wanted = new Set(ids);
  const out = new Map<Id<"listings">, number>();
  if (wanted.size === 0) return out;

  let rank = 0;
  for await (const listing of ctx.db
    .query("listings")
    .withIndex("by_rank", (q) => q.gt("totalBid", 0))
    .order("desc")) {
    rank += 1;
    if (wanted.delete(listing._id)) out.set(listing._id, rank);
    if (wanted.size === 0 || rank >= RANK_SCAN_LIMIT) break;
  }
  return out;
}

/** The activity ticker: "Foo took #3 for $118". Invalidated by a settle, which is the point. */
export const recentActivity = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 8 }) => {
    const bids = await ctx.db
      .query("bids")
      .withIndex("by_status_paidAt", (q) => q.eq("status", "paid"))
      .order("desc")
      .take(Math.min(Math.max(1, Math.floor(limit) || 1), 12));

    const listings = await Promise.all(
      bids.map((bid) => (bid.listingId ? ctx.db.get(bid.listingId) : null)),
    );
    const ranks = await ranksOf(
      ctx,
      listings.flatMap((listing) => (listing ? [listing._id] : [])),
    );

    return bids.flatMap((bid, i) => {
      const listing = listings[i];
      // A refunded or charged-back payment is not revenue, so it is not a ticker line.
      if (!listing || bid.reversed) return [];
      return [
        {
          bidId: bid._id,
          // The slug is what makes the strip's cards outbound links, through
          // /go/:slug like every other anchor on a board.
          slug: listing.slug,
          name: listing.name,
          iconUrl: listing.iconUrl,
          amount: bid.amount,
          totalAfter: bid.totalAfter,
          paidAt: bid.paidAt ?? bid._creationTime,
          rank: ranks.get(listing._id) ?? null, // null past the cap: render without "#N"
        },
      ];
    });
  },
});

/**
 * `/success` after Stripe redirects back. If the webhook has not landed yet this
 * returns `status: "pending"`, and the same live subscription flips it to
 * "paid" the instant `settle` commits. The page never polls.
 */
export const bySession = query({
  args: { checkoutId: v.string() },
  handler: async (ctx, { checkoutId }) => {
    const bid = await ctx.db
      .query("bids")
      .withIndex("by_checkoutId", (q) => q.eq("checkoutId", checkoutId))
      .unique();
    if (!bid) return null;

    const listing = bid.listingId ? await ctx.db.get(bid.listingId) : null;
    const ranks = await ranksOf(ctx, listing ? [listing._id] : []);

    return {
      status: bid.status,
      amount: bid.amount,
      totalAfter: bid.totalAfter,
      rank: listing ? (ranks.get(listing._id) ?? null) : null,
      listing:
        listing &&
        {
          id: listing._id,
          slug: listing.slug,
          name: listing.name,
          iconUrl: listing.iconUrl,
          url: listing.url,
          bid: listing.totalBid,
        },
    };
  },
});
