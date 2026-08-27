import { memo } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@convex/_generated/api";
import { held, money, rating } from "~/lib/format";
import { claimRank } from "~/lib/bid-store";
import { AppIcon } from "./AppIcon";

/** Derived from the query, never hand written. */
export type BoardPage = FunctionReturnType<typeof api.board.page>;
export type BoardRowData = BoardPage["rows"][number];

/**
 * The rank ramp, as tiers. Hierarchy is pure scale: icon size, type size, type
 * weight and row height. No tint, no border, no card, no pill, no glow on any
 * rank, which is the entire point of doing it this way.
 *
 * Tier 1 is the spotlight panel in this direction, so a board that renders its
 * own #1 as a row still gets the top of the ladder.
 */
export type Tier = 0 | 1 | 2 | 3;

export function tierFor(rank: number): Tier {
  return rank === 1 ? 1 : rank === 2 ? 2 : rank === 3 ? 3 : 0;
}

/**
 * Mirrors `--tier{n}-icon` in tokens.css. The number has to exist in JS as well
 * as CSS because the CDN URL is built during SSR, where a custom property is not
 * readable. Change one, change the other.
 */
export const TIER_ICON_PX: Record<Tier, number> = { 0: 44, 1: 72, 2: 60, 3: 52 };

const TIER_CLASS: Record<Tier, string> = {
  0: "row",
  1: "row is-t1",
  2: "row is-t2",
  3: "row is-t3",
};

/** Apple's own price string, with a fallback for listings written before it existed. */
export function priceLabel(row: BoardRowData): string {
  return row.formattedPrice ?? (row.price > 0 ? `$${row.price}` : "Free");
}

/**
 * `.name::after` covers the whole row so the outbound link is the row, so
 * anything else clickable inside it has to be lifted above that layer. Inline
 * because it is a stacking fix for one element, not a style.
 */
const LIFT = { position: "relative", zIndex: 1 } as const;

type Props = {
  row: BoardRowData;
  /** From `api.clicks.forListings`, a separate subscription so a tap never invalidates the board. */
  clicks: number;
  /** True when no higher-ranked listing on this board shares its category. */
  leader: boolean;
};

function Row({ row, clicks, leader }: Props) {
  const tier = tierFor(row.rank);
  const price = money(row.priceToTake);

  return (
    <li className={TIER_CLASS[tier]}>
      <span className="rank">#{row.rank}</span>
      <AppIcon url={row.iconUrl} px={TIER_ICON_PX[tier]} eager={row.rank <= 10} />
      <div className="stack">
        {/*
          The outbound anchor. `/go/:slug` filters bots, counts the tap and 302s
          to Apple, so the href stays first-party and the rank rides along for
          attribution. There is no detail page to link to and never will be, and
          a row does not link to /r/:slug either: that URL is a receipt for the
          person who paid, not a second place to read about an app.
        */}
        <a
          className="name"
          href={`/go/${row.slug}?r=${row.rank}`}
          target="_blank"
          rel="sponsored nofollow noopener"
          referrerPolicy="no-referrer"
        >
          {row.name}
        </a>
        {row.subtitle ? <p className="sub">{row.subtitle}</p> : null}
        <p className="meta">
          {/*
            Where the row goes. Every anchor on a row points at /go/:slug so the
            tap counts, which means the row would otherwise never name the store
            it ranks, to a reader or to a crawler.
          */}
          <span className="m-store">apps.apple.com</span>
          {/*
            The row's one internal link. A board of fifty rows used to pass no
            link at all, and the category is the second thing a visitor wants
            after the app itself. It is not a "see details" affordance: it goes
            to a board, not to a page about this app.
          */}
          <a
            className={leader ? "m-cat is-leader" : "m-cat"}
            href={`/category/${row.categorySlug}`}
            style={LIFT}
          >
            {leader ? <span className="lead-dot" /> : null}
            {leader ? `#1 in ${row.genre}` : row.genre}
          </a>
          <span className="m-dev">{row.developer}</span>
          <span className="m-rating">
            <span className="star">{"★"}</span>
            {rating(row.rating)} ({row.ratingCount.toLocaleString("en-US")})
          </span>
          {/* The ROI number. It is what makes the next bidder pay, so it is not gray. */}
          <span className="m-clicks">{clicks.toLocaleString("en-US")} clicks</span>
          <span className="m-price">{priceLabel(row)}</span>
          {/* Clock-derived text. See held() in lib/format.ts. */}
          <time
            className="m-age"
            dateTime={new Date(row.lastBidAt).toISOString()}
            suppressHydrationWarning
          >
            {held(row.lastBidAt)}
          </time>
        </p>
      </div>
      <div className="money">
        <span className="bid">{money(row.bid)}</span>
        {/*
          `row.priceToTake` is priceToTake() from convex/rules.ts, evaluated
          server-side against the same top bid the checkout will price against,
          so the CTA and the charge cannot disagree.
        */}
        <button
          type="button"
          className="claim"
          aria-label={`Claim rank ${row.rank} for ${price}`}
          onClick={() => claimRank(row.priceToTake)}
        >
          <span className="claim-prefix">claim for </span>
          {price}
        </button>
      </div>
    </li>
  );
}

/**
 * Memoised on identity, money, taps, rank and the leader mark, so a settled bid
 * that moves one listing repaints one row instead of fifty.
 *
 * ponytail: a metadata-only refresh (the 24h Apple resync renaming an app
 * without a payment) will not repaint until the next bid. Add `name` to the
 * comparator if that ever shows up in practice.
 */
export const BoardRow = memo(
  Row,
  (a, b) =>
    a.row.id === b.row.id &&
    a.row.bid === b.row.bid &&
    a.row.rank === b.row.rank &&
    a.clicks === b.clicks &&
    a.leader === b.leader,
);
