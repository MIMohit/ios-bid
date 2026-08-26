import type { ReactNode } from "react";
import { held, money, rating } from "~/lib/format";
import { shot, shotSrcSet } from "~/lib/icon";
import { claimRank } from "~/lib/bid-store";
import { AppIcon } from "./AppIcon";
import { TIER_ICON_PX, priceLabel, type BoardRowData } from "./BoardRow";

/**
 * Three at size, and the first one again as the band's colour field. The board
 * query caps `screenshots` at six; taking three here rather than in CSS means
 * three <img> elements exist instead of six, of which three are display:none.
 */
const SHOTS = 3;

/** Rendered CSS width of one screenshot. board.css owns the matching height. */
const SHOT_W = 152;

/**
 * The #1 treatment. This is what a prospective bidder is actually buying, so it
 * shows the whole listing: the app's own App Store screenshots behind Liquid
 * Glass, its icon, name, subtitle, developer, category, rating, price, what was
 * paid, how long it has been held, how many taps the slot has sent, and what it
 * costs to take it.
 *
 * The screenshot band is the one place uncontrolled remote images meet a fixed
 * layout, and every degenerate case is answered by geometry rather than by a
 * branch here:
 *
 *   zero screenshots     no <img> is emitted at all, .spot-shots is :empty and
 *                        collapses, and the band's gradients still paint at the
 *                        same 400px so nothing above or below it moves.
 *   landscape iPad shots the figure sets an explicit width and height and clips
 *                        its overflow; the image covers. An aspect ratio that
 *                        arrives from Apple cannot reach the layout.
 *   one or two shots     the flex row carries what exists, and the stagger in
 *                        board.css is written from the end so they still land
 *                        on the band's baseline.
 *
 * There is no detail page and never will be, so the app name is the only
 * outbound link and it goes through /go/:slug like every other row.
 */
export function SpotlightPanel({
  row,
  clicks,
  children,
}: {
  /** The rank 1 row. It is the only row on which `board.page` returns screenshots. */
  row: BoardRowData;
  /** From `api.clicks.forListings`, so a tap never invalidates the board. */
  clicks: number;
  /** The bid bar, which overhangs the bottom edge of the band. */
  children?: ReactNode;
}) {
  const shots = row.screenshots.slice(0, SHOTS);
  const ambient = shots[0];

  // Apple's subtitle is already a first sentence and fits the band. The 400
  // character description is the fallback and is cut to roughly the same
  // measure, because .spot-sub has no line clamp and nine lines of prose would
  // push the panel past its fixed height.
  const blurb =
    row.subtitle ??
    (row.description ? `${row.description.slice(0, 140).replace(/\s+\S*$/, "")}…` : null);

  return (
    <section className="spotlight" aria-label={`Rank 1, ${row.name}`}>
      <div className="spot-bg">
        {ambient ? (
          <img
            className="spot-ambient"
            src={shot(ambient, 1000)}
            alt=""
            aria-hidden="true"
            decoding="async"
            fetchPriority="high"
          />
        ) : null}
      </div>
      <div className="spot-dim" />
      <div className="spot-fade" />

      <div className="page spot-in">
        <div className="spot-left">
          <div className="spot-eyebrow">
            <span className="spot-rank">#1</span>
            <span className="spot-hold">
              {/* Clock-derived text. See held() in lib/format.ts. */}
              held for{" "}
              <time dateTime={new Date(row.lastBidAt).toISOString()} suppressHydrationWarning>
                {held(row.lastBidAt)}
              </time>
              {" · outbid it and this whole panel is yours"}
            </span>
          </div>

          <div className="spot-head">
            <AppIcon url={row.iconUrl} px={TIER_ICON_PX[1]} eager />
            <div>
              <h1 className="spot-title">
                <a
                  href={`/go/${row.slug}?r=1`}
                  target="_blank"
                  rel="sponsored nofollow noopener"
                  referrerPolicy="no-referrer"
                >
                  {row.name}
                </a>
              </h1>
              {blurb ? <p className="spot-sub">{blurb}</p> : null}
              <p className="spot-meta">
                {/* The global #1 holds the highest bid on the board, so it is
                    the leader of its own category by definition. */}
                <span className="is-leader">
                  <span className="lead-dot" />
                  {`#1 in ${row.genre}`}
                </span>
                {/* Same reason the row carries it: the anchor points at /go/ so
                    the tap is counted, so nothing else on the panel names the
                    store it links to. This is the most-viewed listing on the
                    site, so it is the last one that should stay silent. */}
                <span className="m-store">apps.apple.com</span>
                <span>{row.developer}</span>
                <span>
                  <span className="star">{"★"}</span>
                  {rating(row.rating)} ({row.ratingCount.toLocaleString("en-US")})
                </span>
                <span>{priceLabel(row)}</span>
              </p>
            </div>
          </div>

          <div className="spot-money">
            <span className="spot-bid money-t">{money(row.bid)}</span>
            <span className="spot-clicks">
              <b>{clicks.toLocaleString("en-US")}</b> clicks sent since it took the top
            </span>
            {/* Same priceToTake() the checkout prices against, evaluated server
                side, so the CTA and the charge cannot disagree. */}
            <button
              type="button"
              className="spot-claim"
              onClick={() => claimRank(row.priceToTake, 1)}
            >
              claim this rank for {money(row.priceToTake)}
            </button>
          </div>
        </div>

        <div className="spot-shots">
          {shots.map((url, index) => (
            <figure className="shot" key={url}>
              <img
                src={shot(url, SHOT_W)}
                srcSet={shotSrcSet(url, SHOT_W)}
                width={SHOT_W}
                height={SHOT_W * 2}
                alt={`${row.name} App Store screenshot ${index + 1}`}
                decoding="async"
                loading="lazy"
              />
            </figure>
          ))}
        </div>
      </div>

      {children}
    </section>
  );
}
