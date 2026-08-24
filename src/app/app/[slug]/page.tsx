import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { RaiseWidget } from "@/components/RaiseWidget";
import { prisma } from "@/lib/db";
import { getCategory } from "@/lib/categories";
import { ago, money, rating } from "@/lib/format";
import { MIN_BID } from "@/lib/bidding";

export const dynamic = "force-dynamic";

async function findListing(slug: string) {
  return prisma.listing.findUnique({ where: { slug } });
}

async function rankOf(id: string, totalBid: number, firstBidAt: Date) {
  const above = await prisma.listing.count({
    where: {
      OR: [
        { totalBid: { gt: totalBid } },
        { totalBid, firstBidAt: { lt: firstBidAt } },
      ],
    },
  });
  return above + 1;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const listing = await findListing(slug);
  if (!listing) return { title: "App not found" };
  return {
    title: listing.name,
    description: listing.subtitle ?? listing.description?.slice(0, 160),
    openGraph: { images: [listing.iconUrl] },
  };
}

export default async function AppDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const listing = await findListing(slug);
  if (!listing) notFound();

  const rank = await rankOf(listing.id, listing.totalBid, listing.firstBidAt);
  const category = getCategory(listing.categorySlug);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-2xl px-4 pb-16 pt-8">
        <div className="flex items-start gap-4">
          <Image
            src={listing.iconUrl}
            alt=""
            width={84}
            height={84}
            className="squircle shrink-0 ring-1 ring-line"
            unoptimized
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-gold-soft px-2 py-0.5 text-xs font-bold text-gold">#{rank}</span>
              <h1 className="text-xl font-bold tracking-tight">{listing.name}</h1>
            </div>
            <p className="mt-0.5 text-sm text-muted">{listing.developer}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-faint">
              {category && (
                <Link href={`/category/${category.slug}`} className="transition hover:text-ink">
                  {category.emoji} {category.name}
                </Link>
              )}
              <span aria-hidden>·</span>
              <span>★ {rating(listing.rating)} ({listing.ratingCount.toLocaleString()})</span>
              <span aria-hidden>·</span>
              <span>{listing.formattedPrice ?? "Free"}</span>
            </div>
          </div>
        </div>

        <a
          href={`/go/${listing.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex items-center justify-center gap-1.5 rounded-2xl px-4 py-2.5 text-sm font-semibold text-white shadow-card transition hover:brightness-110"
          style={{ background: "linear-gradient(145deg, var(--accent), var(--accent-2))" }}
        >
          View on the App Store
          <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M7 17 17 7M8 7h9v9" />
          </svg>
        </a>

        {listing.screenshots.length > 0 && (
          <div className="mt-6 flex snap-x gap-3 overflow-x-auto pb-2">
            {listing.screenshots.map((src, i) => (
              <Image
                key={src}
                src={src}
                alt={`${listing.name} screenshot ${i + 1}`}
                width={220}
                height={476}
                className="h-[280px] w-auto shrink-0 snap-start rounded-2xl border border-line object-cover shadow-card"
                unoptimized
              />
            ))}
          </div>
        )}

        {listing.description && (
          <p className="mt-6 whitespace-pre-line text-sm leading-relaxed text-muted">{listing.description}</p>
        )}

        <div className="mt-6 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl border border-line bg-surface-2 py-3">
            <p className="tnum text-lg font-bold text-accent">{money(listing.totalBid)}</p>
            <p className="text-[11px] text-faint">total bid</p>
          </div>
          <div className="rounded-2xl border border-line bg-surface-2 py-3">
            <p className="tnum text-lg font-bold">{listing.clicks.toLocaleString()}</p>
            <p className="text-[11px] text-faint">clicks</p>
          </div>
          <div className="rounded-2xl border border-line bg-surface-2 py-3">
            <p className="text-lg font-bold">{ago(listing.lastBidAt)}</p>
            <p className="text-[11px] text-faint">last bid</p>
          </div>
        </div>

        <div className="mt-6">
          <RaiseWidget appId={listing.appId} currentBid={listing.totalBid} isListed minBid={MIN_BID} />
        </div>
      </main>
      <Footer />
    </>
  );
}
