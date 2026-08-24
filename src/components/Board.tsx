import { Fragment } from "react";
import { getBoard, priceForTop, topBidToday, recentActivity, siteStats, MIN_BID, TOP_STEP, type BoardWindow } from "@/lib/bidding";
import { getCategory } from "@/lib/categories";
import { BidForm } from "./BidForm";
import { CategoryTabs } from "./CategoryTabs";
import { ListingRow } from "./ListingRow";
import { ActivityTicker } from "./ActivityTicker";
import { LiveStats } from "./LiveStats";
import { Pagination } from "./Pagination";
import { money } from "@/lib/format";

const ACTIVITY_AFTER_RANK = 3;

export async function Board({
  window: win,
  categorySlug = "all",
  page = 1,
}: {
  window: BoardWindow;
  categorySlug?: string;
  page?: number;
}) {
  const [{ rows, total, pageCount }, topPrice] = await Promise.all([
    getBoard({ window: win, categorySlug, page }),
    win === "today" ? topBidToday().then((t) => Math.max(MIN_BID, t + TOP_STEP)) : priceForTop(),
  ]);

  const showHero = page === 1;
  const category = categorySlug !== "all" ? getCategory(categorySlug) : null;
  const basePath = categorySlug === "all" ? (win === "today" ? "/today" : "/") : `/category/${categorySlug}${win === "today" ? "/today" : ""}`;

  const [activity, stats] = showHero ? await Promise.all([recentActivity(6), siteStats()]) : [null, null];

  return (
    <>
      {showHero && stats && (
        <>
          <BidForm topPrice={topPrice} minBid={MIN_BID} />
          <LiveStats initial={stats} />
        </>
      )}

      <section className="mx-auto max-w-2xl px-4 pb-16 pt-6">
        {category && (
          <div className="mb-4 flex items-center gap-2">
            <span className="text-2xl" aria-hidden>{category.emoji}</span>
            <div>
              <h1 className="text-lg font-bold tracking-tight">{category.name}</h1>
              <p className="text-xs text-muted">
                {win === "today" ? "Ranked by what was bid in the last 24 hours." : "Ranked all-time."}
              </p>
            </div>
          </div>
        )}

        <CategoryTabs active={categorySlug} window={win} />

        {win === "today" && (
          <p className="mt-3 text-center text-[11px] text-faint">
            Each payment counts for a day from when it settled, then drops off — it still counts toward the app's
            all-time bid.
          </p>
        )}

        {rows.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-line-strong bg-surface-2 px-6 py-14 text-center">
            <p className="text-sm font-medium">Nothing here yet.</p>
            <p className="mt-1 text-[13px] text-muted">
              {win === "today"
                ? "No bids have landed in this window. Be the first today."
                : "Be the first app in this category — new spots start at " + money(MIN_BID) + "."}
            </p>
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {rows.map((row, i) => (
              <Fragment key={row.listing.id}>
                <ListingRow row={row} showTodayNote={win === "today"} />
                {showHero && i === ACTIVITY_AFTER_RANK - 1 && activity && activity.length > 0 && (
                  <ActivityTicker
                    initial={activity.map(({ bid, listing, rank }) => ({
                      id: bid.id,
                      name: listing.name,
                      slug: listing.slug,
                      iconUrl: listing.iconUrl,
                      amount: bid.amount,
                      rank,
                      paidAt: (bid.paidAt ?? bid.createdAt).toISOString(),
                    }))}
                  />
                )}
              </Fragment>
            ))}
          </ul>
        )}

        <Pagination page={page} pageCount={pageCount} total={total} basePath={basePath} pageSize={50} />
      </section>
    </>
  );
}
