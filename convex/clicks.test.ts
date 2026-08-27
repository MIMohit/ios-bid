/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import counterSchema from "../node_modules/@convex-dev/sharded-counter/src/component/schema";

// Narrow on purpose: the only module under test is clicks.ts. The sharded counter
// is a real Convex component, so its own schema and functions have to be
// registered separately or `counter.add` has nothing to write to.
const modules = {
  ...import.meta.glob("./_generated/*.js"),
  ...import.meta.glob("./clicks.ts"),
};
// The component's TypeScript sources, not its published `dist`: the built files
// import each other without a `.js` extension, which is not resolvable ESM, and
// only the source tree goes through Vite's resolver. Both spellings of each key
// are registered because convex-test matches an import against them literally.
const counterModules = Object.fromEntries(
  Object.entries(
    import.meta.glob("../node_modules/@convex-dev/sharded-counter/src/component/**/*.ts"),
  ).flatMap(([path, load]) => [
    [path, load],
    [path.replace(/\.ts$/, ""), load],
    [path.replace(/\.ts$/, ".js"), load],
  ]),
);

const listing = {
  appId: "1",
  slug: "app",
  name: "App",
  iconUrl: "https://is1-ssl.mzstatic.com/1.png",
  screenshots: [],
  developer: "Test",
  price: 0,
  ratingCount: 0,
  genre: "Productivity",
  categorySlug: "productivity",
  url: "https://apps.apple.com/app/id1",
  totalBid: 5,
  negFirstBidAt: -1,
  todayBid: 5,
  negTodayFirstAt: -1,
  firstBidAt: 1,
  lastBidAt: 1,
};

/**
 * The two filters that cannot be enforced at the edge, because both need the
 * database. Everything else about a tap is a header check in /go/:slug.
 */
test("a tap counts once per sid per listing per day, and 60 times per sid per day", async () => {
  const t = convexTest(schema, modules);
  t.registerComponent("shardedCounter", counterSchema, counterModules);

  const ids = await t.run(async (ctx) =>
    Promise.all(
      Array.from({ length: 62 }, (_, i) =>
        ctx.db.insert("listings", { ...listing, appId: `${i}`, slug: `app-${i}` }),
      ),
    ),
  );
  const [first] = ids;
  if (!first) throw new Error("no listings inserted");

  const tap = (listingId: (typeof ids)[number], sid: string, day: string) =>
    t.mutation(internal.clicks.track, { listingId, sid, day });

  expect(await tap(first, "a", "2026-08-26")).toBe(true);
  expect(await tap(first, "a", "2026-08-26")).toBe(false); // same sid, same day
  expect(await tap(first, "b", "2026-08-26")).toBe(true); // different visitor
  expect(await tap(first, "a", "2026-08-27")).toBe(true); // the next day

  // Counted taps only: the two rejects above cost sid "a" nothing on 08-26.
  let counted = 1;
  for (const id of ids.slice(1)) {
    if (await tap(id, "a", "2026-08-26")) counted += 1;
  }
  expect(counted).toBe(60);

  // The counter is cumulative and never resets: sid a on both days plus sid b,
  // with the same-day duplicate rejected before it reached the counter.
  const totals = await t.query(api.clicks.forListings, { listingIds: [first] });
  expect(totals[first]).toBe(3);
});
