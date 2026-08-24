import { prisma } from "./db";
import type { AppMeta } from "./appstore";
import type { Listing, Prisma } from "@/generated/prisma/client";

/* ---------------------------------------------------------------- rules -- */

/** Cheapest a brand-new listing can join the board for. */
export const MIN_BID = 5;
export const MAX_BID = 999_999;
/** Taking #1 costs at least this much more than the current top bid. */
export const TOP_STEP = 5;
/** Raising your own listing costs at least this much more than your bid. */
export const RAISE_STEP = 1;

export const PAGE_SIZE = 50;
export const TODAY_WINDOW_MS = 24 * 60 * 60 * 1000;

export type BoardWindow = "all" | "today";

export type Row = {
  listing: Listing;
  rank: number;
  /** All-time total, or the 24h total on the Today board. */
  bid: number;
};

export class BidError extends Error {}

export type Quote = {
  /** What the card will display after this payment settles. */
  newTotal: number;
  /** What Stripe actually charges — the difference on a raise. */
  charge: number;
  isRaise: boolean;
  currentBid: number;
};

/**
 * Price a bid against the board's rules. Mirrors the leaderboard exactly:
 * paying less than #1 is never an error, it just buys a lower rank.
 */
export async function quoteBid(appId: string, amount: number): Promise<Quote> {
  if (!Number.isInteger(amount)) throw new BidError("Bids are whole US dollars.");
  if (amount > MAX_BID) throw new BidError(`The maximum bid is $${MAX_BID.toLocaleString()}.`);

  const existing = await prisma.listing.findUnique({
    where: { appId },
    select: { totalBid: true },
  });

  if (!existing) {
    if (amount < MIN_BID) throw new BidError(`New listings start at $${MIN_BID}.`);
    return { newTotal: amount, charge: amount, isRaise: false, currentBid: 0 };
  }

  const current = existing.totalBid;
  if (amount < current + RAISE_STEP) {
    throw new BidError(
      `That app is already on the board at $${current.toLocaleString()}. ` +
        `Raising it costs at least $${(current + RAISE_STEP).toLocaleString()} — you only pay the difference.`,
    );
  }
  return { newTotal: amount, charge: amount - current, isRaise: true, currentBid: current };
}

/* --------------------------------------------------------------- boards -- */

export async function topBid(): Promise<number> {
  const top = await prisma.listing.findFirst({
    orderBy: [{ totalBid: "desc" }, { firstBidAt: "asc" }],
    select: { totalBid: true },
  });
  return top?.totalBid ?? 0;
}

/** What it costs to claim #1 right now. */
export async function priceForTop(): Promise<number> {
  return Math.max(MIN_BID, (await topBid()) + TOP_STEP);
}

async function allTimeBoard(categorySlug: string | null, page: number) {
  const where: Prisma.ListingWhereInput = { totalBid: { gt: 0 } };
  if (categorySlug) where.categorySlug = categorySlug;

  const [total, listings] = await Promise.all([
    prisma.listing.count({ where }),
    prisma.listing.findMany({
      where,
      // Equal bids keep the order they were placed: the older bid ranks higher.
      orderBy: [{ totalBid: "desc" }, { firstBidAt: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const rows: Row[] = listings.map((listing, i) => ({
    listing,
    rank: (page - 1) * PAGE_SIZE + i + 1,
    bid: listing.totalBid,
  }));
  return { rows, total };
}

/**
 * Today ranks only what was spent in the last 24 hours. Each payment counts for
 * a day from when it settled, then drops off — while still counting toward the
 * all-time bid.
 */
async function todayBoard(categorySlug: string | null, page: number) {
  const since = new Date(Date.now() - TODAY_WINDOW_MS);

  let listingIds: string[] | undefined;
  if (categorySlug) {
    const inCategory = await prisma.listing.findMany({
      where: { categorySlug },
      select: { id: true },
    });
    listingIds = inCategory.map((l) => l.id);
    if (listingIds.length === 0) return { rows: [], total: 0 };
  }

  const groups = await prisma.bid.groupBy({
    by: ["listingId"],
    where: {
      status: "PAID",
      paidAt: { gt: since },
      listingId: listingIds ? { in: listingIds } : { not: null },
    },
    _sum: { amount: true },
    _min: { paidAt: true },
  });

  const ordered = groups
    .filter((g) => g.listingId && (g._sum.amount ?? 0) > 0)
    .sort((a, b) => {
      const diff = (b._sum.amount ?? 0) - (a._sum.amount ?? 0);
      if (diff !== 0) return diff;
      return (a._min.paidAt?.getTime() ?? 0) - (b._min.paidAt?.getTime() ?? 0);
    });

  const total = ordered.length;
  const slice = ordered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  if (slice.length === 0) return { rows: [], total };

  const listings = await prisma.listing.findMany({
    where: { id: { in: slice.map((g) => g.listingId!) } },
  });
  const byId = new Map(listings.map((l) => [l.id, l]));

  const rows: Row[] = slice.flatMap((g, i) => {
    const listing = byId.get(g.listingId!);
    if (!listing) return [];
    return [{ listing, rank: (page - 1) * PAGE_SIZE + i + 1, bid: g._sum.amount ?? 0 }];
  });
  return { rows, total };
}

export async function getBoard(opts: {
  window: BoardWindow;
  categorySlug?: string | null;
  page?: number;
}) {
  const page = Math.max(1, opts.page ?? 1);
  const category = opts.categorySlug && opts.categorySlug !== "all" ? opts.categorySlug : null;
  const { rows, total } =
    opts.window === "today" ? await todayBoard(category, page) : await allTimeBoard(category, page);

  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Today's #1 spend, used to price the Today board's top slot. */
export async function topBidToday(): Promise<number> {
  const since = new Date(Date.now() - TODAY_WINDOW_MS);
  const groups = await prisma.bid.groupBy({
    by: ["listingId"],
    where: { status: "PAID", paidAt: { gt: since }, listingId: { not: null } },
    _sum: { amount: true },
  });
  return groups.reduce((max, g) => Math.max(max, g._sum.amount ?? 0), 0);
}

/* -------------------------------------------------------------- settling -- */

async function uniqueSlug(
  tx: Prisma.TransactionClient,
  base: string,
  appId: string,
): Promise<string> {
  const taken = await tx.listing.findUnique({ where: { slug: base }, select: { appId: true } });
  if (!taken || taken.appId === appId) return base;
  return `${base}-${appId.slice(-5)}`;
}

/**
 * Settle a paid bid. Serialized per app with a transaction-scoped advisory lock
 * so two people bidding on the same app at the same moment cannot lose a
 * payment — including the case where neither listing exists yet.
 *
 * Safe to call more than once for the same bid; Stripe retries webhooks.
 */
export async function settleBid(bidId: string): Promise<Listing | null> {
  const stub = await prisma.bid.findUnique({ where: { id: bidId }, select: { appId: true } });
  if (!stub) return null;

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${stub.appId}))`;

    const bid = await tx.bid.findUnique({ where: { id: bidId } });
    if (!bid || bid.status === "PAID") {
      return bid?.listingId ? tx.listing.findUnique({ where: { id: bid.listingId } }) : null;
    }

    const meta = bid.snapshot as unknown as AppMeta;
    const existing = await tx.listing.findUnique({ where: { appId: bid.appId } });
    const now = new Date();

    const listing = existing
      ? await tx.listing.update({
          where: { id: existing.id },
          data: {
            totalBid: { increment: bid.amount },
            lastBidAt: now,
            // Refresh metadata so long-lived listings don't go stale.
            name: meta.name,
            subtitle: meta.subtitle,
            description: meta.description,
            iconUrl: meta.iconUrl,
            developer: meta.developer,
            price: meta.price,
            formattedPrice: meta.formattedPrice,
            rating: meta.rating,
            ratingCount: meta.ratingCount,
            version: meta.version,
            screenshots: meta.screenshots,
          },
        })
      : await tx.listing.create({
          data: {
            appId: meta.appId,
            bundleId: meta.bundleId,
            slug: await uniqueSlug(tx, meta.slug, meta.appId),
            name: meta.name,
            subtitle: meta.subtitle,
            description: meta.description,
            iconUrl: meta.iconUrl,
            developer: meta.developer,
            developerUrl: meta.developerUrl,
            price: meta.price,
            formattedPrice: meta.formattedPrice,
            rating: meta.rating,
            ratingCount: meta.ratingCount,
            contentRating: meta.contentRating,
            minimumOs: meta.minimumOs,
            version: meta.version,
            genre: meta.genre,
            categorySlug: meta.categorySlug,
            screenshots: meta.screenshots,
            url: meta.url,
            totalBid: bid.amount,
            firstBidAt: now,
            lastBidAt: now,
          },
        });

    await tx.bid.update({
      where: { id: bid.id },
      data: {
        status: "PAID",
        paidAt: now,
        listingId: listing.id,
        totalAfter: listing.totalBid,
      },
    });

    return listing;
  });
}

/* ----------------------------------------------------------------- misc -- */

export async function recentActivity(limit = 12) {
  const bids = await prisma.bid.findMany({
    where: { status: "PAID", listingId: { not: null } },
    orderBy: { paidAt: "desc" },
    take: limit,
    include: { listing: true },
  });

  // Rank each listing as of now, so the ticker matches the board.
  return Promise.all(
    bids.map(async (bid) => {
      const above = await prisma.listing.count({
        where: {
          OR: [
            { totalBid: { gt: bid.listing!.totalBid } },
            { totalBid: bid.listing!.totalBid, firstBidAt: { lt: bid.listing!.firstBidAt } },
          ],
        },
      });
      return { bid, listing: bid.listing!, rank: above + 1 };
    }),
  );
}

export async function siteStats() {
  const [revenue, stat, listings, online] = await Promise.all([
    prisma.bid.aggregate({ where: { status: "PAID" }, _sum: { amount: true } }),
    prisma.siteStat.findUnique({ where: { id: 1 } }),
    prisma.listing.count({ where: { totalBid: { gt: 0 } } }),
    prisma.presence.count({ where: { lastSeen: { gt: new Date(Date.now() - 5 * 60_000) } } }),
  ]);

  return {
    revenue: revenue._sum.amount ?? 0,
    visitors: stat?.totalVisitors ?? 0,
    launchedAt: stat?.launchedAt ?? new Date(),
    listings,
    online,
  };
}
