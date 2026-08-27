import { Fragment } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@convex/_generated/api";
import { ActivityTicker, type ActivityItem } from "./ActivityTicker";
import { BoardRow, type BoardRowData } from "./BoardRow";
import { EmptyBoard } from "./EmptyBoard";
import { RankDivider } from "./RankDivider";

/** Derived from the query, never hand written. */
export type ClickCounts = FunctionReturnType<typeof api.clicks.forListings>;

/** Where the group markers fall, and what they say. */
const MARKERS: Record<number, string> = { 10: "TOP 10", 20: "TOP 20" };

/** The ticker sits between rank 3 and rank 4, so deeper pages do not carry one. */
const TICKER_AFTER = 3;

type Props = {
  /**
   * One page of `api.board.page`, in rank order. Always the whole page, even
   * when rank 1 is being rendered as the spotlight panel: the category leader
   * marks are computed from what is above a row, so hiding rank 1 from this
   * list would promote rank 4 to leader of a category rank 1 already leads.
   */
  rows: readonly BoardRowData[];
  /** From `api.clicks.forListings`, a separate subscription so a tap never invalidates the board. */
  clicks: ClickCounts;
  /** Latest settled payments, from `api.bids.recentActivity`. */
  activity: readonly ActivityItem[];
  heading: string;
  /** One stated fact under the heading, for extraction as much as for the reader. */
  caption: string;
  /** True when rank 1 is the spotlight panel above, so the list starts at #2. */
  spotlighted?: boolean;
};

/**
 * The board itself: the head, the ranked list, the group markers and the
 * activity ticker.
 *
 * Pagination and the revenue line are siblings rendered by the route, not
 * children here, because they belong to the page rather than to the list.
 */
export function Board({ rows, clicks, activity, heading, caption, spotlighted = false }: Props) {
  // "No higher-ranked listing on this board shares its category." The rows
  // arrive in rank order, so the first row of each category is its leader and
  // one pass answers it for the whole page.
  const seen = new Set<string>();
  const leaders = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.categorySlug)) continue;
    seen.add(row.categorySlug);
    leaders.add(row.id);
  }

  const listed = spotlighted ? rows.filter((row) => row.rank !== 1) : rows;

  return (
    <section id="board">
      <div className="board-head">
        <h2>{heading}</h2>
        <p>{caption}</p>
      </div>

      {rows.length === 0 ? (
        <EmptyBoard />
      ) : (
        <ol className="board">
          {listed.map((row) => {
            const marker = MARKERS[row.rank];
            return (
              <Fragment key={row.id}>
                <BoardRow row={row} clicks={clicks[row.id] ?? 0} leader={leaders.has(row.id)} />
                {/* The ticker renders whether or not it has entries: it holds a
                    fixed height, and one that appeared later would push ranks 4
                    through 50 down the page. */}
                {row.rank === TICKER_AFTER ? <ActivityTicker items={activity} /> : null}
                {marker ? <RankDivider label={marker} /> : null}
              </Fragment>
            );
          })}
        </ol>
      )}
    </section>
  );
}
