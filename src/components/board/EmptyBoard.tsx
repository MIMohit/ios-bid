import { MIN_BID } from "@convex/rules";
import { money } from "~/lib/format";

/** The launch state. No seeded rows, no "unclaimed" placeholders. */
export function EmptyBoard() {
  return <p className="empty">Nobody has bid yet. {money(MIN_BID)} takes #1.</p>;
}
