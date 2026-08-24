import { NextResponse } from "next/server";
import { recentActivity } from "@/lib/bidding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const items = await recentActivity(12);
  return NextResponse.json(
    {
      items: items.map(({ bid, listing, rank }) => ({
        id: bid.id,
        name: listing.name,
        slug: listing.slug,
        iconUrl: listing.iconUrl,
        amount: bid.amount,
        rank,
        paidAt: bid.paidAt,
      })),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
