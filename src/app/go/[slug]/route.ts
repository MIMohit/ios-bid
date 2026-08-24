import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Outbound click tracking. Clicks go to the canonical App Store URL, without
 * query parameters — affiliate and tracking links never survive a listing.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;

  const listing = await prisma.listing.findUnique({
    where: { slug },
    select: { id: true, url: true },
  });
  if (!listing) return NextResponse.redirect(new URL("/", process.env.NEXT_PUBLIC_SITE_URL));

  prisma.listing
    .update({ where: { id: listing.id }, data: { clicks: { increment: 1 } } })
    .catch(() => {});

  return NextResponse.redirect(listing.url, { status: 302 });
}
