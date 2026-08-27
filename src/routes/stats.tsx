import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import { Footer } from "~/components/chrome/Footer";
import { Header } from "~/components/chrome/Header";
import { StatsStrip } from "~/components/chrome/StatsStrip";
import { ConnectionState } from "~/components/ConnectionState";
import { hoursSince, money } from "~/lib/format";
import { breadcrumbList } from "~/lib/jsonld-board";
import { absolute, pageHead } from "~/lib/seo";

/** The window the table covers. Long enough to show a trend, short enough to read. */
const DAYS = 30;

export const Route = createFileRoute("/stats")({
  loader: async ({ context }) => {
    const [stats, daily] = await Promise.all([
      context.queryClient.ensureQueryData(convexQuery(api.stats.strip, {})),
      context.queryClient.ensureQueryData(convexQuery(api.stats.daily, { days: DAYS })),
    ]);
    return {
      online: stats.online,
      revenue: stats.revenue,
      listingCount: stats.listingCount,
      taps: daily.reduce((sum, day) => sum + day.clicks, 0),
    };
  },

  headers: () => ({ "cache-control": "public, s-maxage=60, stale-while-revalidate=300" }),

  head: ({ loaderData }) => {
    // Undefined while the loader is pending and during error rendering.
    if (!loaderData) return {};

    const { online, revenue, listingCount, taps } = loaderData;
    return pageHead({
      title: "Live stats · iosrank.lol",
      description: `Live numbers for iosrank.lol: ${listingCount.toLocaleString("en-US")} apps on the board, ${money(revenue)} paid, ${taps.toLocaleString("en-US")} taps sent to the App Store in the last ${DAYS} days, ${online.toLocaleString("en-US")} people here right now.`,
      canonical: absolute("/stats"),
      jsonld: [
        breadcrumbList([
          { name: "Leaderboard", path: "/" },
          { name: "Live stats", path: "/stats" },
        ]),
      ],
    });
  },

  component: Stats,
});

function Stats() {
  const stats = useSuspenseQuery(convexQuery(api.stats.strip, {})).data;
  const daily = useSuspenseQuery(convexQuery(api.stats.daily, { days: DAYS })).data;

  const taps = daily.reduce((sum, day) => sum + day.clicks, 0);
  const views = daily.reduce((sum, day) => sum + day.impressions, 0);
  const bids = daily.reduce((sum, day) => sum + day.bidCount, 0);
  const hours = stats.launchedAt === 0 ? 0 : Math.max(1, hoursSince(stats.launchedAt));

  return (
    <>
      <Header window="all" hrefFor={(w) => (w === "all" ? "/" : "/today")} />
      <StatsStrip stats={stats} />
      <ConnectionState />

      <main className="page">
        <div className="board-head">
          <h1>Live stats</h1>
          <p>
            Our own numbers, first-party, updating as they move. Nothing here is sampled and nothing
            is modelled. The tap counts are the same ones printed on the rows of the board.
          </p>
        </div>

        <div className="statgrid">
          <p className="stat">
            <b className="money-t">{stats.online.toLocaleString("en-US")}</b>
            <span>here right now</span>
          </p>
          <p className="stat">
            <b className="money-t">{stats.visitors.toLocaleString("en-US")}</b>
            <span>visitors since launch</span>
          </p>
          <p className="stat">
            <b className="money-t">{money(stats.revenue)}</b>
            {/* Clock-derived text. See held() in lib/format.ts. */}
            <span suppressHydrationWarning>
              paid{hours > 0 ? ` in ${hours.toLocaleString("en-US")} hours` : ""}
            </span>
          </p>
          <p className="stat">
            <b className="money-t">{stats.listingCount.toLocaleString("en-US")}</b>
            <span>apps on the board</span>
          </p>
          <p className="stat">
            <b className="money-t">{taps.toLocaleString("en-US")}</b>
            <span>taps sent to the App Store</span>
          </p>
          <p className="stat">
            <b className="money-t">{views.toLocaleString("en-US")}</b>
            <span>page views</span>
          </p>
          <p className="stat">
            <b className="money-t">{bids.toLocaleString("en-US")}</b>
            <span>payments settled</span>
          </p>
        </div>

        <table className="daily">
          <caption>
            The last {DAYS} days, newest first. Taps are outbound taps to the App Store, deduped per
            visitor per listing per day. Views are page views. Paid is what settled that day.
          </caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Taps</th>
              <th scope="col">Views</th>
              <th scope="col">Bids</th>
              <th scope="col">Paid</th>
            </tr>
          </thead>
          <tbody>
            {daily.map((day) => (
              <tr key={day.day}>
                <th scope="row">{day.day}</th>
                <td>{day.clicks.toLocaleString("en-US")}</td>
                <td>{day.impressions.toLocaleString("en-US")}</td>
                <td>{day.bidCount.toLocaleString("en-US")}</td>
                <td>{money(day.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <Footer />
      </main>
    </>
  );
}
