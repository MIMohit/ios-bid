import { ShardedCounter } from "@convex-dev/sharded-counter";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { internalMutation, query } from "./_generated/server";
import { PAGE_SIZE } from "./rules";

/**
 * Every counter on the site lives in one component namespace. Keys are:
 *   - an `Id<"listings">`, one per listing, counting outbound taps
 *   - `"visitors"`, the all-time unique-sid count
 *   - `impressionKey(day)`, one per UTC day (see `impressions` below)
 *
 * Four shards per listing is plenty of write throughput for human-paced taps and
 * keeps a 50 row page at 50 * 4 = 200 document reads instead of 800. `visitors`
 * is the one hot fixed key, so it gets 16.
 *
 * ponytail: raise `defaultShards` only if a single listing sustains several taps
 * a second. Reads scale with it, and reads are what the board page pays for.
 */
export const counter = new ShardedCounter<string>(components.shardedCounter, {
  defaultShards: 4,
  shards: { visitors: 16 },
});

/**
 * The impression counter. Same component, more shards, separate instance because
 * its key carries the day and so can never be named in the `shards` map above,
 * which matches on the exact key string. `shards` is passed per `add` call, and
 * `count` reads whatever shards exist, so a second instance is the whole trick.
 *
 * It needs the shards: this is bumped on every heartbeat, which is the highest
 * rate write on the deployment.
 */
export const impressions = new ShardedCounter<string>(components.shardedCounter, {
  defaultShards: 16,
});

/** One counter key per UTC day, so a day's impressions are a read, not a diff. */
export const impressionKey = (day: string): string => `impressions:${day}`;

/** A scripted client holding one real cookie cannot count more than this a day. */
const CLICKS_PER_SID_PER_DAY = 60;

/** Dedupe rows outlive the UTC day they guard, in any timezone, then get swept. */
const DEDUPE_TTL_MS = 48 * 60 * 60 * 1000;

/**
 * Count one outbound tap. Returns whether it counted, so `/go/:slug` can log the
 * rejects while still redirecting either way.
 *
 * The cheap bot filters (user agent, prefetch headers, sec-fetch-*) run at the
 * edge, where the headers are. The two that cannot be spoofed away run here,
 * because they need the database: per (sid, listing, day) dedupe, and a daily
 * cap per sid. `sid` comes from an httpOnly cookie the page cannot mint.
 */
export const track = internalMutation({
  args: { listingId: v.id("listings"), sid: v.string(), day: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { listingId, sid, day }) => {
    const key = `${sid}:${listingId}:${day}`;
    const seen = await ctx.db
      .query("clickDedupe")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (seen) return false;

    // The daily budget rides in the same table as a row whose key has an empty
    // listing segment. Two row shapes in one table beats a second table plus a
    // second sweeper for a value that expires in 48 hours either way.
    const budgetKey = `${sid}::${day}`;
    const budget = await ctx.db
      .query("clickDedupe")
      .withIndex("by_key", (q) => q.eq("key", budgetKey))
      .unique();
    const spent = budget?.count ?? 0;
    if (spent >= CLICKS_PER_SID_PER_DAY) return false;

    const expiresAt = Date.now() + DEDUPE_TTL_MS;
    if (budget) await ctx.db.patch(budget._id, { count: spent + 1, expiresAt });
    else await ctx.db.insert("clickDedupe", { key: budgetKey, expiresAt, count: 1 });
    await ctx.db.insert("clickDedupe", { key, expiresAt, count: 1 });

    // Writes one shard document in the component's namespace. It does not touch
    // the listing, so a tap invalidates no board, no ticker and no rail.
    await counter.add(ctx, listingId, 1);
    return true;
  },
});

/**
 * Tap totals for the listings on one page: one subscription, one transaction,
 * 200 document reads resolved in parallel.
 *
 * `Promise.all` is load bearing. Fifty sequential awaits inside one transaction
 * serialise fifty storage round trips against a 1 second user-code budget; in
 * parallel they land in a few milliseconds.
 *
 * This is deliberately NOT part of `api.board.page`, and `clicks` is deliberately
 * not a field on `listings`. `counter.count` takes a read dependency on every
 * shard it reads, so folding it into the board query would make one outbound tap
 * anywhere recompute every open board, rail and ticker on the site. Kept apart,
 * a tap repaints one number in place and never reorders a row.
 *
 * `estimateCount` would read one shard instead of four, at a 4x error. Wrong
 * trade for a figure the page prints as an exact number.
 */
export const forListings = query({
  args: { listingIds: v.array(v.id("listings")) },
  returns: v.record(v.string(), v.number()),
  handler: async (ctx, { listingIds }) => {
    const ids = listingIds.slice(0, PAGE_SIZE); // hard bound on the read set
    const counts = await Promise.all(ids.map((id) => counter.count(ctx, id)));
    return Object.fromEntries(ids.map((id, i) => [id, counts[i] ?? 0]));
  },
});
