import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import { Footer } from "~/components/chrome/Footer";
import { Header } from "~/components/chrome/Header";
import { StatsStrip } from "~/components/chrome/StatsStrip";
import { ConnectionState } from "~/components/ConnectionState";
import { breadcrumbList } from "~/lib/jsonld-board";
import { absolute, pageHead } from "~/lib/seo";

export const Route = createFileRoute("/privacy")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(convexQuery(api.stats.strip, {}));
    return null;
  },

  headers: () => ({ "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" }),

  head: () =>
    pageHead({
      title: "Privacy · iosrank.lol",
      description:
        "What iosrank.lol collects. No accounts, no third-party cookies, no IP addresses stored. One first-party session cookie and cookieless visitor analytics.",
      canonical: absolute("/privacy"),
      jsonld: [
        breadcrumbList([
          { name: "Leaderboard", path: "/" },
          { name: "Privacy", path: "/privacy" },
        ]),
      ],
    }),

  component: Privacy,
});

function Privacy() {
  const stats = useSuspenseQuery(convexQuery(api.stats.strip, {})).data;

  return (
    <>
      <Header window="all" hrefFor={(w) => (w === "all" ? "/" : "/today")} />
      <StatsStrip stats={stats} />
      <ConnectionState />

      <main className="page">
        <div className="board-head">
          <h1>Privacy</h1>
          <p>
            Last updated August 2026. There are no accounts on this site, so there is no profile of
            you to build. This page lists everything that is actually stored.
          </p>
        </div>

        <div className="doc">
          <section>
            <h2>The one cookie</h2>
            <p>
              We set a single first-party cookie named <code>iosrank_sid</code>. It holds a random
              identifier, nothing else. It is httpOnly, so page JavaScript cannot read it, it is
              scoped to this site, and it expires after a year.
            </p>
            <p>
              It exists to do two things: count how many people are on the site right now, and stop
              the same visitor counting the same outbound tap more than once a day. It carries no
              name, no email, no advertising id and no fingerprint, and it is never shared with
              anyone.
            </p>
          </section>

          <section>
            <h2>Taps on the board</h2>
            <p>
              Every app name on the board links out through <code>/go/</code>, which counts the tap
              and then sends you to the App Store. What is stored is a counter per listing, plus a
              short-lived row recording that this session already counted that listing today. Those
              rows are deleted automatically after 48 hours.
            </p>
            <p>
              The per-listing totals are public and printed on every row. That is deliberate: the
              next person to bid should be able to see what the position returned before they pay
              for it.
            </p>
          </section>

          <section>
            <h2>What we do not store</h2>
            <p>
              No IP addresses. No accounts, no passwords, no email addresses collected by us. No
              third-party advertising cookies, no cross-site trackers, no data broker of any kind.
              Nothing is sold or shared for advertising.
            </p>
          </section>

          <section>
            <h2>Payments</h2>
            <p>
              Payments run through Stripe, which acts as the payment processor and its own data
              controller. Card details are entered on Stripe's hosted checkout page and are never
              sent to this site or stored by us. Stripe handles that data under its own privacy
              policy at stripe.com/privacy, and it will hold whatever it needs for the receipt and
              for fraud checks.
            </p>
            <p>
              What we keep about a payment is the app that was listed, the whole dollar amount, the
              Stripe checkout session id and the time it settled. That is what the board is made of.
            </p>
          </section>

          <section>
            <h2>Analytics</h2>
            <p>
              Traffic analytics come from PostHog, configured without cookies or local storage so it cannot follow anyone
              across sites. The counts on this site's own <a href="/stats">stats page</a> come from
              our own database and are aggregate totals: taps, page views, revenue and how many
              apps are on the board. There is no per-person record behind them.
            </p>
          </section>

          <section>
            <h2>Contact</h2>
            <p>
              Questions, or a request to remove something, go to hello@iosrank.lol. Clearing your
              browser cookies for this site removes the only identifier we hold.
            </p>
          </section>

          <p>
            <a href="/terms">Terms</a> · <a href="/rules">Rules</a>
          </p>
        </div>

        <Footer />
      </main>
    </>
  );
}
