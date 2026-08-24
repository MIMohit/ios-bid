import { NextResponse } from "next/server";
import { resolveInput, AppStoreError } from "@/lib/appstore";
import { prisma } from "@/lib/db";
import { MIN_BID, RAISE_STEP } from "@/lib/bidding";

export const runtime = "nodejs";

/**
 * Resolve what the user typed into an App Store app (or a shortlist to pick
 * from) and tell them what it would cost to list or raise it.
 */
export async function POST(req: Request) {
  let input: string;
  try {
    ({ input } = await req.json());
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (typeof input !== "string" || !input.trim()) {
    return NextResponse.json({ error: "Enter an App Store link or an app name." }, { status: 400 });
  }

  try {
    const resolved = await resolveInput(input);
    if ("suggestions" in resolved) {
      return NextResponse.json({
        suggestions: resolved.suggestions.map((s) => ({
          appId: s.appId,
          name: s.name,
          developer: s.developer,
          iconUrl: s.iconUrl,
          genre: s.genre,
          rating: s.rating,
          ratingCount: s.ratingCount,
          formattedPrice: s.formattedPrice,
        })),
      });
    }

    const app = resolved.match;
    const listed = await prisma.listing.findUnique({
      where: { appId: app.appId },
      select: { totalBid: true, slug: true },
    });

    return NextResponse.json({
      match: {
        appId: app.appId,
        name: app.name,
        subtitle: app.subtitle,
        developer: app.developer,
        iconUrl: app.iconUrl,
        genre: app.genre,
        categorySlug: app.categorySlug,
        rating: app.rating,
        ratingCount: app.ratingCount,
        formattedPrice: app.formattedPrice,
        url: app.url,
      },
      currentBid: listed?.totalBid ?? 0,
      listingSlug: listed?.slug ?? null,
      minimum: listed ? listed.totalBid + RAISE_STEP : MIN_BID,
    });
  } catch (err) {
    if (err instanceof AppStoreError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error("lookup failed", err);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
