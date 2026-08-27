import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { TODAY_WINDOW_MS } from "./rules";

/** Undo a scope's today counters when a payment ages out. Mirror of bumpBoardStats. */
async function dropBoardStats(
  ctx: MutationCtx,
  opts: { categorySlug: string; amount: number; leftToday: boolean },
) {
  for (const key of ["all", opts.categorySlug]) {
    const row = await ctx.db
      .query("boardStats")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (!row) continue;
    await ctx.db.patch(row._id, {
      todayTotal: Math.max(0, row.todayTotal - opts.amount),
      todayCount: Math.max(0, row.todayCount - (opts.leftToday ? 1 : 0)),
    });
  }
}

/**
 * Age one payment out of the 24h window. Scheduled by `bids.settle` at
 * paidAt + 24h, transactionally with the settle itself.
 *
 * This mutation is the entire reason the Today board stays live. A rolling
 * window whose boundary is `Date.now()` writes nothing as it advances, and
 * Convex only re-runs a query when a document it read changes, so a read-time
 * window would leave every open tab showing a Today board that is correct on
 * load and then frozen until some unrelated payment happened to settle. Here
 * the window advancing IS a write to the listing, so the subscription fires at
 * the exact second the row drops off. No clock document, no tick cron, and
 * therefore no forced global repaint on a quiet night.
 *
 * The all-time total is deliberately untouched: a payment counts for a day on
 * the Today board and forever on the all-time board.
 */
export const expireBid = internalMutation({
  args: { bidId: v.id("bids") },
  returns: v.null(),
  handler: async (ctx, { bidId }) => {
    const bid = await ctx.db.get(bidId);
    // `expired` is the latch. A manual re-run, or a future batch drainer, is a no-op.
    if (!bid || bid.status !== "paid" || bid.expired || !bid.listingId) return null;
    await ctx.db.patch(bid._id, { expired: true });

    const listing = await ctx.db.get(bid.listingId);
    if (!listing) return null;

    const todayBid = Math.max(0, listing.todayBid - bid.amount);
    const cutoff = Date.now() - TODAY_WINDOW_MS;

    // The oldest payment still inside the window, in ONE indexed read, so the
    // "older bid keeps the higher rank" tiebreak stays exact after a drop-off.
    // Pending bids have no paidAt and sort before every number, so .gt excludes
    // them; already-expired payments have paidAt <= cutoff by definition.
    const oldestLive =
      todayBid === 0
        ? null
        : await ctx.db
            .query("bids")
            .withIndex("by_listing_paidAt", (q) =>
              q.eq("listingId", listing._id).gt("paidAt", cutoff),
            )
            .first();

    await ctx.db.patch(listing._id, {
      todayBid,
      // by_today's range is todayBid > 0, so a zeroed listing leaves the Today
      // board without being deleted and this 0 never sorts anywhere visible.
      negTodayFirstAt: oldestLive?.paidAt ? -oldestLive.paidAt : 0,
    });

    await dropBoardStats(ctx, {
      categorySlug: listing.categorySlug,
      amount: bid.amount,
      leftToday: todayBid === 0,
    });
    return null;
  },
});
