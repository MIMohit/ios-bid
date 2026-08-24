import { NextResponse } from "next/server";
import { siteStats } from "@/lib/bidding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const stats = await siteStats();
  return NextResponse.json(stats, {
    headers: { "cache-control": "no-store" },
  });
}
