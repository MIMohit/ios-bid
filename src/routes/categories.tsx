import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import { CATEGORIES } from "@convex/lib/categories";
import { MIN_BID } from "@convex/rules";
import { Footer } from "~/components/chrome/Footer";
import { Header } from "~/components/chrome/Header";
import { StatsStrip } from "~/components/chrome/StatsStrip";
import { ConnectionState } from "~/components/ConnectionState";
import { money } from "~/lib/format";
import { breadcrumbList, collectionPage } from "~/lib/jsonld-board";
import { absolute, pageHead } from "~/lib/seo";

const CATEGORY_NAME = new Map<string, string>(CATEGORIES.map((c) => [c.slug, c.name]));

export const Route = createFileRoute("/categories")({
  loader: async ({ context }) => {
    const [categories] = await Promise.all([
      context.queryClient.ensureQueryData(convexQuery(api.categories.totals, {})),
      context.queryClient.ensureQueryData(convexQuery(api.stats.strip, {})),
    ]);
    return categories;
  },

  headers: () => ({ "cache-control": "public, s-maxage=60, stale-while-revalidate=600" }),

  head: ({ loaderData }) => {
    // Undefined while the loader is pending and during error rendering.
    if (!loaderData) return {};

    const ranked = [...loaderData].sort((a, b) => b.topBid - a.topBid);
    const leader = ranked[0];
    const named = ranked.map((category) => ({
      name: CATEGORY_NAME.get(category.slug) ?? category.slug,
      path: `/category/${category.slug}`,
    }));

    const description =
      leader && leader.topBid > 0
        ? `All ${ranked.length} iOS App Store categories on iosbid.lol, with the top bid and the number of apps in each. ${CATEGORY_NAME.get(leader.slug) ?? leader.slug} leads at ${money(leader.topBid)}.`
        : `All ${ranked.length} iOS App Store categories on iosbid.lol, with the top bid and the number of apps in each. Nothing has been paid for yet, so ${money(MIN_BID)} takes #1 in any of them.`;

    return pageHead({
      title: "Every App Store category · iosbid.lol",
      description,
      canonical: absolute("/categories"),
      jsonld: [
        collectionPage({
          path: "/categories",
          name: "Every App Store category",
          description,
          links: named,
        }),
        breadcrumbList([
          { name: "Leaderboard", path: "/" },
          { name: "Categories", path: "/categories" },
        ]),
      ],
    });
  },

  component: Categories,
});

function Categories() {
  const categories = useSuspenseQuery(convexQuery(api.categories.totals, {})).data;
  const stats = useSuspenseQuery(convexQuery(api.stats.strip, {})).data;

  // Busiest first. A fixed alphabetical list would bury the boards worth
  // looking at under whatever starts with A.
  const ranked = [...categories].sort((a, b) => b.topBid - a.topBid || b.listingCount - a.listingCount);

  return (
    <>
      <Header window="all" hrefFor={(w) => (w === "all" ? "/" : "/today")} />
      <StatsStrip stats={stats} />
      <ConnectionState />

      <main className="page">
        <div className="board-head">
          <h1>Every App Store category</h1>
          <p>
            Apple assigns every listing its category from the app's own App Store metadata, so a
            category board is exactly the apps Apple files there. Each one is its own leaderboard
            with its own #1.
          </p>
        </div>

        <ul className="cats">
          {ranked.map((category) => (
            <li key={category.slug}>
              <a className="rail-item" href={`/category/${category.slug}`}>
                <span className="rail-name">
                  {CATEGORY_NAME.get(category.slug) ?? category.slug}
                </span>
                <span className="rail-sum">
                  {category.listingCount === 0
                    ? `${money(MIN_BID)} takes #1`
                    : `${money(category.topBid)} · ${category.listingCount.toLocaleString("en-US")} ${category.listingCount === 1 ? "app" : "apps"}`}
                </span>
              </a>
            </li>
          ))}
        </ul>

        <Footer />
      </main>
    </>
  );
}
