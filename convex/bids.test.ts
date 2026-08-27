/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { AppMeta } from "./schema";

// Narrow on purpose. convex-test imports every module in this glob, and the
// only ones the money path reaches are these three (settle schedules
// today.expireBid). Globbing ./**/*.ts would drag the "use node" Stripe bundle
// into the edge runtime for no gain. _generated is how convex-test locates the
// functions root, so it has to be in here too.
const modules = {
  ...import.meta.glob("./_generated/*.js"),
  ...import.meta.glob("./{bids,board,today}.ts"),
};

const app = (appId: string, slug: string): AppMeta => ({
  appId,
  slug,
  name: slug,
  iconUrl: `https://is1-ssl.mzstatic.com/${appId}.png`,
  screenshots: [],
  developer: "Test",
  price: 0,
  ratingCount: 0,
  genre: "Productivity",
  categorySlug: "productivity",
  url: `https://apps.apple.com/app/id${appId}`,
});

/**
 * Stripe retries `checkout.session.completed` until it gets a 2xx and replays
 * the same bidId every time. Three settles must charge the board once.
 */
test("a replayed webhook settles exactly once", async () => {
  const t = convexTest(schema, modules);

  const bidId = await t.mutation(internal.bids.createPending, {
    appId: "1",
    amount: 5,
    snapshot: app("1", "alpha"),
  });
  await t.mutation(internal.bids.settle, { bidId });
  await t.mutation(internal.bids.settle, { bidId });
  await t.mutation(internal.bids.settle, { bidId });

  const board = await t.query(api.board.page, { window: "all", page: 1 });
  expect(board.total).toBe(1);
  expect(board.rows).toHaveLength(1);
  expect(board.rows[0]?.bid).toBe(5);
});

/**
 * A dollar is a real bid. The heading advertises the top bid rounded up to the
 * next $5, but the board underneath is priced in single dollars, and the amount
 * alone decides the place. The ladder is what the amount control steps along:
 * `floor` still holds the place, `cheaper` is the next place down, `dearer` the
 * next place up.
 */
test("a dollar is a real bid, and the board names the place it buys", async () => {
  const t = convexTest(schema, modules);

  for (const [appId, slug, amount] of [
    ["1", "alpha", 100],
    ["2", "beta", 40],
  ] as const) {
    await t.mutation(internal.bids.settle, {
      bidId: await t.mutation(internal.bids.createPending, {
        appId,
        amount,
        snapshot: app(appId, slug),
      }),
    });
  }
  const place = (amount: number) => t.query(api.board.place, { window: "all", amount });

  // $105 on the heading, not $101, but $101 buys the same #1 and the minus
  // control walks straight to it.
  expect((await t.query(api.board.page, { window: "all", page: 1 })).priceForTop).toBe(105);
  expect(await place(105)).toEqual({ rank: 1, floor: 101, cheaper: 41, dearer: null });
  expect(await place(101)).toEqual({ rank: 1, floor: 101, cheaper: 41, dearer: null });

  // Matching the top bid does not pass it, so $100 is #2, not an error.
  expect(await place(100)).toEqual({ rank: 2, floor: 41, cheaper: 1, dearer: 101 });

  // And a single dollar lands at the bottom rather than being refused.
  expect(await place(1)).toEqual({ rank: 3, floor: 1, cheaper: null, dearer: 41 });
  expect(await t.query(api.bids.quote, { appId: "3", amount: 1 })).toMatchObject({
    newTotal: 1,
    charge: 1,
    isRaise: false,
  });
});

/**
 * Equal bids keep placement order: the older bid holds the higher rank. This
 * fails the moment anyone drops `negFirstBidAt`, because Convex indexes are
 * single-direction and a plain desc order on totalBid would tiebreak newest
 * first.
 */
test("two equal bids come back oldest first", async () => {
  const t = convexTest(schema, modules);

  // Only Date is faked. convex-test's own timers stay real.
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    vi.setSystemTime(1_000_000);
    await t.mutation(internal.bids.settle, {
      bidId: await t.mutation(internal.bids.createPending, {
        appId: "1",
        amount: 5,
        snapshot: app("1", "alpha"),
      }),
    });

    vi.setSystemTime(2_000_000);
    await t.mutation(internal.bids.settle, {
      bidId: await t.mutation(internal.bids.createPending, {
        appId: "2",
        amount: 5,
        snapshot: app("2", "beta"),
      }),
    });
  } finally {
    vi.useRealTimers();
  }

  const board = await t.query(api.board.page, { window: "all", page: 1 });
  expect(board.rows.map((row) => row.slug)).toEqual(["alpha", "beta"]);
});
