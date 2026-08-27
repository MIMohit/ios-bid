import {
  createFileRoute,
  notFound,
  stripSearchParams,
  useRouter,
} from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { z } from "zod";
import { api } from "@convex/_generated/api";
import { MIN_BID } from "@convex/rules";
import { Board } from "~/components/board/Board";
import { CategoryRail } from "~/components/board/CategoryRail";
import { Pagination } from "~/components/board/Pagination";
import { SpotlightPanel } from "~/components/board/SpotlightPanel";
import { BidBar } from "~/components/bid/BidBar";
import { Footer } from "~/components/chrome/Footer";
import { Header } from "~/components/chrome/Header";
import { StatsStrip } from "~/components/chrome/StatsStrip";
import { ConnectionState } from "~/components/ConnectionState";
import { RevenueCounter } from "~/components/RevenueCounter";
import { Testimonials } from "~/components/Testimonials";
import { money } from "~/lib/format";
import { boardItemList, breadcrumbList } from "~/lib/jsonld-board";
import { boardCanonical, pageHead, pageRange } from "~/lib/seo";

const searchSchema = z.object({ page: z.coerce.number().int().min(1).catch(1) });

export const Route = createFileRoute("/today")({
  validateSearch: searchSchema,
  // Page 1 is the default, so `?page=1` never appears in a URL this site emits
  // and the bare path is never rewritten to carry it. Without this the router
  // 307s "/" to "/?page=1", which is the canonical URL redirecting away from
  // itself on the site's most important page.
  search: { middlewares: [stripSearchParams({ page: 1 })] },
  loaderDeps: ({ search: { page } }) => ({ page }),

  loader: async ({ context, deps }) => {
    const [board, categories] = await Promise.all([
      context.queryClient.ensureQueryData(
        convexQuery(api.board.page, { window: "today", page: deps.page }),
      ),
      context.queryClient.ensureQueryData(convexQuery(api.categories.totals, {})),
      context.queryClient.ensureQueryData(convexQuery(api.stats.strip, {})),
      context.queryClient.ensureQueryData(convexQuery(api.bids.recentActivity, {})),
      context.queryClient.ensureQueryData(convexQuery(api.board.podium, { window: "all" })),
    ]);

    if (deps.page > board.pageCount) throw notFound();

    // Sequential on purpose: the listing ids are only known after the board
    // resolves, and one pinned read timestamp covers both.
    await context.queryClient.ensureQueryData(
      convexQuery(api.clicks.forListings, { listingIds: board.rows.map((row) => row.id) }),
    );

    // What the whole board took in the last 24 hours, summed from the 27
    // category rows that are already in the cache. No extra read.
    const revenue = categories.reduce((sum, category) => sum + category.todayTotal, 0);
    return { board, revenue };
  },

  headers: () => ({ "cache-control": "public, s-maxage=15, stale-while-revalidate=300" }),

  head: ({ loaderData }) => {
    // Same guard as every other board route: undefined while pending, during
    // error rendering and on ssr:false. Unguarded it produces a blank <head>.
    if (!loaderData) return {};

    const { board, revenue } = loaderData;
    const top = board.rows[0];
    const { from, to } = pageRange(board);
    const canonical = boardCanonical("/today", board.page);
    const total = board.total.toLocaleString("en-US");

    const description = top
      ? `iOS apps ranked by what was spent in the last 24 hours. ${total} apps, ${money(revenue)} paid today, led by ${top.name} at ${money(top.bid)}. The window rolls continuously.`
      : `iOS apps ranked by what was spent in the last 24 hours. Nobody has paid in this window yet, so ${money(MIN_BID)} takes today's #1. The window rolls continuously.`;

    return pageHead({
      title:
        board.page > 1
          ? `Today, ranks ${from} to ${to} · iosrank.lol`
          : "Today's top iOS apps by bid · iosrank.lol",
      description,
      canonical,
      // A rolling window with nothing in it is thin content, and there are 27
      // more pages exactly like it. It flips back the moment somebody pays.
      noindex: board.total === 0,
      jsonld: [
        boardItemList(board.rows, {
          url: canonical,
          name: "iOS apps ranked by what was spent in the last 24 hours",
        }),
        breadcrumbList([
          { name: "Leaderboard", path: "/" },
          { name: "Today", path: "/today" },
        ]),
      ],
    });
  },

  component: Today,
});

function Today() {
  const { page } = Route.useSearch();
  const router = useRouter();

  const board = useSuspenseQuery(convexQuery(api.board.page, { window: "today", page })).data;
  const clicks = useSuspenseQuery(
    convexQuery(api.clicks.forListings, { listingIds: board.rows.map((row) => row.id) }),
  ).data;
  const activity = useSuspenseQuery(convexQuery(api.bids.recentActivity, {})).data;
  // The interlude between rank 3 and rank 4 shows the board this one is not.
  const podium = useSuspenseQuery(convexQuery(api.board.podium, { window: "all" })).data;
  const stats = useSuspenseQuery(convexQuery(api.stats.strip, {})).data;
  const categories = useSuspenseQuery(convexQuery(api.categories.totals, {})).data;

  const top = board.rows[0]?.rank === 1 ? board.rows[0] : undefined;
  const { from, to } = pageRange(board);

  return (
    <>
      <Header window="today" hrefFor={(w) => (w === "all" ? "/" : "/today")} />
      <StatsStrip stats={stats} />
      <ConnectionState />

      <main>
        {top ? (
          <SpotlightPanel row={top} clicks={clicks[top.id] ?? 0}>
            <BidBar priceForTop={board.priceForTop} />
          </SpotlightPanel>
        ) : (
          <BidBar priceForTop={board.priceForTop} flat />
        )}

        <div className="page shell">
          <CategoryRail
            window="today"
            active={null}
            categories={categories}
            topBid={board.topBid}
          />

          <div>
            <Board
              rows={board.rows}
              clicks={clicks}
              activity={activity}
              podium={{
                heading: "All-time top ranking",
                href: "/",
                empty: "Nobody has bid yet.",
                rows: podium,
              }}
              heading="Today's ranking"
              caption={
                board.total === 0
                  ? `Nothing has been paid in the last 24 hours. ${money(MIN_BID)} takes today's #1.`
                  : board.page > 1
                    ? `Ranks ${from} to ${to} of ${board.total.toLocaleString("en-US")} iOS apps, ordered by what was paid in the last 24 hours.`
                    : `${board.total.toLocaleString("en-US")} iOS apps, ordered by what was paid in the last 24 hours. Each payment counts for a day from when it settled, then drops off.`
              }
              spotlighted={top !== undefined}
            />

            <Pagination
              page={board.page}
              pageCount={board.pageCount}
              total={board.total}
              pageSize={board.pageSize}
              hrefFor={(n) => (n === 1 ? "/today" : `/today?page=${n}`)}
              onRefresh={() => void router.invalidate()}
            />

            <RevenueCounter revenue={stats.revenue} launchedAt={stats.launchedAt} />
          </div>
        </div>

        <div className="page">
          <Testimonials />
          <Footer />
        </div>
      </main>
    </>
  );
}
