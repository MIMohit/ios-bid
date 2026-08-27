import { query } from "./_generated/server";
import { CATEGORIES } from "./lib/categories";

/**
 * Everything /sitemap.xml needs, in about 29 document reads: the 27 category rows
 * of `boardStats` plus the newest paid bid.
 *
 * The gate is the point. A category URL with no listings on it is a thin page we
 * asked Google to crawl, so the sitemap emits `/category/:slug` only where
 * `listingCount > 0` and `/category/:slug/today` only where `todayCount > 0`.
 * Both numbers are already maintained on settle, so no listing is scanned here.
 */
export const sitemap = query({
  args: {},
  handler: async (ctx) => {
    const stats = await ctx.db.query("boardStats").collect(); // 28 rows at most
    const byKey = new Map(stats.map((s) => [s.key, s]));

    const categories = CATEGORIES.map((c) => {
      const row = byKey.get(c.slug);
      return {
        slug: c.slug,
        hasListings: (row?.listingCount ?? 0) > 0,
        hasToday: (row?.todayCount ?? 0) > 0,
      };
    });

    // Drives <lastmod> on the board URLs. The whole board is exactly as fresh as
    // its most recent settled payment.
    const latest = await ctx.db
      .query("bids")
      .withIndex("by_status_paidAt", (q) => q.eq("status", "paid"))
      .order("desc")
      .first();

    return { categories, lastBidAt: latest?.paidAt ?? 0 };
  },
});
