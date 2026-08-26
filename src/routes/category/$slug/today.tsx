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

export const Route = createFileRoute("/category/$slug/today")({
  validateSearch: searchSchema,
  // Page 1 is the default, so `?page=1` never appears in a URL this site emits
  // and the bare path is never rewritten to carry it. Without this the router
  // 307s "/" to "/?page=1", which is the canonical URL redirecting away from
  // itself on the site's most important page.
  search: { middlewares: [stripSearchParams({ page: 1 })] },
  loaderDeps: ({ search: { page } }) => ({ page }),

  loader: async ({ context, deps, params }) => {
    const name = CATEGORY_NAME.get(params.slug);
    if (!name) throw notFound();

    const [board] = await Promise.all([
      context.queryClient.ensureQueryData(
        convexQuery(api.board.page, {
          window: "today",
          categorySlug: params.slug,
          page: deps.page,
        }),
      ),
      context.queryClient.ensureQueryData(convexQuery(api.categories.totals, {})),
      context.queryClient.ensureQueryData(convexQuery(api.stats.strip, {})),
      context.queryClient.ensureQueryData(convexQuery(api.bids.recentActivity, {})),
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
    // Undefined while pending, during error rendering and on ssr:false.
    if (!loaderData) return {};

    const { board, name } = loaderData;
    const top = board.rows[0];
    const { from, to } = pageRange(board);
    const path = `/category/${params.slug}/today`;
    const canonical = boardCanonical(path, board.page);
    const total = board.total.toLocaleString("en-US");

    return pageHead({
      title:
        board.page > 1
          ? `${name} today, ranks ${from} to ${to} · iosbid.lol`
          : `${name} today · iosbid.lol`,
      description: top
        ? `${name} apps ranked by what was spent in the last 24 hours. ${total} apps, led by ${top.name} at ${money(top.bid)}.`
        : `${name} apps ranked by what was spent in the last 24 hours. Nothing has been paid in this window yet, so ${money(MIN_BID)} takes today's #1 in ${name}.`,
      canonical,
      // 27 of these exist. Empty, they are a thin-content generator, so they
      // stay out of the index until somebody pays into the window.
      noindex: board.total === 0,
      jsonld: [
        boardItemList(board.rows, {
          url: canonical,
          name: `${name} apps ranked by what was spent in the last 24 hours`,
        }),
        breadcrumbList([
          { name: "Leaderboard", path: "/" },
          { name: "Categories", path: "/categories" },
          { name, path: `/category/${params.slug}` },
          { name: "Today", path },
        ]),
      ],
    });
  },

  component: CategoryToday,
});

function CategoryToday() {
  const { slug } = Route.useParams();
  const { page } = Route.useSearch();
  const { name } = Route.useLoaderData();
  const router = useRouter();

  const board = useSuspenseQuery(
    convexQuery(api.board.page, { window: "today", categorySlug: slug, page }),
  ).data;
  const clicks = useSuspenseQuery(
    convexQuery(api.clicks.forListings, { listingIds: board.rows.map((row) => row.id) }),
  ).data;
  const activity = useSuspenseQuery(convexQuery(api.bids.recentActivity, {})).data;
  const stats = useSuspenseQuery(convexQuery(api.stats.strip, {})).data;
  const categories = useSuspenseQuery(convexQuery(api.categories.totals, {})).data;

  const top = board.rows[0]?.rank === 1 ? board.rows[0] : undefined;
  const { from, to } = pageRange(board);
  const path = `/category/${slug}`;

  return (
    <>
      <Header window="today" hrefFor={(w) => (w === "all" ? path : `${path}/today`)} />
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
            active={slug}
            categories={categories}
            topBid={board.topBid}
          />

          <div>
            <Board
              rows={board.rows}
              clicks={clicks}
              activity={activity}
              heading={`${name} today`}
              caption={
                board.total === 0
                  ? `No ${name} app has been paid for in the last 24 hours. ${money(MIN_BID)} takes today's #1 in ${name}.`
                  : board.page > 1
                    ? `Ranks ${from} to ${to} of ${board.total.toLocaleString("en-US")} ${name} apps, ordered by what was paid in the last 24 hours.`
                    : `${board.total.toLocaleString("en-US")} ${name} apps, ordered by what was paid in the last 24 hours.`
              }
              spotlighted={top !== undefined}
            />

            <Pagination
              page={board.page}
              pageCount={board.pageCount}
              total={board.total}
              pageSize={board.pageSize}
              hrefFor={(n) => (n === 1 ? `${path}/today` : `${path}/today?page=${n}`)}
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
