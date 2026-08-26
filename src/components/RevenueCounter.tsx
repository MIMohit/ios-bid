import { hoursSince, money } from "~/lib/format";

type Props = {
  /** Whole dollars settled since launch, from `api.stats.strip`. */
  revenue: number;
  /** ms epoch written by `internal.maintenance.init`. 0 before it has run. */
  launchedAt: number;
};

/**
 * The honest line at the bottom of the board: what this has actually made.
 *
 * No count-up animation. The number ticks when a payment settles and Convex
 * pushes it, which is the only movement it has ever needed, and an animated
 * counter would repaint every frame for a value that changes twice a day.
 *
 * Renders nothing before `launchedAt` exists rather than claiming the epoch.
 */
export function RevenueCounter({ revenue, launchedAt }: Props) {
  if (launchedAt === 0) return null;

  const hours = Math.max(1, hoursSince(launchedAt));

  return (
    <p className="revenue">
      this project has made <b className="money-t">{money(revenue)}</b> since its launch{" "}
      {/* Clock-derived text. See held() in lib/format.ts. */}
      <span suppressHydrationWarning>{hours.toLocaleString("en-US")} hours ago</span>
    </p>
  );
}
