import { paginationOptsValidator, type PaginationResult } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { counter, impressionKey, impressions } from "./clicks";
import { ensureSiteStat } from "./maintenance";

const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC, because every day boundary on this deployment is UTC. */
const utcDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** Presence older than this is not online. Matches nothing else; it is a display. */
const ONLINE_WINDOW_MS = 5 * 60_000;

/** The number is rendered, not billed on. Stop counting rather than scan forever. */
const ONLINE_SCAN_LIMIT = 20_000;

const ROLLUP_BATCH = 100;

/**
 * The header strip and the revenue counter, from exactly two documents.
 *
 * `online` and `visitors` are plain fields maintained by the cron below, not a
 * `presence` range read: at 400 concurrent visitors a range read would re-push
 * this to every connected client several times a second, forever.
 *
 * It does re-run on a settle, because `siteStat.revenue` and the `"all"` board
 * count both move then. That is wanted, and is recorded here so nobody fixes it.
 */
export const strip = query({
  args: {},
  handler: async (ctx) => {
    const site = await ctx.db.query("siteStat").first();
    const all = await ctx.db
      .query("boardStats")
      .withIndex("by_key", (q) => q.eq("key", "all"))
      .unique();
    return {
      online: site?.onlineCount ?? 0,
      visitors: site?.visitors ?? 0,
      revenue: site?.revenue ?? 0,
      listingCount: all?.listingCount ?? 0,
      // 0 until internal.maintenance.init or the first cron tick lands. The strip
      // renders no launch line at 0 rather than claiming the epoch.
      launchedAt: site?.launchedAt ?? 0,
    };
  },
});

/** The /stats table: one site-wide row per day, newest first. */
export const daily = query({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, { days = 30 }) => {
    const span = Math.min(Math.max(1, Math.trunc(days)), 180);
    const now = Date.now();
    const dayList = Array.from({ length: span }, (_, i) => utcDay(now - i * DAY_MS));

    // One point read per day against the exact index tuple, in parallel. A range
    // read over `by_day_listing` would drag in every per-listing row too.
    const rows = await Promise.all(
      dayList.map((day) =>
        ctx.db
          .query("dailyStats")
          .withIndex("by_day_listing", (q) =>
            q.eq("day", day).eq("listingId", undefined),
          )
          .unique(),
      ),
    );

    return dayList.map((day, i) => {
      const row = rows[i];
      return {
        day,
        clicks: row?.clicks ?? 0,
        revenue: row?.revenue ?? 0,
        bidCount: row?.bidCount ?? 0,
        impressions: row?.impressions ?? 0,
      };
    });
  },
});

/**
 * Drains the visitor counter and recounts presence into `siteStat`. The only
 * function that reads the `presence` table, which is what keeps heartbeats out of
 * every subscribed query.
 *
 * The comparison before the patch is the whole point. A patch with identical
 * values still writes the document and still invalidates every subscriber, so
 * without it the stats strip repaints every 20 seconds forever.
 */
export const syncCounters = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const site = await ensureSiteStat(ctx);

    const cutoff = Date.now() - ONLINE_WINDOW_MS;
    let online = 0;
    for await (const _ of ctx.db
      .query("presence")
      .withIndex("by_lastSeen", (q) => q.gt("lastSeen", cutoff))) {
      if (++online >= ONLINE_SCAN_LIMIT) break;
    }

    const visitors = await counter.count(ctx, "visitors");
    if (online === site.onlineCount && visitors === site.visitors) return null;
    await ctx.db.patch(site._id, { onlineCount: online, visitors });
    return null;
  },
});

/**
 * Yesterday's numbers, at 00:10 UTC. An action rather than a mutation because
 * 1,500 listings times 4 shards is 6,000 reads and 1,500 writes with a read set
 * covering the whole listings table, which is one transaction's entire budget.
 */
export const rollupDay = internalAction({
  args: { day: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const day = args.day ?? utcDay(Date.now() - DAY_MS);
    let cursor: string | null = null;
    do {
      // Annotated, not inferred: this action's type feeds _generated/api, which
      // feeds internal.stats.listingsPage, which feeds this line. TS7022 otherwise.
      const batch: PaginationResult<Doc<"listings">> = await ctx.runQuery(
        internal.stats.listingsPage,
        {
          paginationOpts: { numItems: ROLLUP_BATCH, cursor },
        },
      );
      await ctx.runMutation(internal.stats.rollupBatch, {
        day,
        listingIds: batch.page.map((l): Id<"listings"> => l._id),
      });
      cursor = batch.isDone ? null : batch.continueCursor;
    } while (cursor);

    // After the per-listing rows exist, because it sums them.
    await ctx.runMutation(internal.stats.rollupSiteDay, { day });
    return null;
  },
});

/** The one place cursors are the right tool: walk every listing, order irrelevant. */
export const listingsPage = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: (ctx, { paginationOpts }) => ctx.db.query("listings").paginate(paginationOpts),
});

/**
 * One batch of per-listing tap rollups. The counter is cumulative, so a day's taps
 * are `cumulative(today) - cumulative(yesterday)`, which is why the row stores
 * both numbers. Re-running the same day recomputes the same delta from the same
 * stored cumulative, so the whole rollup is idempotent.
 */
export const rollupBatch = internalMutation({
  args: { day: v.string(), listingIds: v.array(v.id("listings")) },
  returns: v.null(),
  handler: async (ctx, { day, listingIds }) => {
    const prevDay = utcDay(Date.parse(`${day}T00:00:00Z`) - DAY_MS);
    for (const listingId of listingIds) {
      // Reads all four shards, so it contends with taps on this listing. That is
      // fine once a day at 00:10 UTC and is why the rollup is not more frequent.
      const cumulativeClicks = await counter.count(ctx, listingId);
      const prev = await ctx.db
        .query("dailyStats")
        .withIndex("by_day_listing", (q) => q.eq("day", prevDay).eq("listingId", listingId))
        .unique();
      const clicks = Math.max(0, cumulativeClicks - (prev?.cumulativeClicks ?? 0));

      // Most listings get no taps on most days. Writing those rows would add a row
      // per listing per day of nothing and invalidate /stats for no reason.
      if (clicks === 0) continue;

      const existing = await ctx.db
        .query("dailyStats")
        .withIndex("by_day_listing", (q) => q.eq("day", day).eq("listingId", listingId))
        .unique();
      if (existing) await ctx.db.patch(existing._id, { clicks, cumulativeClicks });
      else await ctx.db.insert("dailyStats", { day, listingId, clicks, cumulativeClicks });
    }
    return null;
  },
});

/**
 * The one `listingId`-less row per day. Revenue and payment count come from a
 * range read on `bids.by_status_paidAt`; site-wide taps are the sum of the
 * per-listing rows `rollupBatch` has just written, which costs no second counter
 * and no extra write on the click path; impressions are a single counter read,
 * because that counter's key already carries the day.
 */
export const rollupSiteDay = internalMutation({
  args: { day: v.string() },
  returns: v.null(),
  handler: async (ctx, { day }) => {
    const start = Date.parse(`${day}T00:00:00Z`);
    const end = start + DAY_MS;

    let revenue = 0;
    let bidCount = 0;
    for await (const bid of ctx.db
      .query("bids")
      .withIndex("by_status_paidAt", (q) =>
        q.eq("status", "paid").gte("paidAt", start).lt("paidAt", end),
      )) {
      revenue += bid.amount;
      bidCount += 1;
    }

    let clicks = 0;
    for await (const row of ctx.db
      .query("dailyStats")
      .withIndex("by_day_listing", (q) => q.eq("day", day))) {
      if (row.listingId === undefined) continue; // this row itself, on a re-run
      clicks += row.clicks;
    }

    const impressionCount = await impressions.count(ctx, impressionKey(day));

    const prev = await ctx.db
      .query("dailyStats")
      .withIndex("by_day_listing", (q) =>
        q.eq("day", utcDay(start - DAY_MS)).eq("listingId", undefined),
      )
      .unique();
    // A genuine running total, and idempotent: a re-run recomputes it from the same
    // previous day's row and the same recomputed `clicks`.
    const cumulativeClicks = (prev?.cumulativeClicks ?? 0) + clicks;

    const fields = {
      day,
      clicks,
      cumulativeClicks,
      revenue,
      bidCount,
      impressions: impressionCount,
    };
    const existing = await ctx.db
      .query("dailyStats")
      .withIndex("by_day_listing", (q) => q.eq("day", day).eq("listingId", undefined))
      .unique();
    // A day where nothing at all happened is a row of zeros, and `daily` already
    // reads a missing row as zeros. Do not write it.
    if (!existing && clicks === 0 && revenue === 0 && bidCount === 0 && impressionCount === 0) {
      return null;
    }
    if (existing) await ctx.db.patch(existing._id, fields);
    else await ctx.db.insert("dailyStats", fields);
    return null;
  },
});
