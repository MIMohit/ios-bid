import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import { MIN_BID } from "@convex/rules";
import { Footer } from "~/components/chrome/Footer";
import { Header } from "~/components/chrome/Header";
import { StatsStrip } from "~/components/chrome/StatsStrip";
import { ConnectionState } from "~/components/ConnectionState";
import { Testimonials } from "~/components/Testimonials";
import { money } from "~/lib/format";
import { breadcrumbList } from "~/lib/jsonld-board";
import { absolute, pageHead } from "~/lib/seo";

export const Route = createFileRoute("/about")({
  loader: async ({ context }) => {
    const [stats, pricing] = await Promise.all([
      context.queryClient.ensureQueryData(convexQuery(api.stats.strip, {})),
      context.queryClient.ensureQueryData(convexQuery(api.board.pricing, { window: "all" })),
    ]);
    // Only the four numbers the description needs. The full documents are
    // already dehydrated into the query cache for the component.
    return {
      visitors: stats.visitors,
      revenue: stats.revenue,
      listingCount: stats.listingCount,
      topBid: pricing.topBid,
    };
  },

  headers: () => ({ "cache-control": "public, s-maxage=60, stale-while-revalidate=600" }),

  head: ({ loaderData }) => {
    // Undefined while the loader is pending and during error rendering.
    if (!loaderData) return {};

    const { visitors, revenue, topBid } = loaderData;
    return pageHead({
      title: "About · iosbid.lol",
      description:
        topBid > 0
          ? `Who runs iosbid.lol and what happened after launch. ${visitors.toLocaleString("en-US")} visitors, ${money(revenue)} paid, and a highest bid of ${money(topBid)}.`
          : `Who runs iosbid.lol and why an App Store leaderboard is priced in whole dollars. Nobody has taken #1 yet, so ${money(MIN_BID)} claims it.`,
      canonical: absolute("/about"),
      jsonld: [
        breadcrumbList([
          { name: "Leaderboard", path: "/" },
          { name: "About", path: "/about" },
        ]),
      ],
    });
  },

  component: About,
});

function About() {
  const stats = useSuspenseQuery(convexQuery(api.stats.strip, {})).data;
  const pricing = useSuspenseQuery(convexQuery(api.board.pricing, { window: "all" })).data;

  return (
    <>
      <Header window="all" hrefFor={(w) => (w === "all" ? "/" : "/today")} />
      <StatsStrip stats={stats} />
      <ConnectionState />

      <main className="page">
        <div className="board-head">
          <h1>About</h1>
          <p>
            App Store discovery is a black box. Rankings move for reasons nobody outside Apple can
            see, and the paid version of it hides behind an auction you cannot watch. This is the
            opposite: one number decides everything, the number is public, and so is what it bought.
          </p>
        </div>

        <div className="doc">
          <section>
            <h2>What it is</h2>
            <p>
              A leaderboard of iOS apps ordered by what was paid for the position. Every listing is
              a paid placement. There is no editorial judgement anywhere in it, and the board never
              claims these are the best apps, only the ones that paid the most.
            </p>
            <p>
              Every row is pulled live from Apple: the icon, the name, the subtitle, the developer,
              the category, the star rating and the price. We do not write listings, and there is
              nothing to write.
            </p>
          </section>

          <section>
            <h2>Where the numbers are</h2>
            <div className="statgrid">
              <p className="stat">
                <b className="money-t">{stats.visitors.toLocaleString("en-US")}</b>
                <span>visitors since launch</span>
              </p>
              <p className="stat">
                <b className="money-t">{money(stats.revenue)}</b>
                <span>paid so far</span>
              </p>
              <p className="stat">
                <b className="money-t">
                  {pricing.topBid > 0 ? money(pricing.topBid) : "unclaimed"}
                </b>
                <span>highest bid</span>
              </p>
              <p className="stat">
                <b className="money-t">{stats.listingCount.toLocaleString("en-US")}</b>
                <span>apps on the board</span>
              </p>
            </div>
            <p>
              Those four move on their own. The full breakdown, including how many taps the board
              has sent to the App Store, is on <a href="/stats">the stats page</a>, and it is public
              for the same reason the tap count sits on every row: the next bidder should be able to
              see the return before paying, not after.
            </p>
          </section>

          <section>
            <h2>No accounts</h2>
            <p>
              There is no sign up, no login and no dashboard. Paying is the whole interaction. The
              only thing this site stores about you is one first-party session cookie, and{" "}
              <a href="/privacy">the privacy page</a> says exactly what it does.
            </p>
          </section>

          <section>
            <h2>Who runs it</h2>
            <p>
              One developer, as a side project. It is not affiliated with Apple Inc., and Apple has
              no involvement in what appears here. Reach us at hello@iosbid.lol.
            </p>
          </section>
        </div>

        {/*
          Renders nothing until somebody who took #1 says something worth
          quoting. An empty wall with a heading would be an advertisement for
          having no customers, and invented quotes are not an option.
        */}
        <Testimonials />

        <p className="revenue">
          The board is open.{" "}
          {pricing.topBid > 0
            ? `Taking #1 costs ${money(pricing.priceForTop)}.`
            : `Nobody has bid yet, so ${money(MIN_BID)} takes #1.`}{" "}
          <a href="/">Go and look at it.</a>
        </p>

        <Footer />
      </main>
    </>
  );
}
