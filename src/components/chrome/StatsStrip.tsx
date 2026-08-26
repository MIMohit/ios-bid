import type { FunctionReturnType } from "convex/server";
import type { api } from "@convex/_generated/api";

export type SiteStats = FunctionReturnType<typeof api.stats.strip>;

/**
 * The live line under the header. Fixed height whether or not the numbers have
 * arrived, so the first push from Convex never moves the board.
 *
 * Both numbers are maintained fields on one document, not range reads, so this
 * subscription re-pushes when the 20 second counter cron finds a real change
 * and at no other time.
 */
export function StatsStrip({ stats }: { stats: SiteStats }) {
  return (
    <div className="stats">
      <span>
        <span className="live" />
        <b>{stats.online.toLocaleString("en-US")}</b> online
      </span>
      <span className="stat-visitors">
        <b>{stats.visitors.toLocaleString("en-US")}</b> visitors since launch
      </span>
      <span>
        <a href="/stats">see stats →</a>
      </span>
    </div>
  );
}
