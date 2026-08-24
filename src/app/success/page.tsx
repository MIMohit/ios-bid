import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { prisma } from "@/lib/db";
import { settleBid } from "@/lib/bidding";
import { getStripe, BYPASS_PAYMENTS } from "@/lib/stripe";
import { money } from "@/lib/format";

export const metadata: Metadata = { title: "You're on the board" };
export const dynamic = "force-dynamic";

async function resolveBidId(sessionId?: string, bidParam?: string): Promise<string | null> {
  if (bidParam) return bidParam;
  if (!sessionId) return null;
  if (BYPASS_PAYMENTS) return null;

  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    const bidId = session.metadata?.bidId;
    if (bidId && session.payment_status === "paid") {
      // The webhook usually wins this race, but don't make the user wait on it.
      await settleBid(bidId);
    }
    return bidId ?? null;
  } catch {
    return null;
  }
}

async function rankOf(id: string, totalBid: number, firstBidAt: Date) {
  const above = await prisma.listing.count({
    where: {
      OR: [{ totalBid: { gt: totalBid } }, { totalBid, firstBidAt: { lt: firstBidAt } }],
    },
  });
  return above + 1;
}

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string; bid?: string }>;
}) {
  const { session_id, bid: bidParam } = await searchParams;
  const bidId = await resolveBidId(session_id, bidParam);

  const bid = bidId
    ? await prisma.bid.findUnique({ where: { id: bidId }, include: { listing: true } })
    : null;
  const listing = bid?.listing ?? null;
  const rank = listing ? await rankOf(listing.id, listing.totalBid, listing.firstBidAt) : null;

  return (
    <>
      <Header />
      <main className="mx-auto max-w-md px-4 pb-16 pt-16 text-center">
        {listing ? (
          <>
            <div className="mx-auto grid size-14 place-items-center rounded-full bg-green/10 text-green">
              <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <h1 className="mt-4 text-xl font-bold tracking-tight">You&apos;re on the board</h1>
            <p className="mt-1 text-sm text-muted">Payment confirmed. The leaderboard has already updated.</p>

            <div className="mt-6 flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-left shadow-card">
              <Image src={listing.iconUrl} alt="" width={56} height={56} className="squircle shrink-0 ring-1 ring-line" unoptimized />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{listing.name}</p>
                <p className="text-xs text-muted">now at {money(listing.totalBid)}</p>
              </div>
              {rank && (
                <span className="shrink-0 rounded-lg bg-gold-soft px-2.5 py-1 text-sm font-bold text-gold">#{rank}</span>
              )}
            </div>

            <Link
              href={`/app/${listing.slug}`}
              className="mt-6 inline-flex items-center justify-center rounded-2xl px-5 py-2.5 text-sm font-semibold text-white shadow-card transition hover:brightness-110"
              style={{ background: "linear-gradient(145deg, var(--accent), var(--accent-2))" }}
            >
              View your listing
            </Link>
            <p className="mt-3">
              <Link href="/" className="text-xs text-faint transition hover:text-ink">Back to the board</Link>
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold tracking-tight">Confirming your payment…</h1>
            <p className="mt-2 text-sm text-muted">
              This can take a few seconds. If your listing doesn&apos;t show up shortly, the payment may still be
              processing — check back on the board.
            </p>
            <Link href="/" className="mt-6 inline-block text-sm text-accent transition hover:underline">
              Back to the board
            </Link>
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
