import type { FunctionReturnType } from "convex/server";
import type { api } from "@convex/_generated/api";
import { held, money } from "~/lib/format";

export type ActivityItem = FunctionReturnType<typeof api.bids.recentActivity>[number];

/**
 * Latest settled payments, sitting between rank 3 and rank 4.
 *
 * The strip is a fixed height whether or not it has entries, because a ticker
 * that grows from nothing pushes ranks 4 through 50 down the page and is a large
 * layout shift on its own. It renders empty rather than not at all.
 *
 * `amount` is what Stripe charged and `totalAfter` is where the listing landed,
 * so the two differ exactly when the payment was a raise. That is the whole
 * verb decision, no extra field needed.
 */
export function ActivityTicker({ items }: { items: readonly ActivityItem[] }) {
  return (
    <li className="tape-wrap" role="presentation">
      <div className="tape">
        <span className="tape-label">Latest activity</span>
        <div className="tape-scroll">
          {items.map((item) => {
            const isRaise = item.amount !== item.totalAfter;
            const where = item.rank === null ? "" : ` #${item.rank}`;
            return (
              <span className="tape-item" key={item.bidId}>
                <b>{item.name}</b> {isRaise ? "raised to" : "entered at"}
                {where} <em>{isRaise ? `+${money(item.amount)}` : money(item.amount)}</em>
                <i>
                  {/* Clock-derived text. See held() in lib/format.ts. */}
                  <time dateTime={new Date(item.paidAt).toISOString()} suppressHydrationWarning>
                    {held(item.paidAt)}
                  </time>
                </i>
              </span>
            );
          })}
        </div>
      </div>
    </li>
  );
}
