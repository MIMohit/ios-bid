import type { FunctionReturnType } from "convex/server";
import type { api } from "@convex/_generated/api";
import { TRAFFIC_DASHBOARD } from "~/lib/analytics";

export type SiteStats = FunctionReturnType<typeof api.stats.strip>;

/**
 * The live line under the header. Fixed height whether or not the numbers have
 * arrived, so the first push from Convex never moves the board.
 *
 * Both numbers are maintained fields on one document, not range reads, so this
 * subscription re-pushes when the 20 second counter cron finds a real change
 * and at no other time.
 *
 * "see stats" goes to PostHog's own hosted dashboard rather than to /stats.
 * The two answer different questions and both are published: PostHog knows
 * where the traffic came from, /stats knows what the board did with it, and
 * the footer still links there. A board that sells attention should show its
 * own traffic without asking anyone to trust a number we render ourselves.
 */
export function StatsStrip({ stats }: { stats: SiteStats }) {
  return (
    <div className="stats">
      <p className="stats-pill">
        <span>
          <span className="live" />
          <span className="stats-online">{stats.online.toLocaleString("en-US")}</span> online
        </span>
        <span className="stat-visitors">
          <b>{stats.visitors.toLocaleString("en-US")}</b> visitors since launch
        </span>
        <span>
          {/* Somebody else's origin, so it opens in its own tab and carries no
              referrer-borne window handle back to this one. */}
          <a href={TRAFFIC_DASHBOARD} target="_blank" rel="noopener noreferrer">
            see stats →
          </a>
        </span>
      </p>
    </div>
  );
}
