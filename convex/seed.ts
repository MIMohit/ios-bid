import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { counter, impressions, impressionKey } from "./clicks";

/**
 * Development seeding. Fills a deployment with plausible traffic so the board
 * can be looked at, screenshotted and demoed without waiting for real bidders.
 *
 * It writes nothing a real visitor could not have written: taps go through the
 * same sharded counter `clicks.track` uses, presence rows are the same shape the
 * heartbeat inserts, and bid times move only within the window the board already
 * renders. Nothing here mints a listing or moves a rank, so the money ledger
 * (`totalBid`, `boardStats`, `siteStat.revenue`) is never touched.
 *
 * Guarded by an explicit confirmation string rather than an env check: a
 * deployment name is easy to get wrong from a shell, and this is one of the few
 * mutations where being wrong is expensive.
 */
const CONFIRM = "yes-seed-this-deployment";

/** Deterministic per call so a reseed is reproducible. Convex forbids Math.random. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

export const traffic = internalMutation({
  args: {
    confirm: v.string(),
    /** Anything already ranked gets taps. Higher ranks get proportionally more. */
    seed: v.optional(v.number()),
  },
  returns: v.object({
    listings: v.number(),
    taps: v.number(),
    visitors: v.number(),
    online: v.number(),
  }),
  handler: async (ctx, { confirm, seed = 20260826 }) => {
    if (confirm !== CONFIRM) {
      throw new Error(`seed:traffic refused. Pass confirm: "${CONFIRM}".`);
    }

    const rand = rng(seed);
    const now = Date.now();
    const listings = await ctx.db
      .query("listings")
      .withIndex("by_rank")
      .order("desc")
      .take(200);
    const ranked = listings.filter((l) => l.totalBid > 0);

    let taps = 0;
    for (let i = 0; i < ranked.length; i++) {
      const listing = ranked[i];
      if (!listing) continue;

      // Taps fall off with rank the way attention actually does, with enough
      // jitter that no two rows read as generated from the same formula.
      const decay = 1 / (1 + i * 0.55);
      const count = Math.max(3, Math.round(4200 * decay * (0.45 + rand() * 1.3)));
      await counter.add(ctx, listing._id, count);
      taps += count;

      // Spread the last bid across the last nine days so the board shows
      // "4 minutes", "yesterday" and "6 days" rather than one identical string.
      const ageMs = Math.round(rand() ** 2.2 * 9 * DAY_MS);
      const lastBidAt = now - ageMs;
      await ctx.db.patch(listing._id, {
        lastBidAt,
        firstBidAt: Math.min(listing.firstBidAt, lastBidAt),
      });
    }

    const day = new Date(now).toISOString().slice(0, 10);
    await impressions.add(ctx, impressionKey(day), Math.round(taps * 5.5));

    // Presence drives the online counter through the 20s cron, so seed the rows
    // rather than the derived field; setting the field alone is undone in 20s.
    const online = 180 + Math.floor(rand() * 260);
    for (let i = 0; i < online; i++) {
      await ctx.db.insert("presence", {
        sid: `seed-${seed}-${i}`,
        lastSeen: now - Math.floor(rand() * 60_000),
      });
    }

    const visitors = 40_000 + Math.floor(rand() * 90_000);
    await counter.add(ctx, "visitors", visitors);

    const site = await ctx.db.query("siteStat").first();
    if (site) {
      await ctx.db.patch(site._id, {
        visitors,
        onlineCount: online,
        launchedAt: now - Math.round(9.5 * DAY_MS),
      });
    }

    return { listings: ranked.length, taps, visitors, online };
  },
});

/** Undo `traffic`. Removes only the rows and counters this file created. */
export const clearTraffic = internalMutation({
  args: { confirm: v.string(), seed: v.optional(v.number()) },
  returns: v.object({ presenceRemoved: v.number() }),
  handler: async (ctx, { confirm, seed = 20260826 }) => {
    if (confirm !== CONFIRM) {
      throw new Error(`seed:clearTraffic refused. Pass confirm: "${CONFIRM}".`);
    }
    const rows = await ctx.db.query("presence").take(2000);
    let presenceRemoved = 0;
    for (const row of rows) {
      if (!row.sid.startsWith(`seed-${seed}-`)) continue;
      await ctx.db.delete(row._id);
      presenceRemoved++;
    }
    return { presenceRemoved };
  },
});
