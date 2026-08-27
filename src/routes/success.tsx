import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { z } from "zod";
import { api } from "@convex/_generated/api";
import { AppIcon } from "~/components/board/AppIcon";
import { Footer } from "~/components/chrome/Footer";
import { Header } from "~/components/chrome/Header";
import { ConnectionState } from "~/components/ConnectionState";
import { money } from "~/lib/format";
import { pageHead } from "~/lib/seo";

/** Stripe appends its own `{CHECKOUT_SESSION_ID}` to the return URL. */
const searchSchema = z.object({ session_id: z.string().catch("") });

/**
 * X share intent. The app name, the rank and the amount are the whole post, and
 * the URL is the listing's own receipt rather than the board: a link to `/` puts
 * the buyer's followers in front of whoever holds the spotlight today, which on
 * a board where the buyer is row 37 is somebody else's app.
 */
function shareHref(name: string, slug: string, rank: number | null, amount: number): string {
  const place = rank === null ? "is on iosrank.lol" : `is #${rank} on iosrank.lol`;
  const text = `${name} ${place} for ${money(amount)}. The row shows its own tap count.`;
  const url = `https://iosrank.lol/r/${slug}`;
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}

/**
 * How long a settled-looking payment is allowed to stay `pending` before the
 * page stops saying "any moment now" and hands over a reference. The webhook
 * normally lands inside a second; a minute means something is wrong on our side,
 * and the buyer has no other record because checkout sets no receipt_email.
 */
const STUCK_MS = 60_000;

/**
 * The one thing a stuck or unconfirmed payment owes the buyer: a string they can
 * quote at us. Rendered wherever this page cannot say "you are on the board".
 */
function Reference({ sessionId }: { sessionId: string }) {
  return (
    <p className="revenue">
      {sessionId === "" ? null : (
        <>
          Reference <b style={{ overflowWrap: "anywhere" }}>{sessionId}</b>.{" "}
        </>
      )}
      Email hello@iosrank.lol with your card statement line and we will place the rank or refund it.
    </p>
  );
}

export const Route = createFileRoute("/success")({
  validateSearch: searchSchema,
  loaderDeps: ({ search: { session_id } }) => ({ session_id }),

  loader: async ({ context, deps }) => {
    await context.queryClient.ensureQueryData(
      convexQuery(api.bids.bySession, { checkoutId: deps.session_id }),
    );
    return null;
  },

  // Per visitor and never cached. This page is about one person's payment.
  headers: () => ({ "cache-control": "private, no-store" }),

  head: () =>
    pageHead({
      // Static, so it cannot claim an outcome the body may contradict: this
      // route also renders the unconfirmed and stuck states.
      title: "Checkout · iosrank.lol",
      description: "Where your bid stands.",
      // No canonical: this URL is per payment and belongs in no index.
      noindex: true,
      nofollow: true,
    }),

  component: Success,
});

function Success() {
  const { session_id } = Route.useSearch();

  // A live subscription, not a poll. If Stripe's webhook has not landed yet this
  // is "pending", and the same subscription flips it to "paid" the instant
  // internal.bids.settle commits. There is nothing here to refresh.
  const bid = useSuspenseQuery(convexQuery(api.bids.bySession, { checkoutId: session_id })).data;

  // "Pending" is the normal first frame and resolves itself. Past a minute it is
  // no longer a frame, it is a fault, and the copy has to change with it.
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    if (bid?.status !== "pending") return;
    const timer = setTimeout(() => setStuck(true), STUCK_MS);
    return () => clearTimeout(timer);
  }, [bid?.status]);

  return (
    <>
      <Header window="all" hrefFor={(w) => (w === "all" ? "/" : "/today")} />
      <ConnectionState />

      <main className="page">
        {bid === null ? (
          <>
            <div className="board-head">
              <h1>Nothing to show</h1>
              <p>
                We have no payment matching this link. <a href="/">Back to the board</a>.
              </p>
            </div>
            <Reference sessionId={session_id} />
          </>
        ) : bid.status === "failed" ? (
          /*
            "Failed" is not the same claim as "not charged". A pending bid is
            swept to failed at 26 hours (convex/maintenance.ts), so a webhook we
            never received puts a real payer in this exact state, and this page
            cannot tell that apart from an abandoned checkout. Say what we know,
            which is that no rank was taken, and hand over the reference.
          */
          <>
            <div className="board-head">
              <h1>That payment was never confirmed</h1>
              <p>
                No rank was taken. If your card was not charged there is nothing to do.{" "}
                <a href="/">Try again from the board</a>.
              </p>
            </div>
            <Reference sessionId={session_id} />
          </>
        ) : (
          <>
            <div className="board-head">
              <h1>
                {bid.status === "paid"
                  ? bid.rank === null
                    ? "You are on the board"
                    : `You are #${bid.rank}`
                  : "Payment received"}
              </h1>
              <p>
                {bid.status === "paid"
                  ? `${money(bid.amount)} charged. ${bid.listing ? `${bid.listing.name} now holds ${money(bid.totalAfter)} on the board` : `The listing now holds ${money(bid.totalAfter)}`}, and it keeps that rank until somebody pays more.`
                  : stuck
                    ? "Stripe has the payment but our confirmation has not arrived. Your rank is not lost, it settles as soon as the confirmation lands, and the reference below is how we find it if it does not."
                    : "Stripe has taken the payment and the board updates the moment it confirms. This page does it on its own, so there is nothing to refresh."}
              </p>
            </div>

            {bid.listing ? (
              <p className="stat">
                <AppIcon url={bid.listing.iconUrl} px={44} eager />
                <span>{bid.listing.name}</span>
              </p>
            ) : null}

            {stuck && bid.status === "pending" ? <Reference sessionId={session_id} /> : null}

            {bid.status === "paid" && bid.listing ? (
              <p className="revenue">
                <a
                  className="spot-claim"
                  href={shareHref(bid.listing.name, bid.listing.slug, bid.rank, bid.amount)}
                  target="_blank"
                  rel="noopener"
                >
                  Post it on X
                </a>
              </p>
            ) : null}

            {/* The receipt first. Without it the only route to /r/:slug is the
                X intent's url parameter, so a buyer who does not post has no
                way to reach, copy or re-find the page they just paid for. */}
            <p className="revenue">
              {bid.status === "paid" && bid.listing ? (
                <>
                  <a href={`/r/${bid.listing.slug}`}>Your receipt</a>
                  {" · "}
                </>
              ) : null}
              <a href="/">See the board</a> · <a href="/stats">Watch the taps arrive</a>
            </p>
          </>
        )}

        <Footer />
      </main>
    </>
  );
}
