import "dotenv/config";
/**
 * Seeds the board with a handful of real App Store apps so the leaderboard
 * has something to show in local dev. Run with `npm run db:seed`.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { lookupApp } from "../src/lib/appstore";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// A spread of well-known apps across different price points and categories.
const SEED: { appId: string; bid: number; daysAgo: number }[] = [
  { appId: "310633997", bid: 4200, daysAgo: 0 },   // WhatsApp
  { appId: "389801252", bid: 3100, daysAgo: 0 },   // Instagram
  { appId: "333903271", bid: 2400, daysAgo: 1 },   // Twitter/X
  { appId: "544007664", bid: 1800, daysAgo: 1 },   // YouTube
  { appId: "310633665", bid: 1500, daysAgo: 2 },   // WhatsApp Business (dup-safe fallback)
  { appId: "422689480", bid: 900, daysAgo: 2 },    // Google Chrome
  { appId: "1274495053", bid: 620, daysAgo: 3 },   // Notion
  { appId: "1502224452", bid: 340, daysAgo: 0 },   // BeReal
  { appId: "1459969523", bid: 180, daysAgo: 4 },   // Wordle-alikes fallback
  { appId: "6448311069", bid: 60, daysAgo: 0 },    // Threads
  { appId: "284882215", bid: 25, daysAgo: 5 },     // Facebook
  { appId: "429047995", bid: 10, daysAgo: 0 },     // Pages
];

async function main() {
  for (const { appId, bid, daysAgo } of SEED) {
    try {
      const app = await lookupApp(appId);
      const paidAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

      const listing = await prisma.listing.upsert({
        where: { appId: app.appId },
        create: {
          appId: app.appId,
          bundleId: app.bundleId,
          slug: app.slug,
          name: app.name,
          subtitle: app.subtitle,
          description: app.description,
          iconUrl: app.iconUrl,
          developer: app.developer,
          developerUrl: app.developerUrl,
          price: app.price,
          formattedPrice: app.formattedPrice,
          rating: app.rating,
          ratingCount: app.ratingCount,
          contentRating: app.contentRating,
          minimumOs: app.minimumOs,
          version: app.version,
          genre: app.genre,
          categorySlug: app.categorySlug,
          screenshots: app.screenshots,
          url: app.url,
          totalBid: bid,
          clicks: Math.floor(Math.random() * 4000),
          firstBidAt: paidAt,
          lastBidAt: paidAt,
        },
        update: {},
      });

      await prisma.bid.create({
        data: {
          listingId: listing.id,
          appId: app.appId,
          amount: bid,
          totalAfter: bid,
          status: "PAID",
          paidAt,
        },
      });

      console.log(`seeded ${app.name} at $${bid}`);
    } catch (err) {
      console.warn(`skipped ${appId}:`, (err as Error).message);
    }
  }

  await prisma.siteStat.upsert({
    where: { id: 1 },
    create: { id: 1, totalVisitors: 128_430, launchedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) },
    update: {},
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
