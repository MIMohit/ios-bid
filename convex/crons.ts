import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Drains the visitor counter and recounts presence into `siteStat`. The only job
// that reads the presence table, which is what keeps heartbeats off the board.
crons.interval("sync counters", { seconds: 20 }, internal.stats.syncCounters);

// Yesterday's taps, revenue, payments and impressions, at 00:10 UTC.
crons.cron("daily rollup", "10 0 * * *", internal.stats.rollupDay, {});

// Stale presence, expired dedupe keys, abandoned pending bids, old dailyStats.
crons.interval("sweep", { hours: 1 }, internal.maintenance.sweep);

// Three jobs, and none of them writes anything a board, ticker, rail or strip
// query reads. That is the invariant to check before adding a fourth.
//
// There is deliberately no clock-document tick to age the Today board. That would
// rewrite a document every few minutes whether or not anything changed, forcing a
// global board repaint each time, and would still leave the board wrong by up to a
// full tick. The Today window decays through internal.today.expireBid instead,
// scheduled per payment at paidAt + 24h, which is exact and transactional.
//
// There is also deliberately no fold of tap counts onto the listing documents.
// See the note on api.clicks.forListings: it would put the highest rate write on
// the site into the read set of every board, rail and ticker subscription.
export default crons;
