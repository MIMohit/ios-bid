import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { counter, impressionKey, impressions } from "./clicks";

/** An open tab may beat as often as it likes; it writes at most twice a minute. */
const HEARTBEAT_MS = 30_000;

/**
 * Refresh one visitor's presence, and count the page view that produced the beat.
 *
 * Reads and writes only this visitor's row, so concurrent heartbeats conflict
 * with neither each other nor a settle. The presence table is read by exactly one
 * other function, the 20 second `syncCounters` cron: a heartbeat must never be
 * visible to a board, a rail, a ticker or the stats strip, because at 400 online
 * that is several pushes a second to every connected client, forever.
 *
 * `sid` arrives from the httpOnly `iosbid_sid` cookie by way of a guarded
 * httpAction, which is why this stays internal. Browser JavaScript cannot read
 * the cookie and cannot call this, so a click farm cannot mint visitors.
 */
export const touch = internalMutation({
  args: { sid: v.string(), day: v.string() },
  returns: v.null(),
  handler: async (ctx, { sid, day }) => {
    // Counted before the 30 second early return below, and outside it. That guard
    // exists to suppress presence writes, not to drop views, and the counter write
    // lands in the component's namespace where nothing subscribed can see it. One
    // beat is one view: the caller decides what a view is, this only counts them.
    await impressions.add(ctx, impressionKey(day), 1);

    const now = Date.now();
    const row = await ctx.db
      .query("presence")
      .withIndex("by_sid", (q) => q.eq("sid", sid))
      .unique();

    if (!row) {
      await ctx.db.insert("presence", { sid, lastSeen: now });
      await counter.add(ctx, "visitors", 1); // counted once, on first sighting
      return null;
    }

    if (now - row.lastSeen < HEARTBEAT_MS) return null; // no write, no invalidation
    await ctx.db.patch(row._id, { lastSeen: now });
    return null;
  },
});
