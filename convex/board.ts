import { v } from "convex/values";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { MAX_PAGE, MIN_BID, PAGE_SIZE, RAISE_STEP, priceForTop, priceToTake } from "./rules";

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
    // rank 1 is usually not the global #1, and only beating the global #1 buys
    // the rounded #1 price.
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
      priceForTop: priceForTop(topBid),
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
      priceForTop: priceForTop(topBid),
      topName: top?.name ?? null,
      topIconUrl: top?.iconUrl ?? null,
    };
  },
});

/**
 * How deep a place the amount control will name. Past this the place is reported
 * as unknown rather than read for.
 */
const PLACE_PROBE = 200;

/**
 * Where an amount lands on the board right now, plus the rungs on either side of
 * it. This is what makes the amount control a ladder instead of a dollar nudge:
 * minus walks down to the cheapest amount that still holds the place, then to
 * the cheapest amount that holds the next place down.
 *
 * Counted inside whichever board is on screen, because the rows beside the
 * heading are that board's. The figure is not: the price of #1 is global on
 * every board, so a category page names a category place at a global price.
 *
 * A null amount means "whatever the heading opens at", resolved here rather than
 * by the caller so a route loader can prefetch this alongside the board page
 * instead of waiting on it for the figure. That keeps the key the bid bar asks
 * for on its first render identical to the one the loader warmed, which is what
 * puts a rung under the first press of the minus control.
 *
 * ponytail: two documents answer the common case, since the amount on screen
 * starts above the top bid. Only dialling below it pays the PLACE_PROBE scan.
 * Swap that scan for @convex-dev/aggregate's offset lookup if deep places ever
 * need naming.
 */
export const place = query({
  args: {
    window: windowArg,
    categorySlug: v.optional(v.string()),
    amount: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    const { window, amount: asked } = args;
    const categorySlug =
      args.categorySlug && args.categorySlug !== "all" ? args.categorySlug : null;
    const bidOf = (l: Doc<"listings">) => (window === "today" ? l.todayBid : l.totalBid);
    const scan = async (limit: number) => {
      const listings = await boardScan(ctx, window, categorySlug).order("desc").take(limit);
      return listings.map(bidOf);
    };

    let limit = 2;
    let bids = await scan(limit);
    // One more document on a category board, and only when the caller asked for
    // the opening figure: that price is the global one even here.
    const globalTop = async () => {
      if (categorySlug === null) return bids[0] ?? 0;
      const top = await boardScan(ctx, window, null).order("desc").first();
      return top ? bidOf(top) : 0;
    };
    const amount = asked ?? priceForTop(await globalTop());
    if (bids.length === limit && (bids[0] ?? 0) >= amount) {
      limit = PLACE_PROBE + 2;
      bids = await scan(limit);
    }
    // A short read is the whole board. A full one may be hiding more below it,
    // and every "there is nothing cheaper" answer here turns on that.
    const truncated = bids.length === limit;

    // A tie loses: the older bid holds the place, so ahead of me is bid >= amount.
    const ahead = bids.filter((bid) => bid >= amount).length;
    const dearestAhead = bids[ahead - 1];
    const dearestBehind = bids[ahead];
    // Equal bids are one rung, not two: nothing can slot between them.
    const under =
      dearestBehind === undefined
        ? undefined
        : bids.slice(ahead).find((bid) => bid < dearestBehind);

    // The cheapest amount that beats `bid`. With no bid to beat the board has
    // bottomed out and MIN_BID is enough, unless the read stopped short, in
    // which case what is down there is simply not known.
    const rung = (bid: number | undefined) =>
      bid !== undefined ? bid + RAISE_STEP : truncated ? null : MIN_BID;

    return {
      /** The place this amount buys, null when the board runs deeper than the probe. */
      rank: dearestBehind !== undefined || !truncated ? ahead + 1 : null,
      /** The cheapest amount that still holds that place. */
      floor: rung(dearestBehind),
      /** The cheapest amount that holds the next place down, null at the bottom. */
      cheaper: dearestBehind === undefined ? null : rung(under),
      /** The cheapest amount that holds the next place up, null at #1. */
      dearer: dearestAhead === undefined ? null : dearestAhead + RAISE_STEP,
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

/**
 * The three cards that sit between rank 3 and rank 4 of a board.
 *
 * A separate query from `page` on purpose. The block shows the OTHER window's
 * leaders for the same scope, so an all-time board would otherwise have to run
 * `page` a second time for a window nobody is looking at, and `page` returns
 * fifty full rows including a rank-1 screenshot array. Six fields from three
 * documents is what the cards render, so six fields from three documents is
 * what this reads.
 *
 * `rank` is the position within this scope, so on a category board it is the
 * rank in that category. That is the number the card prints and the board the
 * "See all" link goes to, so the two agree.
 */
export const podium = query({
  args: { window: windowArg, categorySlug: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const categorySlug =
      args.categorySlug && args.categorySlug !== "all" ? args.categorySlug : null;

    const rows = await boardScan(ctx, args.window, categorySlug).order("desc").take(3);

    return rows.map((l, i) => ({
      id: l._id,
      slug: l.slug,
      name: l.name,
      subtitle: l.subtitle,
      iconUrl: l.iconUrl,
      rank: i + 1,
      bid: args.window === "today" ? l.todayBid : l.totalBid,
    }));
  },
});
