import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A visitor whose presence row is gone is counted as new again, so this is not a
 * cache TTL: it is how long a returning visitor stays the same visitor. At a
 * month, cookie churn has already made recounting the honest answer.
 */
const PRESENCE_TTL_MS = 30 * DAY_MS;

/** Stripe expires a checkout session within 24h. Past that a pending bid is dead. */
const PENDING_TTL_MS = 26 * 60 * 60 * 1000;

const DAILY_STATS_TTL_MS = 180 * DAY_MS;

/**
 * Per category, per run. The sweeper is hourly, so a backlog drains within hours
 * and one run can never approach the 16,000 document write limit.
 *
 * ponytail: fixed batch. If a category ever fails to drain, raise the interval
 * before the batch; the batch size is the transaction budget, the interval is not.
 */
const BATCH = 500;

/**
 * The singleton row behind the revenue counter and the stats strip. Created here
 * rather than in a migration because there is no migration step, and lazily
 * rather than eagerly because a query cannot write.
 *
 * Two concurrent callers cannot both insert: `.first()` with no index takes a read
 * dependency on the whole table, so the second transaction conflicts and retries
 * onto the row the first one committed.
 *
 * Called by `internal.bids.settle` (W1) before it adds to `revenue`, and by the
 * 20 second cron so the strip reads real numbers before the first bid lands.
 */
export async function ensureSiteStat(ctx: MutationCtx): Promise<Doc<"siteStat">> {
  const existing = await ctx.db.query("siteStat").first();
  if (existing) return existing;

  const id = await ctx.db.insert("siteStat", {
    launchedAt: Date.now(),
    revenue: 0,
    visitors: 0,
    onlineCount: 0,
  });
  const created = await ctx.db.get(id);
  if (!created) throw new Error("siteStat disappeared inside its own transaction");
  return created;
}

/**
 * One-shot bootstrap, run by hand at deploy: `npx convex run maintenance:init`.
 * It exists because `ensureSiteStat` is a plain function and the CLI can only call
 * registered functions, and because running it at deploy is what makes
 * `launchedAt` the launch rather than whenever the first visitor showed up.
 */
export const init = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ensureSiteStat(ctx);
    return null;
  },
});

/**
 * Hourly retention pass. Every table it touches is one that grows with traffic
 * rather than with the product, and none of them is read by a board, rail, ticker
 * or strip query, so a sweep is invisible to every open tab.
 */
export const sweep = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();

    const stale = await ctx.db
      .query("presence")
      .withIndex("by_lastSeen", (q) => q.lt("lastSeen", now - PRESENCE_TTL_MS))
      .take(BATCH);
    for (const row of stale) await ctx.db.delete(row._id);

    const expired = await ctx.db
      .query("clickDedupe")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now))
      .take(BATCH);
    for (const row of expired) await ctx.db.delete(row._id);

    // Marked failed, never deleted: a late webhook for a swept bid must still find
    // the row and settle it, and support needs the payment intent either way.
    // `for await` so the read set is only the prefix actually walked: on the usual
    // run where nothing is old enough, this reads one document and stops.
    let swept = 0;
    for await (const bid of ctx.db
      .query("bids")
      .withIndex("by_status_creation", (q) => q.eq("status", "pending"))) {
      if (now - bid._creationTime < PENDING_TTL_MS) break; // the index is oldest first
      await ctx.db.patch(bid._id, { status: "failed" });
      if (++swept >= BATCH) break;
    }

    const cutoffDay = new Date(now - DAILY_STATS_TTL_MS).toISOString().slice(0, 10);
    const old = await ctx.db
      .query("dailyStats")
      .withIndex("by_day_listing", (q) => q.lt("day", cutoffDay))
      .take(BATCH);
    for (const row of old) await ctx.db.delete(row._id);

    return null;
  },
});
