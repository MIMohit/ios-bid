import Image from "next/image";
import Link from "next/link";
import type { Row } from "@/lib/bidding";
import { getCategory } from "@/lib/categories";
import { ago, compact, money } from "@/lib/format";

/** Top three get a tinted, raised card — #1 in gold, the rest in the accent. */
function podium(rank: number) {
  if (rank === 1)
    return {
      card: "border-transparent bg-gold-soft ring-1 ring-gold/30",
      badge: "bg-gold text-white",
      amount: "text-gold",
    };
  if (rank <= 3)
    return {
      card: "border-transparent bg-accent-soft ring-1 ring-accent/20",
      badge: "bg-accent text-white",
      amount: "text-accent",
    };
  return {
    card: "border-line bg-surface hover:border-line-strong",
    badge: "bg-surface-2 text-muted ring-1 ring-line",
    amount: "text-ink",
  };
}

export function ListingRow({ row, showTodayNote = false }: { row: Row; showTodayNote?: boolean }) {
  const { listing, rank, bid } = row;
  const style = podium(rank);
  const big = rank <= 3;
  const category = getCategory(listing.categorySlug);
  const claimFor = bid + (rank === 1 ? 5 : 1);

  return (
    <li className={`group rounded-2xl border p-3 shadow-card transition sm:p-3.5 ${style.card}`}>
      <div className="flex items-start gap-3">
        <span
          className={`tnum mt-0.5 grid shrink-0 place-items-center rounded-lg px-1.5 text-xs font-bold ${style.badge}`}
          style={{ minWidth: big ? 38 : 34, height: big ? 26 : 24 }}
        >
          #{rank}
        </span>

        <a
          href={`/go/${listing.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 transition hover:scale-105"
          aria-label={`Open ${listing.name} on the App Store`}
        >
          <Image
            src={listing.iconUrl}
            alt=""
            width={big ? 60 : 48}
            height={big ? 60 : 48}
            className="squircle ring-1 ring-black/5 dark:ring-white/10"
            style={{ width: big ? 60 : 48, height: big ? 60 : 48 }}
            unoptimized
          />
        </a>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <a
              href={`/go/${listing.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`min-w-0 font-semibold leading-snug tracking-tight hover:underline ${big ? "text-[15px]" : "text-sm"}`}
            >
              {listing.name}
            </a>
            <span className={`tnum shrink-0 font-bold tabular-nums ${style.amount} ${big ? "text-base" : "text-sm"}`}>
              {money(bid)}
            </span>
          </div>

          {listing.subtitle && (
            <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-muted">{listing.subtitle}</p>
          )}

          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-faint">
            <span>{ago(listing.lastBidAt)}</span>
            <span aria-hidden>·</span>
            <span className="max-w-[14ch] truncate sm:max-w-none">{listing.developer}</span>
            <span aria-hidden>·</span>
            <Link href={`/category/${listing.categorySlug}`} className="transition hover:text-ink">
              {category?.emoji} {category?.name ?? listing.genre}
            </Link>
            {listing.rating != null && listing.rating > 0 && (
              <>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-0.5">
                  <svg viewBox="0 0 24 24" className="size-2.5 text-gold" fill="currentColor" aria-hidden>
                    <path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.9L12 17.8 5.8 21l1.2-6.9-5-4.9 6.9-1L12 2Z" />
                  </svg>
                  {listing.rating.toFixed(1)}
                </span>
              </>
            )}
            {listing.formattedPrice && (
              <>
                <span aria-hidden>·</span>
                <span>{listing.formattedPrice}</span>
              </>
            )}
            <span aria-hidden>·</span>
            <span className="font-medium text-accent">{compact(listing.clicks)} clicks</span>
            <span aria-hidden>·</span>
            <Link href={`/app/${listing.slug}`} className="underline decoration-dotted underline-offset-2 transition hover:text-ink">
              see details
            </Link>
          </div>

          {showTodayNote && listing.totalBid !== bid && (
            <p className="mt-1 text-[11px] text-faint">All-time: {money(listing.totalBid)}</p>
          )}
        </div>
      </div>

      <p className="mt-2 hidden pl-[50px] text-[11px] text-faint group-hover:block">
        claim this rank for <span className="font-semibold text-ink">{money(claimFor)}</span>
      </p>
    </li>
  );
}
