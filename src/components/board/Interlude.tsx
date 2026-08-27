import type { FunctionReturnType } from "convex/server";
import type { api } from "@convex/_generated/api";
import { ago, money } from "~/lib/format";
import { AppIcon } from "./AppIcon";

/** Derived from the queries, never hand written. */
export type ActivityItem = FunctionReturnType<typeof api.bids.recentActivity>[number];
export type PodiumItem = FunctionReturnType<typeof api.board.podium>[number];

/**
 * The other window's top three, and where to see the rest of it. Every board
 * shows the board it is not: the all-time leaderboard carries today's leaders,
 * /today carries the all-time leaders, and a category board carries the same
 * pair scoped to that category. It is the one place on a board that points at
 * another board, which is the whole reason it earns the slot.
 */
export type PodiumBlock = {
  heading: string;
  /** Where "See all" goes. The same board the ranks below are counted on. */
  href: string;
  /** One line for the case where that board has nothing on it yet. */
  empty: string;
  rows: readonly PodiumItem[];
};

/** Rendered CSS size of the two icon sizes in this block. */
const PODIUM_ICON_PX = 36;
const ACTIVITY_ICON_PX = 28;

/**
 * The two blocks between rank 3 and rank 4: the other window's leaders, then
 * the latest settled payments.
 *
 * Both hold their height whether or not they have entries, because a block that
 * grows from nothing pushes ranks 4 through 50 down the page and that is a
 * large layout shift on the site's primary surface. The podium renders one line
 * instead of three cards when the other board is empty; the activity strip
 * renders an empty scroller. Neither collapses.
 *
 * It is an `<li role="presentation">` because it is a child of the board's
 * `<ol>` and it is not a ranked entry. Same shape the single tape strip it
 * replaced used.
 */
export function Interlude({
  podium,
  activity,
}: {
  podium: PodiumBlock;
  /** Latest settled payments, from `api.bids.recentActivity`. */
  activity: readonly ActivityItem[];
}) {
  return (
    <li className="interlude" role="presentation">
      <section className="slab" aria-label={podium.heading}>
        <div className="slab-head">
          <h3>{podium.heading}</h3>
          <a className="slab-more" href={podium.href}>
            See all →
          </a>
        </div>

        {podium.rows.length === 0 ? (
          <p className="slab-empty">{podium.empty}</p>
        ) : (
          <div className="today-grid">
            {podium.rows.map((row) => (
              /*
                Outbound, like every other anchor on a board: /go/:slug filters
                bots, counts the tap and 302s to Apple. No `?r=`, because the
                rank printed here is that app's rank on the OTHER board and the
                parameter is there to say which rank was clicked from.
              */
              <a
                className="today-card"
                key={row.id}
                href={`/go/${row.slug}`}
                target="_blank"
                rel="sponsored nofollow noopener"
                referrerPolicy="no-referrer"
              >
                <span className="today-rank">#{row.rank}</span>
                <AppIcon url={row.iconUrl} px={PODIUM_ICON_PX} />
                <span className="today-text">
                  <span className="today-name">{row.name}</span>
                  {/*
                    Always rendered, empty when Apple gave the app no subtitle.
                    The slot exists either way, so three cards side by side are
                    the same object at the same height and their amounts share a
                    baseline. Same reservation .bid-note makes for its own line.
                  */}
                  <span className="today-sub">{row.subtitle ?? ""}</span>
                  <span className="today-bid money-t">{money(row.bid)}</span>
                </span>
              </a>
            ))}
          </div>
        )}
      </section>

      <section className="slab" aria-label="Latest activity">
        <div className="slab-head">
          <h3 className="slab-live">Latest activity</h3>
        </div>

        <div className="act-row">
          {activity.map((item) => {
            /*
              `amount` is what Stripe charged and `totalAfter` is where the
              listing landed, so the two differ exactly when the payment was a
              raise. That is the whole verb decision, no extra field needed.
            */
            const isRaise = item.amount !== item.totalAfter;
            const where = item.rank === null ? "off the board" : `#${item.rank}`;

            return (
              <a
                className="act-card"
                key={item.bidId}
                href={`/go/${item.slug}`}
                target="_blank"
                rel="sponsored nofollow noopener"
                referrerPolicy="no-referrer"
              >
                <AppIcon url={item.iconUrl} px={ACTIVITY_ICON_PX} />
                <span className="act-text">
                  <span className="act-name">{item.name}</span>
                  <span className="act-where">
                    {isRaise ? "raised to" : "at"} {where}
                    {" · "}
                    <b className="money-t">
                      {isRaise ? `+${money(item.amount)}` : money(item.amount)}
                    </b>
                  </span>
                  {/* Clock-derived text. See ago() in lib/format.ts. */}
                  <time
                    className="act-when"
                    dateTime={new Date(item.paidAt).toISOString()}
                    suppressHydrationWarning
                  >
                    {ago(item.paidAt)}
                  </time>
                </span>
              </a>
            );
          })}
        </div>
      </section>
    </li>
  );
}
