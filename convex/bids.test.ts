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
