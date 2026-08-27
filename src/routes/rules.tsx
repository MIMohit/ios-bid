import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import { MAX_BID, MIN_BID, RAISE_STEP, TOP_STEP } from "@convex/rules";
import { Footer } from "~/components/chrome/Footer";
import { Header } from "~/components/chrome/Header";
import { StatsStrip } from "~/components/chrome/StatsStrip";
import { ConnectionState } from "~/components/ConnectionState";
import { money } from "~/lib/format";
import { breadcrumbList, faqPage } from "~/lib/jsonld-board";
import { absolute, pageHead } from "~/lib/seo";

/**
 * The rules, as the questions people actually ask before they pay.
 *
 * This array is both the visible page and the FAQPage structured data, so the
 * two cannot drift. Google requires the answer to be visible on the page, which
 * a separate hand written JSON-LD block reliably breaks.
 *
 * Every number comes from convex/rules.ts, the same module the checkout prices
 * against, so the page cannot advertise a floor the server does not enforce.
 */
const FAQ = [
  {
    q: "How is rank decided?",
    a: "By the money, and by nothing else. There is no algorithm, no editorial judgement, no quality score and no relevance ranking. The app that has paid the most sits at the top.",
  },
  {
    q: "What does it cost to take a rank?",
    a: `Taking #1 costs at least ${money(TOP_STEP)} more than the current top bid. Taking any other rank costs at least ${money(RAISE_STEP)} more than the bid sitting on it. Every row on the board shows its own price, and pressing it fills that exact amount into the form.`,
  },
  {
    q: "What if I pay less than the price of #1?",
    a: "That is not an error. The amount buys whatever rank it reaches. Most listings on the board were never bids for the top.",
  },
  {
    q: "Are there packages or tiers?",
    a: `No. There are no plans, no bundles and no price ladder. You type a whole dollar amount, minimum ${money(MIN_BID)} and maximum ${money(MAX_BID)}, and that number is your position. Cents do not exist anywhere on this site.`,
  },
  {
    q: "What happens if two apps have the same bid?",
    a: "The older bid holds the higher rank. Matching a bid does not pass it.",
  },
  {
    q: "Can I raise a listing that is already on the board?",
    a: `Yes. Submit the same app again with a higher total. The new total has to be at least ${money(RAISE_STEP)} above your current bid, and checkout charges you only the difference. Nobody else can take your rank by paying that difference.`,
  },
  {
    q: "How does the Today board work?",
    a: "It ranks what was spent in the last 24 hours. Each payment counts for a day from the moment it settled and then drops off on its own. The same payment also counts toward the all-time board, so a bid is never spent twice.",
  },
  {
    q: "Which apps can be listed?",
    a: "Any app on the Apple App Store. Paste its App Store link or type its name and we resolve it through Apple's own lookup. One listing per app: the App Store id is the key, so two links to the same app are the same listing.",
  },
  {
    q: "Who writes the listings?",
    a: "Apple does. The icon, name, subtitle, developer, category, star rating and price on every row come from the App Store and are re-synced from it. There is no listing editor and no copy to write.",
  },
  {
    q: "Who picks the category?",
    a: "Apple. The category is taken from the app's own App Store genre, so there is no category picker in the form. Filing a weather app under Games would put it on a board it does not belong to.",
  },
  {
    q: "What do I get for the money?",
    a: "A position on a public board, an icon and name that link straight to your App Store page, and a tap count on your row that is visible to everyone including the next bidder. Nothing else is promised. There is no guaranteed traffic number.",
  },
  {
    q: "Are payments refundable?",
    a: "No. A completed payment is what claims the rank, and it is final. If your app is removed from the App Store its listing goes with it, and that is not refunded either.",
  },
  {
    q: "Is this an editorial ranking of the best apps?",
    a: "No. Every listing is a paid placement. The board says what was paid, and that is the only thing it says. iosrank.lol is not affiliated with Apple Inc.",
  },
] as const;

export const Route = createFileRoute("/rules")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(convexQuery(api.stats.strip, {}));
    return null;
  },

  headers: () => ({ "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" }),

  // No loaderData is read here, so there is nothing to guard: the tags are the
  // same whether or not the loader has resolved.
  head: () =>
    pageHead({
      title: "Rules · iosrank.lol",
      description: `How ranking works on iosrank.lol. Whole dollars, ${money(MIN_BID)} minimum, #1 costs top bid plus ${money(TOP_STEP)}, any other rank costs that rank plus ${money(RAISE_STEP)}. Paying less is never an error.`,
      canonical: absolute("/rules"),
      jsonld: [
        faqPage(FAQ),
        breadcrumbList([
          { name: "Leaderboard", path: "/" },
          { name: "Rules", path: "/rules" },
        ]),
      ],
    }),

  component: Rules,
});

function Rules() {
  const stats = useSuspenseQuery(convexQuery(api.stats.strip, {})).data;

  return (
    <>
      <Header window="all" hrefFor={(w) => (w === "all" ? "/" : "/today")} />
      <StatsStrip stats={stats} />
      <ConnectionState />

      <main className="page">
        <div className="board-head">
          <h1>Rules</h1>
          <p>
            iosrank.lol is a public leaderboard of iOS App Store apps. No ads, no API keys, no
            revenue share. You pay to stand above everyone else. Rank is the bid, nothing else.
          </p>
        </div>

        <div className="doc">
          {FAQ.map((entry) => (
            <section key={entry.q}>
              <h2>{entry.q}</h2>
              <p>{entry.a}</p>
            </section>
          ))}

          <p>
            <a href="/">Back to the board</a>
          </p>
        </div>

        <Footer />
      </main>
    </>
  );
}
