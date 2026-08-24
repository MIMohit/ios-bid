import { NextResponse } from "next/server";
import { lookupApp, AppStoreError } from "@/lib/appstore";
import { quoteBid, settleBid, BidError, MAX_BID } from "@/lib/bidding";
import { prisma } from "@/lib/db";
import { getStripe, siteUrl, BYPASS_PAYMENTS } from "@/lib/stripe";
import type { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let appId: unknown;
  let amount: unknown;
  try {
    ({ appId, amount } = await req.json());
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  if (typeof appId !== "string" || !/^\d{6,12}$/.test(appId)) {
    return NextResponse.json({ error: "Pick an app first." }, { status: 400 });
  }
  const bid = Number(amount);
  if (!Number.isInteger(bid) || bid < 1 || bid > MAX_BID) {
    return NextResponse.json({ error: "Bids are whole US dollars." }, { status: 400 });
  }

  try {
    // Re-fetch from Apple at checkout time so the listing that gets created is
    // built from current metadata, not whatever the browser was showing.
    const app = await lookupApp(appId);
    const quote = await quoteBid(appId, bid);

    const pending = await prisma.bid.create({
      data: {
        appId,
        amount: quote.charge,
        snapshot: app as unknown as Prisma.InputJsonValue,
      },
    });

    // Local escape hatch: run the whole board without Stripe configured.
    if (BYPASS_PAYMENTS) {
      await settleBid(pending.id);
      return NextResponse.json({ url: `/success?bid=${pending.id}` });
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: quote.charge * 100,
            product_data: {
              name: quote.isRaise
                ? `Raise ${app.name} to $${quote.newTotal.toLocaleString()}`
                : `List ${app.name} at $${quote.newTotal.toLocaleString()}`,
              description: quote.isRaise
                ? `Currently $${quote.currentBid.toLocaleString()} on iosbid.lol. You pay the difference.`
                : "A permanent spot on the iosbid.lol leaderboard.",
              images: [app.iconUrl],
            },
          },
        },
      ],
      // The bid id is the only thing the webhook needs to settle this.
      metadata: { bidId: pending.id, appId, newTotal: String(quote.newTotal) },
      payment_intent_data: { metadata: { bidId: pending.id } },
      success_url: `${siteUrl()}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl()}/?canceled=1`,
    });

    await prisma.bid.update({
      where: { id: pending.id },
      data: { checkoutId: session.id },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    if (err instanceof BidError || err instanceof AppStoreError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error("checkout failed", err);
    const message =
      err instanceof Error && err.message.includes("STRIPE_SECRET_KEY")
        ? err.message
        : "Could not start checkout. Try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
