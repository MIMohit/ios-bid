"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Stats = { online: number; visitors: number; listings: number; revenue: number };

export function LiveStats({ initial }: { initial: Stats }) {
  const [stats, setStats] = useState(initial);

  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const res = await fetch("/api/stats", { cache: "no-store" });
        if (res.ok) setStats(await res.json());
      } catch {}
    }, 30_000);
    return () => clearInterval(poll);
  }, []);

  return (
    <p className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 pt-5 text-xs text-muted">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green/10 px-2 py-0.5 font-medium text-green">
        <span className="pulse-dot size-1.5 rounded-full bg-green" aria-hidden />
        {stats.online.toLocaleString()} online
      </span>
      <span aria-hidden>·</span>
      <span className="tnum">{stats.visitors.toLocaleString()} visitors since launch</span>
      <span aria-hidden>·</span>
      <span className="tnum">{stats.listings.toLocaleString()} apps on the board</span>
      <span aria-hidden>·</span>
      <Link href="/about" className="text-accent transition hover:underline">
        see stats →
      </Link>
    </p>
  );
}
