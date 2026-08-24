import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { siteStats } from "@/lib/bidding";
import { money, hoursSince } from "@/lib/format";
import { prisma } from "@/lib/db";

export const metadata: Metadata = { title: "About" };
export const dynamic = "force-dynamic";

export default async function AboutPage() {
  const stats = await siteStats();
  const topApp = await prisma.listing.findFirst({
    orderBy: [{ totalBid: "desc" }, { firstBidAt: "asc" }],
  });

  return (
    <>
      <Header />
      <main className="mx-auto max-w-xl px-4 pb-16 pt-8">
        <h1 className="text-2xl font-bold tracking-tight">About</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          iosbid.lol is a public leaderboard: no ads, no App Store algorithm, no review-gaming. You outbid
          your competitors to rank #1 — that&apos;s it. Every listing is a real app pulled straight from the
          iOS App Store, so what you see is the actual icon, rating, and screenshots — not a submitted screenshot
          someone made up.
        </p>

        <div className="mt-6 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl border border-line bg-surface-2 py-4">
            <p className="tnum text-xl font-bold">{stats.visitors.toLocaleString()}</p>
            <p className="text-[11px] text-faint">visitors</p>
          </div>
          <div className="rounded-2xl border border-line bg-surface-2 py-4">
            <p className="tnum text-xl font-bold text-accent">{money(stats.revenue)}</p>
            <p className="text-[11px] text-faint">total bid</p>
          </div>
          <div className="rounded-2xl border border-line bg-surface-2 py-4">
            <p className="tnum text-xl font-bold text-gold">{topApp ? money(topApp.totalBid) : "—"}</p>
            <p className="text-[11px] text-faint">highest bid</p>
          </div>
        </div>

        {topApp && (
          <p className="mt-2 text-center text-xs text-faint">
            highest bid so far · {topApp.name}
          </p>
        )}

        <p className="mt-8 text-sm leading-relaxed text-muted">
          The board launched {hoursSince(stats.launchedAt).toLocaleString()} hours ago. Same rules as every
          pay-to-rank board in this wave: rank is the bid, nothing else, and nothing ever refunds.
        </p>

        <p className="mt-6 text-sm text-muted">
          Built for indie iOS developers and small studios who want a straight shot at visibility instead of
          fighting App Store search ranking.
        </p>
      </main>
      <Footer />
    </>
  );
}
