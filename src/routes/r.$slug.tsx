/**
 * /r/:slug is a RECEIPT, not a detail page.
 *
 * It exists for one job: the person who just paid needs a URL to post, and a
 * link to the board's page 1 shows their followers somebody else's app. So this
 * page states one purchase and nothing else: the row, the live rank, the amount
 * paid, the taps sent, and what it costs to take the rank off them.
 *
 * What it must never grow into is the detail page the owner deleted. Hard rules,
 * and they are checked by scripts/check-seo.sh:
 *
 *   - NO description, NO screenshot gallery, NO reviews, NO "see details" text.
 *   - NO board row links here. A row's only outbound link is /go/:slug, which is
 *     where the tap count and the buyer's traffic come from.
 *
 * If you are here to add a second thing an app can be read about, the answer is
 * no: put it on the row, or it does not exist.
 */
import { useEffect } from "react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import { getCategory } from "@convex/lib/categories";
import { BidBar } from "~/components/bid/BidBar";
import { BoardRow } from "~/components/board/BoardRow";
import { Footer } from "~/components/chrome/Footer";
import { Header } from "~/components/chrome/Header";
import { StatsStrip } from "~/components/chrome/StatsStrip";
import { ConnectionState } from "~/components/ConnectionState";
import { clearBidAmount, setBidAmount } from "~/lib/bid-store";
import { money } from "~/lib/format";
import { breadcrumbList } from "~/lib/jsonld-board";
import { SITE, absolute, pageHead } from "~/lib/seo";

export const Route = createFileRoute("/r/$slug")({
  loader: async ({ context, params }) => {
    const [receipt] = await Promise.all([
      context.queryClient.ensureQueryData(
        convexQuery(api.receipt.forSlug, { slug: params.slug }),
      ),
      context.queryClient.ensureQueryData(convexQuery(api.stats.strip, {})),
    ]);
    // No payment, no receipt. Without this every misspelled slug is a live URL,
    // which is the per-app page generator this route is explicitly not.
    if (!receipt) throw notFound();
    return receipt;
  },

  headers: () => ({ "cache-control": "public, s-maxage=15, stale-while-revalidate=300" }),

  head: ({ loaderData, params }) => {
    // Undefined while pending, during error rendering and on ssr:false.
    if (!loaderData) return {};

    const { row, clicks } = loaderData;
    const canonical = absolute(`/r/${params.slug}`);
    const title = `${row.name} is #${row.rank} on iosbid.lol`;

    const head = pageHead({
      title,
      description: `${row.name} holds #${row.rank} on the iosbid.lol iOS app leaderboard with ${money(row.bid)} paid for the spot and ${clicks.toLocaleString("en-US")} taps sent. Taking the rank costs ${money(row.priceToTake)}.`,
      canonical,
      jsonld: [
        breadcrumbList([
          { name: "Leaderboard", path: "/" },
          { name: row.genre, path: `/category/${row.categorySlug}` },
          { name: title, path: `/r/${params.slug}` },
        ]),
      ],
    });

    // The whole point of the URL: its own card, with this app's icon, rank,
    // amount and taps. Meta is deduped by property with the deepest route
    // winning, so this replaces the site card set in __root.tsx.
    return {
      ...head,
      meta: [...head.meta, { property: "og:image", content: `${SITE}/og/${params.slug}` }],
    };
  },

  component: Receipt,
});

function Receipt() {
  const { slug } = Route.useParams();
  const receipt = useSuspenseQuery(convexQuery(api.receipt.forSlug, { slug })).data;
  const stats = useSuspenseQuery(convexQuery(api.stats.strip, {})).data;

  // The bar opens at what THIS rank costs, not at what #1 costs: a receipt is
  // read by people looking at one row. It writes to the same prefill store the
  // row's claim button writes to, so there is one path into the form, and it
  // clears on the way out so the board's bar is not left holding this number.
  const price = receipt?.row.priceToTake ?? null;
  const rank = receipt?.row.rank ?? null;
  useEffect(() => {
    if (price === null || rank === null) return;
    setBidAmount(price, rank);
    return clearBidAmount;
  }, [price, rank]);

  // The loader already threw notFound() on null. This is the live subscription
  // catching up if the listing goes away while somebody is looking at it.
  if (!receipt) return null;

  const { row, leader, clicks, priceForTop } = receipt;
  const category = getCategory(row.categorySlug);

  return (
    <>
      <Header window="all" hrefFor={(w) => (w === "all" ? "/" : "/today")} />
      <StatsStrip stats={stats} />
      <ConnectionState />

      <main className="page">
        <div className="board-head">
          <h1>
            {row.name} is #{row.rank} on iosbid.lol
          </h1>
          <p>
            {money(row.bid)} paid · {clicks.toLocaleString("en-US")} taps sent · rank is live
          </p>
        </div>

        {/* The board's own row, not a copy of it. Its claim button writes the
            price into the bid bar below through the same prefill store the
            board uses, so a receipt converts without a second checkout path. */}
        <ol className="board">
          <BoardRow row={row} clicks={clicks} leader={leader} />
        </ol>

        <BidBar priceForTop={priceForTop} flat />

        <div className="doc">
          <p>
            Anyone can take this rank for {money(row.priceToTake)}. Rank is the bid, nothing else.
          </p>
          <p>
            <a href="/">The leaderboard</a>
            {category ? (
              <>
                {" · "}
                <a href={`/category/${row.categorySlug}`}>{category.name} board</a>
              </>
            ) : null}
            {" · "}
            <a href="/rules">How the pricing works</a>
          </p>
        </div>

        <Footer />
      </main>
    </>
  );
}
