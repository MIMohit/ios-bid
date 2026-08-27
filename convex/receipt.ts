import { v } from "convex/values";
import { query } from "./_generated/server";
import { counter } from "./clicks";
import { MIN_BID, TOP_STEP, priceToTake } from "./rules";

/**
 * The data behind /r/:slug, the share target a buyer posts after paying.
 *
 * It is deliberately NOT a detail page query: no screenshots, no description,
 * nothing a second page about an app would need. What it returns is the row the
 * board already renders plus the two live numbers a receipt exists to prove,
 * the rank and the taps.
 */

/** Receipts in the sitemap. The board's own order, so the deepest are the cheapest to lose. */
const SITEMAP_MAX = 500;

/**
 * One listing's receipt, or null when there is nothing to receipt.
 *
 * `totalBid <= 0` is the gate that keeps this from being a page per App Store
 * app: a listing exists only once a payment settles, and an unpaid one has no
 * rank to show.
 */
export const forSlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const l = await ctx.db
      .query("listings")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!l || l.totalBid <= 0) return null;

    // Rank is counted, not stored, against the same key the board sorts on:
    // (totalBid, negFirstBidAt) descending, so a tie is held by the older bid.
    // Two ranges because that ordering is a compound key and "above me" is
    // "outbid me" OR "matched me first".
    //
    // ponytail: rank N reads N documents. The board page already reads up to
    // 4,000, so this is inside the established budget; swap both scans for
    // @convex-dev/aggregate's offset lookup if a deep receipt ever gets hot.
    const outbid = await ctx.db
      .query("listings")
      .withIndex("by_rank", (q) => q.gt("totalBid", l.totalBid))
      .collect();
    const matched = await ctx.db
      .query("listings")
      .withIndex("by_rank", (q) =>
        q.eq("totalBid", l.totalBid).gt("negFirstBidAt", l.negFirstBidAt),
      )
      .collect();

    const above = [...outbid, ...matched];
    const rank = above.length + 1;

    // The GLOBAL top bid, which is what makes taking #1 cost the +$5 step.
    // `outbid` already holds every listing above this one, so it is free.
    const topBid = outbid.reduce((max, other) => Math.max(max, other.totalBid), l.totalBid);

    return {
      // Shaped as a board row on purpose: /r/:slug renders the real BoardRow
      // component, so there is one row implementation on the site and a receipt
      // cannot drift from the board it is a receipt for.
      row: {
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
        url: l.url,
        firstBidAt: l.firstBidAt,
        lastBidAt: l.lastBidAt,
        rank,
        bid: l.totalBid,
        priceToTake: priceToTake(l.totalBid, topBid),
        // A receipt shows no gallery and no description. Both fields exist only
        // because the board row type carries them for the rank 1 panel.
        screenshots: [] as string[],
        description: undefined as string | undefined,
      },
      /** "No higher-ranked listing shares its category", the same rule the board applies. */
      leader: !above.some((other) => other.categorySlug === l.categorySlug),
      clicks: await counter.count(ctx, l._id),
      /** For the bid bar on the receipt: what taking the whole board costs right now. */
      priceForTop: Math.max(MIN_BID, topBid + TOP_STEP),
    };
  },
});

/**
 * Every receipt URL, for /sitemap.xml. Paid listings only, because that is what
 * a receipt is, and capped: past SITEMAP_MAX this needs a sitemap index rather
 * than a bigger read.
 */
export const slugs = query({
  args: {},
  handler: async (ctx) => {
    const listings = await ctx.db
      .query("listings")
      .withIndex("by_rank", (q) => q.gt("totalBid", 0))
      .order("desc")
      .take(SITEMAP_MAX);
    return listings.map((l) => ({ slug: l.slug, lastBidAt: l.lastBidAt }));
  },
});
