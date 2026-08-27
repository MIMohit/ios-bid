import { v } from "convex/values";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { MAX_PAGE, MIN_BID, PAGE_SIZE, TOP_STEP, priceToTake } from "./rules";

const windowArg = v.union(v.literal("all"), v.literal("today"));
type BoardWindow = "all" | "today";

/**
 * The ordered stream for one board scope. Four indexes, one shape: `window` and
 * `categorySlug` pick the index, everything above this function is identical.
 *
 * The Today branch needs no clock document and no tick cron. `todayBid` is a
 * denormalised total maintained by `internal.today.expireBid`, scheduled per
 * payment at paidAt + 24h, so the window advancing IS a write and every open
 * subscription drops the row the second it ages out. A read-time
 * `paidAt > Date.now() - 24h` scan would be the frozen-board trap: time passing
 * is not a write, so nothing would ever re-run the query.
 */
function boardScan(ctx: QueryCtx, window: BoardWindow, categorySlug: string | null) {
  if (window === "today") {
    return categorySlug
      ? ctx.db
          .query("listings")
          .withIndex("by_category_today", (q) =>
            q.eq("categorySlug", categorySlug).gt("todayBid", 0),
          )
      : ctx.db.query("listings").withIndex("by_today", (q) => q.gt("todayBid", 0));
  }
  return categorySlug
    ? ctx.db
        .query("listings")
        .withIndex("by_category_rank", (q) =>
          q.eq("categorySlug", categorySlug).gt("totalBid", 0),
        )
    : ctx.db.query("listings").withIndex("by_rank", (q) => q.gt("totalBid", 0));
}

/**
 * Only the fields a board row renders. There is no detail page to feed, so
 * nothing here is speculative.
 *
 * `screenshots` and `description` ride along on rank 1 only, because rank 1 is
 * the spotlight panel and ranks 2..50 are the uniform row. Sending them on
 * every row would put 300 unused URLs in every page payload.
 *
 * `clicks` is deliberately absent: tap counts arrive through
 * `api.clicks.forListings` as a separate subscription so a tap can never
 * invalidate the board.
 */
function toRow(l: Doc<"listings">, window: BoardWindow, rank: number, topBid: number) {
  const bid = window === "today" ? l.todayBid : l.totalBid;
  return {
    id: l._id,
    slug: l.slug,
    name: l.name,
    subtitle: l.subtitle,
    iconUrl: l.iconUrl,
    developer: l.developer,
    genre: l.genre,
    categorySlug: l.categorySlug,
    rating: l.rating,
    ratingCount: l.ratingCount,
    price: l.price,
    formattedPrice: l.formattedPrice,
    firstBidAt: l.firstBidAt,
    lastBidAt: l.lastBidAt,
    rank,
    bid,
    priceToTake: priceToTake(bid, topBid),
    screenshots: rank === 1 ? l.screenshots : [],
    description: rank === 1 ? l.description : undefined,
  };
}

/** The row contract W5 and W6 render against. Derived, never hand written. */
export type BoardRow = ReturnType<typeof toRow>;

/**
 * One page of a board. Page numbers, not cursors: `/?page=7` has to be a real
 * crawlable URL and the footer has to say "351 - 400 of 1,514". Cursors give
 * neither.
 *
 * ponytail: offset by over-reading. Convex has no .skip(), so page N reads
 * N*50 documents and keeps the last 50. MAX_PAGE caps that at 4,000 documents
 * (~8 MB with screenshots) against a 32,000 / 16 MiB budget. Past ~5,000
 * listings swap the over-read for @convex-dev/aggregate `at(offset)`, which
 * gives the page's first sort key in O(log n); nothing above boardScan changes.
 */
export const page = query({
  args: { window: windowArg, categorySlug: v.optional(v.string()), page: v.number() },
  handler: async (ctx, args) => {
    const page = Math.min(Math.max(1, Math.floor(args.page) || 1), MAX_PAGE);
    const categorySlug =
      args.categorySlug && args.categorySlug !== "all" ? args.categorySlug : null;
    const upto = page * PAGE_SIZE;

    // The GLOBAL top for this window, not the category's. A category board's
    // rank 1 is usually not the global #1, and only beating the global #1 costs
    // the +$5 step.
    const top = await boardScan(ctx, args.window, null).order("desc").first();
    const topBid = top ? (args.window === "today" ? top.todayBid : top.totalBid) : 0;

    // take(upto) stops the scan dead at upto, so page 1 puts 50 documents in the
    // read set. collect() would put the whole board there and make page 1
    // repaint on every change anywhere.
    const scanned = await boardScan(ctx, args.window, categorySlug).order("desc").take(upto);
    const slice = scanned.slice(upto - PAGE_SIZE);

    // Exact total from a maintained counter. A count scan would be the most
    // expensive part of the page and would read documents the page never shows.
    const stats = await ctx.db
      .query("boardStats")
      .withIndex("by_key", (q) => q.eq("key", categorySlug ?? "all"))
      .unique();
    const total = (args.window === "today" ? stats?.todayCount : stats?.listingCount) ?? 0;

    return {
      rows: slice.map((l, i) => toRow(l, args.window, upto - PAGE_SIZE + i + 1, topBid)),
      total,
      page,
      pageSize: PAGE_SIZE,
      pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      topBid,
      priceForTop: Math.max(MIN_BID, topBid + TOP_STEP),
    };
  },
});

/** The hero's "Claim #1 for $X". Two document reads, no page scan. */
export const pricing = query({
  args: { window: windowArg },
  handler: async (ctx, { window }) => {
    const top = await boardScan(ctx, window, null).order("desc").first();
    const topBid = top ? (window === "today" ? top.todayBid : top.totalBid) : 0;
    return {
      topBid,
      priceForTop: Math.max(MIN_BID, topBid + TOP_STEP),
      topName: top?.name ?? null,
      topIconUrl: top?.iconUrl ?? null,
    };
  },
});

/** `/go/:slug` resolves the outbound target and the id it counts the tap against. */
export const destination = query({
  args: { slug: v.string() },
  returns: v.union(v.object({ listingId: v.id("listings"), url: v.string() }), v.null()),
  handler: async (ctx, { slug }) => {
    const listing = await ctx.db
      .query("listings")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    return listing ? { listingId: listing._id, url: listing.url } : null;
  },
});
