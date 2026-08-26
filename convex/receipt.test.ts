/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import counterSchema from "../node_modules/@convex-dev/sharded-counter/src/component/schema";

// receipt.ts reads the tap counter, so the sharded counter component has to be
// registered here for the same reason it is in clicks.test.ts.
const modules = {
  ...import.meta.glob("./_generated/*.js"),
  ...import.meta.glob("./{clicks,receipt}.ts"),
};
const counterModules = Object.fromEntries(
  Object.entries(
    import.meta.glob("../node_modules/@convex-dev/sharded-counter/src/component/**/*.ts"),
  ).flatMap(([path, load]) => [
    [path, load],
    [path.replace(/\.ts$/, ""), load],
    [path.replace(/\.ts$/, ".js"), load],
  ]),
);

/** One listing, with the two rank keys spelled out because they are what is under test. */
const listing = (slug: string, totalBid: number, firstBidAt: number, categorySlug: string) => ({
  appId: slug,
  slug,
  name: slug,
  iconUrl: `https://is1-ssl.mzstatic.com/${slug}.png`,
  screenshots: [],
  developer: "Test",
  price: 0,
  ratingCount: 0,
  genre: categorySlug,
  categorySlug,
  url: `https://apps.apple.com/app/${slug}`,
  totalBid,
  negFirstBidAt: -firstBidAt,
  todayBid: 0,
  negTodayFirstAt: 0,
  firstBidAt,
  lastBidAt: firstBidAt,
});

/**
 * The receipt states a rank nobody stores, counted against the same compound key
 * the board sorts on. If this drifts, a buyer's share link claims a rank the
 * board does not agree with, which is the one thing the page exists to state.
 */
test("a receipt states the board's own rank, tiebreak included", async () => {
  const t = convexTest(schema, modules);
  t.registerComponent("shardedCounter", counterSchema, counterModules);

  await t.run(async (ctx) => {
    await ctx.db.insert("listings", listing("older", 100, 1, "productivity"));
    await ctx.db.insert("listings", listing("newer", 100, 2, "games"));
    await ctx.db.insert("listings", listing("cheaper", 50, 3, "productivity"));
    await ctx.db.insert("listings", listing("unpaid", 0, 0, "games"));
  });

  const receipt = async (slug: string) => t.query(api.receipt.forSlug, { slug });

  // Equal bids: the older one holds the higher rank.
  expect((await receipt("older"))?.row.rank).toBe(1);
  expect((await receipt("newer"))?.row.rank).toBe(2);
  expect((await receipt("cheaper"))?.row.rank).toBe(3);

  // Taking #1 costs the top bid plus $5, any other rank costs that rank plus $1,
  // priced against the GLOBAL top rather than against whatever is above you.
  expect((await receipt("older"))?.row.priceToTake).toBe(105);
  expect((await receipt("cheaper"))?.row.priceToTake).toBe(51);
  expect((await receipt("cheaper"))?.priceForTop).toBe(105);

  // "#1 in its category": nothing above it shares the category.
  expect((await receipt("newer"))?.leader).toBe(true);
  expect((await receipt("cheaper"))?.leader).toBe(false);

  // No payment, no receipt. This is what keeps /r/:slug from being a page per app.
  expect(await receipt("unpaid")).toBeNull();
  expect(await receipt("never-heard-of-it")).toBeNull();
});
