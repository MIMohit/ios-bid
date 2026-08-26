import { query } from "./_generated/server";
import { CATEGORIES } from "./lib/categories";

/**
 * Every category with its running totals, for `/categories` and the rail.
 *
 * The counts come from `boardStats`, which is patched only when a listing joins
 * or leaves a board, so this is 27 single-document reads plus 27 single-row
 * index reads. No table scan, and the read set is exactly the rows that would
 * have to change for the answer to change.
 *
 * Categories with nothing on them still appear, at zero. The rail is a fixed
 * 27-item list, so a category vanishing when its last listing expires would
 * reflow the whole thing.
 */
export const totals = query({
  args: {},
  handler: async (ctx) =>
    Promise.all(
      CATEGORIES.map(async (category) => {
        const stats = await ctx.db
          .query("boardStats")
          .withIndex("by_key", (q) => q.eq("key", category.slug))
          .unique();
        const top = await ctx.db
          .query("listings")
          .withIndex("by_category_rank", (q) =>
            q.eq("categorySlug", category.slug).gt("totalBid", 0),
          )
          .order("desc")
          .first();

        return {
          slug: category.slug,
          listingCount: stats?.listingCount ?? 0,
          todayCount: stats?.todayCount ?? 0,
          totalBid: stats?.totalBid ?? 0,
          todayTotal: stats?.todayTotal ?? 0,
          topBid: top?.totalBid ?? 0,
          topName: top?.name ?? null,
          topIconUrl: top?.iconUrl ?? null,
        };
      }),
    ),
});
