"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ago, money } from "@/lib/format";

type Item = {
  id: string;
  name: string;
  slug: string;
  iconUrl: string;
  amount: number;
  rank: number;
  paidAt: string;
};

/** The live feed of bids that just settled, sitting between #3 and #4. */
export function ActivityTicker({ initial }: { initial: Item[] }) {
  const [items, setItems] = useState(initial);

  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const res = await fetch("/api/activity", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.items)) setItems(data.items);
      } catch {
        // A stale ticker is fine; nothing to recover from.
      }
    }, 20_000);
    return () => clearInterval(poll);
  }, []);

  if (items.length === 0) return null;
  const loop = items.length >= 4 ? [...items, ...items] : items;

  return (
    <div className="my-3 overflow-hidden rounded-2xl border border-line bg-surface-2 py-2.5">
      <p className="mb-2 flex items-center gap-1.5 px-3.5 text-[11px] font-medium uppercase tracking-wide text-faint">
        <span className="pulse-dot size-1.5 rounded-full bg-green" aria-hidden />
        Latest activity
      </p>
      <div className="relative overflow-hidden">
        <ul className={`flex w-max gap-2 px-3.5 ${loop.length > items.length ? "marquee" : ""}`}>
          {loop.map((item, i) => (
            <li key={`${item.id}-${i}`}>
              <Link
                href={`/app/${item.slug}`}
                className="flex w-56 items-center gap-2 rounded-xl border border-line bg-surface px-2.5 py-2 transition hover:border-line-strong"
              >
                <Image src={item.iconUrl} alt="" width={28} height={28} className="squircle size-7 shrink-0 ring-1 ring-line" unoptimized />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">{item.name}</span>
                  <span className="block truncate text-[11px] text-faint">
                    at #{item.rank} · <span className="text-accent">{money(item.amount)}</span> · {ago(item.paidAt)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
