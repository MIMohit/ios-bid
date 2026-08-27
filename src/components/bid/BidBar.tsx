import { useEffect, useState, type FormEvent } from "react";
import { useAction, useConvex } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { ConvexError } from "convex/values";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import { MIN_BID } from "@convex/rules";
import { money } from "~/lib/format";
import { icon, iconSrcSet } from "~/lib/icon";
import { BID_FORM_ID, BID_INPUT_ID, setBidAmount, useBidAmount } from "~/lib/bid-store";
import { AmountStepper } from "./AmountStepper";

/** Apple metadata, derived from the action rather than restated here. */
type Lookup = FunctionReturnType<typeof api.appstore.lookup>;
type AppMatch = Extract<Lookup, { match: unknown }>["match"];
type Quote = FunctionReturnType<typeof api.bids.quote>;
type BoardWindow = FunctionArgs<typeof api.board.place>["window"];

/**
 * Every user-facing rejection on this deployment is a ConvexError carrying
 * `{ code, message }`, because a plain Error's message is scrubbed in
 * production. Anything else is a bug, not a message worth showing.
 */
function reason(error: unknown): string {
  const data: unknown = error instanceof ConvexError ? error.data : undefined;
  if (typeof data === "object" && data !== null && "message" in data) {
    if (typeof data.message === "string") return data.message;
  }
  return "Something went wrong. Nothing has been charged.";
}

type Props = {
  /**
   * What taking #1 costs right now, from `api.board.pricing` or the board page.
   * It is the amount shown until a row's claim button names a different one.
   */
  priceForTop: number;
  /** Which board the place in the heading is counted inside. */
  window?: BoardWindow;
  categorySlug?: string;
  /**
   * True where there is no spotlight band above the bar to overhang: page 2, a
   * category board with no listings, the /rules page.
   */
  flat?: boolean;
};

/**
 * The bid bar: the site's primary call to action.
 *
 * It is the ONLY subscriber to the prefill store. Every row on the board writes
 * to that store through `claimRank()`, and holding the amount in a parent's
 * state instead would repaint all fifty rows on the site's primary interaction.
 *
 * The amount here is advisory. `api.stripe.createCheckout` reprices server side
 * against `internal.bids.quoteInternal` before it creates a session, so what is
 * charged comes from the same function that priced this quote and the two
 * cannot disagree.
 */
export function BidBar({
  priceForTop,
  window: board = "all",
  categorySlug,
  flat = false,
}: Props) {
  const convex = useConvex();
  const lookup = useAction(api.appstore.lookup);
  const checkout = useAction(api.stripe.createCheckout);

  const asked = useBidAmount();
  const amount = asked ?? priceForTop;

  // What this amount actually buys. The heading names it and the steppers walk
  // it, so dialling under the rounded #1 price is a legible move rather than a
  // number that quietly stops meaning #1.
  //
  // `asked`, not `amount`: until the visitor names a figure this is the same
  // null the route loader prefetched with, so the first paint already has a
  // ladder instead of fetching one after hydration.
  const place = useQuery({
    ...convexQuery(api.board.place, { window: board, categorySlug, amount: asked }),
    // Keep the last ladder while the next one loads. The rung for the amount you
    // just left is the rung for the amount you are on, and an undefined ladder
    // turns a rung press into a plain dollar step.
    placeholderData: (previous) => previous,
  }).data;

  // Until the board answers, the amount on screen is the rounded #1 price,
  // which is #1 by construction. A place too deep for the board to name stays
  // unnamed rather than guessed at.
  const rank = place === undefined ? (amount >= priceForTop ? 1 : null) : place.rank;

  const [text, setText] = useState("");
  const [app, setApp] = useState<AppMatch | null>(null);
  const [picks, setPicks] = useState<readonly AppMatch[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Apple lookup, debounced. `app` in the guard rather than in the dependency
  // list would still re-run the effect on selection, so it is both.
  useEffect(() => {
    const input = text.trim();
    if (app !== null || input.length < 2) return;

    let live = true;
    const timer = setTimeout(() => {
      lookup({ input })
        .then((found) => {
          if (!live) return;
          setError(null);
          if ("match" in found) {
            setApp(found.match);
            setPicks([]);
          } else {
            setPicks(found.suggestions);
          }
        })
        .catch((cause: unknown) => {
          if (!live) return;
          setPicks([]);
          setError(reason(cause));
        });
    }, 350);

    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [text, app, lookup]);

  // The quote, once an app is resolved. Called imperatively rather than through
  // useQuery on purpose: `api.bids.quote` throws a ConvexError for an amount
  // below the floor, and a throwing subscription would take the page to the
  // error boundary instead of putting one line under the field.
  useEffect(() => {
    if (app === null) {
      setQuote(null);
      return;
    }

    let live = true;
    const timer = setTimeout(() => {
      convex
        .query(api.bids.quote, { appId: app.appId, amount })
        .then((priced) => {
          if (!live) return;
          setQuote(priced);
          setError(null);
        })
        .catch((cause: unknown) => {
          if (!live) return;
          setQuote(null);
          setError(reason(cause));
        });
    }, 200);

    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [convex, app, amount]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    // A null quote means the last pricing call was rejected and the note under
    // the field already says why. Without this the button spends a five hop
    // round trip to return the same sentence.
    if (app === null || quote === null || busy) return;
    setBusy(true);
    try {
      const session = await checkout({ appId: app.appId, amount });
      // Stripe's hosted page. Nothing about the card touches this origin.
      window.location.href = session.url;
    } catch (cause: unknown) {
      setError(reason(cause));
      setBusy(false);
    }
  };

  return (
    <div className={flat ? "page bidwrap is-flat" : "page bidwrap"}>
      <form className="bidbar rim" id={BID_FORM_ID} onSubmit={submit}>
        <div className="hero">
          <span className="hero-label">
            {rank === null ? "Claim a rank for" : `Claim #${rank} for`}
          </span>
          <AmountStepper value={amount} ladder={place} onChange={setBidAmount} />
        </div>

        <p className="hero-rule">
          New listings start at <b>{money(MIN_BID)}</b>. Paying less than the #1 price is not an
          error, it buys whatever rank the amount reaches. Whole dollars only.
        </p>

        <div className="bidform">
          <input
            className="field"
            id={BID_INPUT_ID}
            type="text"
            autoComplete="off"
            placeholder="App Store link, or just the app name"
            aria-label="App Store link or app name"
            value={text}
            onChange={(event) => {
              setText(event.currentTarget.value);
              // Editing the field un-picks the app: the resolved id must never
              // outlive the text it was resolved from.
              setApp(null);
              setPicks([]);
              setError(null);
            }}
          />

          {/*
            Not a control. The category is Apple's own primaryGenreId mapped
            through convex/lib/categories.ts, so there is nothing here for a
            bidder to choose and a disabled <select> only promises otherwise.
            Two short lines: the field name, then where the value comes from or
            the value itself once Apple has answered.
          */}
          <p className="bid-cat">
            <span>Category</span>
            {app === null ? "from the App Store" : app.genre}
          </p>

          <button className="outbid" type="submit" disabled={app === null || quote === null || busy}>
            {busy ? "Opening" : "Outbid"}
          </button>
        </div>

        {picks.length > 0 ? (
          <div className="bid-picks">
            {picks.slice(0, 5).map((pick) => (
              <button
                type="button"
                className="bid-pick"
                key={pick.appId}
                onClick={() => {
                  setApp(pick);
                  setPicks([]);
                  setText(pick.name);
                }}
              >
                <span className="icon">
                  <img
                    src={icon(pick.iconUrl, 28)}
                    srcSet={iconSrcSet(pick.iconUrl, 28)}
                    width={28}
                    height={28}
                    alt=""
                    decoding="async"
                  />
                </span>
                <span>{pick.name}</span>
                <i>{pick.developer}</i>
              </button>
            ))}
          </div>
        ) : null}

        <BidNote app={app} quote={quote} error={error} />
      </form>
    </div>
  );
}

/**
 * One line under the form: what was resolved, what it costs, or why it was
 * rejected. Its height is reserved whether or not it has anything to say, so
 * the bar does not grow the first time somebody types.
 */
function BidNote({
  app,
  quote,
  error,
}: {
  app: AppMatch | null;
  quote: Quote | null;
  error: string | null;
}) {
  if (error !== null) {
    return (
      <p className="bid-note is-error" role="status">
        {error}
      </p>
    );
  }

  if (app === null) return <p className="bid-note" />;

  return (
    <p className="bid-note" role="status">
      <b>{app.name}</b> by {app.developer}
      {quote === null ? null : quote.isRaise ? (
        <>
          {" "}
          is already on the board at <span className="money-t">{money(quote.currentBid)}</span>.
          Raising it to <span className="money-t">{money(quote.newTotal)}</span> charges only the
          difference, <span className="money-t">{money(quote.charge)}</span>.
        </>
      ) : (
        <>
          {" "}
          enters the board at <span className="money-t">{money(quote.newTotal)}</span>.
        </>
      )}
    </p>
  );
}
