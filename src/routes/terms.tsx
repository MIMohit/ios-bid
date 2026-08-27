import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import { MAX_BID, MIN_BID } from "@convex/rules";
import { Footer } from "~/components/chrome/Footer";
import { Header } from "~/components/chrome/Header";
import { StatsStrip } from "~/components/chrome/StatsStrip";
import { ConnectionState } from "~/components/ConnectionState";
import { money } from "~/lib/format";
import { breadcrumbList } from "~/lib/jsonld-board";
import { absolute, pageHead } from "~/lib/seo";

export const Route = createFileRoute("/terms")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(convexQuery(api.stats.strip, {}));
    return null;
  },

  headers: () => ({ "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" }),

  head: () =>
    pageHead({
      title: "Terms · iosrank.lol",
      description:
        "Terms of service for iosrank.lol. Payments are final, listings are paid placements, and we are not affiliated with Apple Inc.",
      canonical: absolute("/terms"),
      jsonld: [
        breadcrumbList([
          { name: "Leaderboard", path: "/" },
          { name: "Terms", path: "/terms" },
        ]),
      ],
    }),

  component: Terms,
});

function Terms() {
  const stats = useSuspenseQuery(convexQuery(api.stats.strip, {})).data;

  return (
    <>
      <Header window="all" hrefFor={(w) => (w === "all" ? "/" : "/today")} />
      <StatsStrip stats={stats} />
      <ConnectionState />

      <main className="page">
        <div className="board-head">
          <h1>Terms</h1>
          <p>Last updated August 2026. Using iosrank.lol means you accept what is below.</p>
        </div>

        <div className="doc">
          <section>
            <h2>What you are buying</h2>
            <p>
              A position on a public leaderboard, for as long as nobody pays more. Every listing on
              this site is a paid placement. The order of the board is decided by money and by
              nothing else, so it is advertising, not an editorial ranking, not a review, and not a
              statement that one app is better than another.
            </p>
            <p>
              We do not promise traffic, installs, revenue, App Store rank, or any outcome at all.
              The tap count shown on each row is what actually happened, measured by us, and it is
              the only performance claim this site makes.
            </p>
          </section>

          <section>
            <h2>Payments</h2>
            <p>
              Payments are handled by Stripe. Card details are entered on Stripe's own hosted
              checkout page and never touch this site. Amounts are whole US dollars, minimum{" "}
              {money(MIN_BID)}, maximum {money(MAX_BID)}.
            </p>
            <p>
              A rank is claimed by a completed payment and not before it. Payments are final and are
              not refundable, including when your app is later outbid, removed from the App Store,
              or removed from this board under the section below. Raising an existing listing
              charges only the difference between your current bid and the new total.
            </p>
            <p>
              Prices are re-checked on the server when checkout is created, so the amount you are
              charged is the amount the rules produce at that moment. A payment that fails never
              takes a rank, and a payment that is refunded or charged back is removed from the
              board: the amount comes off the listing's total, and off the rank it bought.
            </p>
          </section>

          <section>
            <h2>Tax</h2>
            <p>
              Bids are quoted before tax. Where we have to charge VAT, GST or sales tax, Stripe
              works it out from the billing address you enter at checkout and adds it on top, so
              the bid is what counts toward your rank and the tax is separate from it.
            </p>
            <p>
              If you are buying as a business, enter your VAT or tax number at checkout. Where the
              reverse charge applies, no VAT is added. We keep the billing country of every payment
              as a tax record, and nothing else from the checkout form.
            </p>
          </section>

          <section>
            <h2>Listings</h2>
            <p>
              A listing must be an app published on the Apple App Store. Its icon, name, subtitle,
              developer, category, star rating and price come from Apple's public lookup API and are
              re-synced from it, so we cannot and do not edit them.
            </p>
            <p>
              We may remove a listing without notice and without a refund if the app leaves the App
              Store, if the listing is unlawful, if it is used to route people somewhere other than
              the App Store page it names, or if a payment is reversed. We may also decline a
              listing before it goes live.
            </p>
          </section>

          <section>
            <h2>Apple</h2>
            <p>
              iosrank.lol is not affiliated with, endorsed by, or sponsored by Apple Inc. App Store
              is a trademark of Apple Inc. App metadata is retrieved from Apple's publicly available
              lookup API and belongs to Apple and to the developers who published it. Nothing on
              this board reflects Apple's own App Store rankings or its editorial choices.
            </p>
          </section>

          <section>
            <h2>The service itself</h2>
            <p>
              The site is provided as it is, with no warranty. We do not guarantee that it stays
              online, that the board is free of errors, or that it will exist next year. To the
              extent the law allows, our total liability to you is limited to the amount you paid us
              in the previous thirty days.
            </p>
            <p>
              These terms can change. The version on this page at the time of your payment is the
              one that applies to it.
            </p>
          </section>

          <section>
            <h2>Contact</h2>
            <p>hello@iosrank.lol.</p>
          </section>

          <p>
            <a href="/rules">The rules of the board</a> ·{" "}
            <a href="/privacy">What we collect</a>
          </p>
        </div>

        <Footer />
      </main>
    </>
  );
}
