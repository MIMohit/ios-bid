/**
 * Display formatting, shared by every component. Ported from the Next.js tree
 * with the timestamp helpers widened to accept a ms epoch, because Convex
 * stores every date as a number.
 */

/** Whole dollars only. This function must never emit a decimal point. */
export function money(dollars: number): string {
  return "$" + dollars.toLocaleString("en-US");
}

export function compact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "") + "K";
  return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
}

type Timestamp = Date | string | number;

function toMs(at: Timestamp): number {
  return typeof at === "number" ? at : new Date(at).getTime();
}

/** "3 minutes ago", "yesterday", "2 days ago". The board's voice. */
export function ago(at: Timestamp): string {
  const seconds = Math.max(1, Math.floor((Date.now() - toMs(at)) / 1000));

  if (seconds < 60) return "just now";
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    return `${m} ${m === 1 ? "minute" : "minutes"} ago`;
  }
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    return `${h} ${h === 1 ? "hour" : "hours"} ago`;
  }
  const days = Math.floor(seconds / 86400);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} ${months === 1 ? "month" : "months"} ago`;
  return `${Math.floor(months / 12)}y ago`;
}

/** "6 days", "3 hours". How long the current holder has held the slot. */
export function held(since: Timestamp): string {
  const seconds = Math.max(1, Math.floor((Date.now() - toMs(since)) / 1000));
  if (seconds < 3600) {
    const m = Math.max(1, Math.floor(seconds / 60));
    return `${m} ${m === 1 ? "minute" : "minutes"}`;
  }
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    return `${h} ${h === 1 ? "hour" : "hours"}`;
  }
  const d = Math.floor(seconds / 86400);
  return `${d} ${d === 1 ? "day" : "days"}`;
}

/** Apple's averageUserRating is optional. "-" is the placeholder, never "0.0". */
export function rating(value: number | null | undefined): string {
  return value ? value.toFixed(1) : "-";
}

export function hoursSince(at: Timestamp): number {
  return Math.floor((Date.now() - toMs(at)) / 3_600_000);
}
