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
import { CATEGORIES } from "@convex/lib/categories";
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

const CATEGORY_NAME = new Map<string, string>(CATEGORIES.map((c) => [c.slug, c.name]));

const searchSchema = z.object({ page: z.coerce.number().int().min(1).catch(1) });

export const Route = createFileRoute("/category/$slug/")({
  validateSearch: searchSchema,
  // Page 1 is the default, so `?page=1` never appears in a URL this site emits
  // and the bare path is never rewritten to carry it. Without this the router
  // 307s "/" to "/?page=1", which is the canonical URL redirecting away from
  // itself on the site's most important page.
  search: { middlewares: [stripSearchParams({ page: 1 })] },
  loaderDeps: ({ search: { page } }) => ({ page }),

  loader: async ({ context, deps, params }) => {
    // 27 real slugs and nothing else. Without this every misspelling is a live
    // URL serving an empty board, which is an unbounded thin-page generator.
    const name = CATEGORY_NAME.get(params.slug);
    if (!name) throw notFound();

    const [board] = await Promise.all([
      context.queryClient.ensureQueryData(
        convexQuery(api.board.page, {
          window: "all",
          categorySlug: params.slug,
          page: deps.page,
        }),
      ),
      context.queryClient.ensureQueryData(convexQuery(api.categories.totals, {})),
      context.queryClient.ensureQueryData(convexQuery(api.stats.strip, {})),
      // The bid bar opens on the rounded price of #1. Warming the ladder under
      // it here is what makes the first press of a stepper land on a rung.
      context.queryClient.ensureQueryData(
        convexQuery(api.board.place, { window: "all", categorySlug: params.slug, amount: null }),
      ),
      context.queryClient.ensureQueryData(convexQuery(api.bids.recentActivity, {})),
      context.queryClient.ensureQueryData(
        convexQuery(api.board.podium, { window: "today", categorySlug: params.slug }),
      ),
    ]);

    if (deps.page > board.pageCount) throw notFound();

    // Sequential on purpose: the ids exist only after the board resolves.
    await context.queryClient.ensureQueryData(
      convexQuery(api.clicks.forListings, { listingIds: board.rows.map((row) => row.id) }),
    );

    return { board, name };
  },

  headers: () => ({ "cache-control": "public, s-maxage=15, stale-while-revalidate=300" }),

  head: ({ loaderData, params }) => {
    // Undefined while pending, during error rendering and on ssr:false. Reading
    // through it unguarded ships a blank <head>.
    if (!loaderData) return {};

    const { board, name } = loaderData;
    const top = board.rows[0];
    const { from, to } = pageRange(board);
    const path = `/category/${params.slug}`;
    const canonical = boardCanonical(path, board.page);
    const total = board.total.toLocaleString("en-US");

    return pageHead({
      title:
        board.page > 1
          ? `${name}, ranks ${from} to ${to} · iosrank.lol`
          : `${name} apps ranked by bid · iosrank.lol`,
      description: top
        ? `The ${total} highest paid ${name} apps on the iOS App Store leaderboard. #1 in ${name} is ${top.name} at ${money(top.bid)}, and claiming it costs ${money(top.priceToTake)}.`
        : `No ${name} app has been paid for yet on the iOS App Store leaderboard. ${money(MIN_BID)} takes #1 in ${name}.`,
      canonical,
      jsonld: [
        boardItemList(board.rows, {
          url: canonical,
          name: `${name} apps ranked by what was paid for the spot`,
        }),
        breadcrumbList([
          { name: "Leaderboard", path: "/" },
          { name: "Categories", path: "/categories" },
          { name, path },
        ]),
      ],
    });
  },

  component: CategoryBoard,
});

function CategoryBoard() {
  const { slug } = Route.useParams();
  const { page } = Route.useSearch();
  const { name } = Route.useLoaderData();
  const router = useRouter();

  const board = useSuspenseQuery(
    convexQuery(api.board.page, { window: "all", categorySlug: slug, page }),
  ).data;
  const clicks = useSuspenseQuery(
    convexQuery(api.clicks.forListings, { listingIds: board.rows.map((row) => row.id) }),
  ).data;
  const activity = useSuspenseQuery(convexQuery(api.bids.recentActivity, {})).data;
  // The interlude between rank 3 and rank 4 shows the board this one is not,
  // scoped to the same category so "See all" lands on a sibling board.
  const podium = useSuspenseQuery(
    convexQuery(api.board.podium, { window: "today", categorySlug: slug }),
  ).data;
  const stats = useSuspenseQuery(convexQuery(api.stats.strip, {})).data;
  const categories = useSuspenseQuery(convexQuery(api.categories.totals, {})).data;

  const top = board.rows[0]?.rank === 1 ? board.rows[0] : undefined;
  const { from, to } = pageRange(board);
  const path = `/category/${slug}`;

  return (
    <>
      {/* A category board keeps its slug when the window switches. */}
      <Header window="all" hrefFor={(w) => (w === "all" ? path : `${path}/today`)} />
      <StatsStrip stats={stats} />
      <ConnectionState />

      <main>
        {top ? (
          <SpotlightPanel row={top} clicks={clicks[top.id] ?? 0}>
            <BidBar priceForTop={board.priceForTop} categorySlug={slug} />
          </SpotlightPanel>
        ) : (
          <BidBar priceForTop={board.priceForTop} categorySlug={slug} flat />
        )}

        <div className="page shell">
          <CategoryRail
            window="all"
            active={slug}
            categories={categories}
            topBid={board.topBid}
          />

          <div>
            <Board
              rows={board.rows}
              clicks={clicks}
              activity={activity}
              podium={{
                heading: `Today's top ${name}`,
                href: `${path}/today`,
                empty: `No ${name} app has been paid for in the last 24 hours.`,
                rows: podium,
              }}
              heading={`${name} leaderboard`}
              caption={
                board.total === 0
                  ? `No ${name} app has been paid for yet. ${money(MIN_BID)} takes #1 in ${name}.`
                  : board.page > 1
                    ? `Ranks ${from} to ${to} of ${board.total.toLocaleString("en-US")} ${name} apps, ordered by what was paid for the spot.`
                    : `${board.total.toLocaleString("en-US")} ${name} apps, ordered by what was paid for the spot. Apple assigns the category, not us.`
              }
              spotlighted={top !== undefined}
            />

            <Pagination
              page={board.page}
              pageCount={board.pageCount}
              total={board.total}
              pageSize={board.pageSize}
              hrefFor={(n) => (n === 1 ? path : `${path}?page=${n}`)}
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
