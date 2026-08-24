export function money(dollars: number): string {
  return "$" + dollars.toLocaleString("en-US");
}

export function compact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "") + "K";
  return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
}

/** "3 minutes ago", "yesterday", "2 days ago" — matching the board's voice. */
export function ago(date: Date | string): string {
  const then = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.max(1, Math.floor((Date.now() - then.getTime()) / 1000));

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
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

export function rating(value: number | null): string {
  return value ? value.toFixed(1) : "—";
}

export function hoursSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / 3_600_000);
}
