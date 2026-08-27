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

/**
 * `?page=` is a crawlable URL, so anything unparseable has to land on page 1
 * rather than throw. `.catch(1)` is what turns `?page=banana` into the board
 * instead of into the error boundary.
 */
const searchSchema = z.object({ page: z.coerce.number().int().min(1).catch(1) });

export const Route = createFileRoute("/")({
  validateSearch: searchSchema,
  // Page 1 is the default, so `?page=1` never appears in a URL this site emits
  // and the bare path is never rewritten to carry it. Without this the router
  // 307s "/" to "/?page=1", which is the canonical URL redirecting away from
  // itself on the site's most important page.
  search: { middlewares: [stripSearchParams({ page: 1 })] },
  loaderDeps: ({ search: { page } }) => ({ page }),

  loader: async ({ context, deps }) => {
    const [board] = await Promise.all([
      context.queryClient.ensureQueryData(
        convexQuery(api.board.page, { window: "all", page: deps.page }),
      ),
      context.queryClient.ensureQueryData(convexQuery(api.stats.strip, {})),
      context.queryClient.ensureQueryData(convexQuery(api.bids.recentActivity, {})),
      context.queryClient.ensureQueryData(convexQuery(api.categories.totals, {})),
    ]);

    // A page past the end is a real 404, not an empty board. An unbounded
    // `?page=` space serving 200s is a crawl trap, and every one of those URLs
    // would be a thin page we asked Google to index.
    if (deps.page > board.pageCount) throw notFound();

    // Second, and sequential on purpose: the listing ids are only known once the
    // board has resolved. The server's ConvexHttpClient pins one read timestamp
    // for the whole request, so the two reads cannot disagree about which
    // listings are on this page.
    await context.queryClient.ensureQueryData(
      convexQuery(api.clicks.forListings, { listingIds: board.rows.map((row) => row.id) }),
    );

    return board;
  },

  headers: () => ({ "cache-control": "public, s-maxage=15, stale-while-revalidate=300" }),

  head: ({ loaderData }) => {
    // THE GUARD. `loaderData` is undefined while the loader is pending, during
    // error rendering and on any ssr:false route. An unguarded `loaderData.rows[0]`
    // throws inside head generation and ships a blank <head>, which silently
    // deletes the entire SEO surface of the page. Falling through to the root's
    // title and description is the correct failure.
    if (!loaderData) return {};

    const board = loaderData;
    const top = board.rows[0];
    const { from, to } = pageRange(board);
    const canonical = boardCanonical("/", board.page);
    const total = board.total.toLocaleString("en-US");

    if (board.page > 1) {
      return pageHead({
        title: `iOS apps ranked ${from} to ${to} by bid · iosrank.lol`,
        description: `Ranks ${from} to ${to} of ${total} iOS apps on iosrank.lol, ordered by total paid. Claiming rank ${from} costs ${money(top?.priceToTake ?? MIN_BID)}.`,
        canonical,
        jsonld: [
          boardItemList(board.rows, {
            url: canonical,
            name: `iOS apps ranked ${from} to ${to} by bid`,
          }),
          breadcrumbList([
            { name: "Leaderboard", path: "/" },
            { name: `Page ${board.page}`, path: `/?page=${board.page}` },
          ]),
        ],
      });
    }

    return pageHead({
      title: "iosrank.lol · the pay-to-rank iOS app leaderboard",
      description: top
        ? `${total} iOS App Store apps ranked only by what was paid for the spot. #1 is ${top.name} at ${money(top.bid)}. Taking #1 costs ${money(board.priceForTop)}. Every listing is a paid placement.`
        : `iOS App Store apps ranked only by what was paid for the spot. Nobody has bid yet, so ${money(MIN_BID)} takes #1. Every listing is a paid placement.`,
      canonical,
      // Exactly one node here. The root already emits Organization and WebSite,
      // and scripts/check-seo.sh asserts the homepage carries exactly three
      // application/ld+json blocks.
      jsonld: [
        boardItemList(board.rows, {
          url: canonical,
          name: "iOS apps ranked by what was paid for the spot",
        }),
      ],
    });
  },

  component: Home,
});

function Home() {
  const { page } = Route.useSearch();
  const router = useRouter();

  // useSuspenseQuery, never useQuery. useQuery does not suspend, so on the
  // server it renders its loading branch into the HTML and the board never
  // reaches a crawler. Every one of these is already in the cache from the
  // loader, so none of them suspends in practice.
  const board = useSuspenseQuery(convexQuery(api.board.page, { window: "all", page })).data;
  const clicks = useSuspenseQuery(
    convexQuery(api.clicks.forListings, { listingIds: board.rows.map((row) => row.id) }),
  ).data;
  const activity = useSuspenseQuery(convexQuery(api.bids.recentActivity, {})).data;
  const stats = useSuspenseQuery(convexQuery(api.stats.strip, {})).data;
  const categories = useSuspenseQuery(convexQuery(api.categories.totals, {})).data;

  // The spotlight is the real rank 1, so it appears on page 1 and nowhere else.
  const top = board.rows[0]?.rank === 1 ? board.rows[0] : undefined;
  const { from, to } = pageRange(board);

  return (
    <>
      <Header window="all" hrefFor={(w) => (w === "all" ? "/" : "/today")} />
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
            window="all"
            active={null}
            categories={categories}
            topBid={board.topBid}
          />

          <div>
            <Board
              rows={board.rows}
              clicks={clicks}
              activity={activity}
              heading="All-time leaderboard"
              caption={
                board.total === 0
                  ? `Nobody has bid yet. ${money(MIN_BID)} takes #1.`
                  : board.page > 1
                    ? `Ranks ${from} to ${to} of ${board.total.toLocaleString("en-US")} iOS apps, ordered by what was paid for the spot.`
                    : `${board.total.toLocaleString("en-US")} iOS apps, ordered by what was paid for the spot. Taking #1 costs ${money(board.priceForTop)}.`
              }
              spotlighted={top !== undefined}
            />

            <Pagination
              page={board.page}
              pageCount={board.pageCount}
              total={board.total}
              pageSize={board.pageSize}
              hrefFor={(n) => (n === 1 ? "/" : `/?page=${n}`)}
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
