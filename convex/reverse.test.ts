/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { AppMeta } from "./schema";

// Same narrow glob as bids.test.ts: settle and reverse reach bids, board and
// today, and nothing else. Globbing ./**/*.ts would drag the "use node" Stripe
// bundle into the edge runtime for no gain.
const modules = {
  ...import.meta.glob("./_generated/*.js"),
  ...import.meta.glob("./{bids,board,today}.ts"),
};

const app: AppMeta = {
  appId: "1",
  slug: "alpha",
  name: "Alpha",
  iconUrl: "https://is1-ssl.mzstatic.com/1.png",
  screenshots: [],
  developer: "Test",
  price: 0,
  ratingCount: 0,
  genre: "Productivity",
  categorySlug: "productivity",
  url: "https://apps.apple.com/app/id1",
};

/** Everything the board, the rail and the revenue counter read, in one read. */
const ledger = (t: TestConvex<typeof schema>) =>
  t.run(async (ctx) => ({
    listing: await ctx.db.query("listings").withIndex("by_appId", (q) => q.eq("appId", "1")).unique(),
    all: await ctx.db.query("boardStats").withIndex("by_key", (q) => q.eq("key", "all")).unique(),
    category: await ctx.db
      .query("boardStats")
      .withIndex("by_key", (q) => q.eq("key", "productivity"))
      .unique(),
    revenue: (await ctx.db.query("siteStat").first())?.revenue ?? 0,
    refunded: await ctx.db
      .query("bids")
      .withIndex("by_paymentIntent", (q) => q.eq("paymentIntent", "pi_first"))
      .unique(),
  }));

/**
 * Stripe retries `charge.refunded` until it gets a 2xx, so three deliveries of
 * one refund must move the ledger once. The listing is raised before the refund
 * so the assertions catch a reversal that subtracts the wrong number as well as
 * one that subtracts it twice.
 */
test("a refunded payment is reversed exactly once across three replays", async () => {
  const t = convexTest(schema, modules);

  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    vi.setSystemTime(1_000_000);
    const first = await t.mutation(internal.bids.createPending, {
      appId: "1",
      amount: 5,
      snapshot: app,
    });
    await t.mutation(internal.bids.settle, { bidId: first, paymentIntent: "pi_first", country: "DE" });

    // A raise: charges the difference, keeps the placement.
    vi.setSystemTime(2_000_000);
    await t.mutation(internal.bids.settle, {
      bidId: await t.mutation(internal.bids.createPending, { appId: "1", amount: 4, snapshot: app }),
      paymentIntent: "pi_second",
    });

    for (let i = 0; i < 3; i++) {
      await t.mutation(internal.bids.reverse, { paymentIntent: "pi_first" });
    }

    const after = await ledger(t);
    expect(after.listing?.totalBid).toBe(4);
    expect(after.listing?.todayBid).toBe(4);
    // The reversed payment was the oldest live one, so the tiebreak moves to the raise.
    expect(after.listing?.negTodayFirstAt).toBe(-2_000_000);
    expect(after.revenue).toBe(4);
    expect(after.all).toMatchObject({ listingCount: 1, todayCount: 1, totalBid: 4, todayTotal: 4 });
    expect(after.category).toMatchObject({ listingCount: 1, todayCount: 1, totalBid: 4, todayTotal: 4 });
    expect(after.refunded?.reversed).toBe(true);
    expect(after.refunded?.country).toBe("DE");

    const board = await t.query(api.board.page, { window: "all", page: 1 });
    expect(board.total).toBe(1);
    expect(board.rows[0]?.bid).toBe(4);

    // settle scheduled today.expireBid for paidAt + 24h and nothing cancels it.
    // Reverse latched `expired`, so when it finally fires it is a no-op rather
    // than a second subtraction from the Today counters.
    await t.mutation(internal.today.expireBid, { bidId: first });
    expect(await ledger(t)).toEqual(after);

    // Reversing what is left empties the board without deleting the listing.
    await t.mutation(internal.bids.reverse, { paymentIntent: "pi_second" });
    const empty = await ledger(t);
    expect(empty.listing?.totalBid).toBe(0);
    expect(empty.revenue).toBe(0);
    expect(empty.all).toMatchObject({ listingCount: 0, todayCount: 0, totalBid: 0, todayTotal: 0 });
    expect((await t.query(api.board.page, { window: "all", page: 1 })).total).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
