import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { settleBid } from "@/lib/bidding";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/**
 * A completed payment is what claims the rank — nothing else in the app moves a
 * listing up the board.
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get("stripe-signature");
  if (!secret || !signature) {
    return NextResponse.json({ error: "Webhook not configured." }, { status: 400 });
  }

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, signature, secret);
  } catch (err) {
    console.error("stripe signature check failed", err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.payment_status !== "paid") break;
        const bidId = session.metadata?.bidId;
        if (!bidId) break;

        await prisma.bid.updateMany({
          where: { id: bidId },
          data: { paymentIntent: String(session.payment_intent ?? "") },
        });
        // settleBid is idempotent, which matters because Stripe retries.
        await settleBid(bidId);

        revalidatePath("/", "layout");
        break;
      }
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const bidId = session.metadata?.bidId;
        if (bidId) {
          await prisma.bid.updateMany({
            where: { id: bidId, status: "PENDING" },
            data: { status: "FAILED" },
          });
        }
        break;
      }
    }
  } catch (err) {
    // Return 500 so Stripe retries rather than dropping the payment.
    console.error("webhook handling failed", err);
    return NextResponse.json({ error: "Handler error." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
