import Stripe from "stripe";

export const BYPASS_PAYMENTS = process.env.BYPASS_PAYMENTS === "1";

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.includes("replace_me")) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Add your test key to .env, or set BYPASS_PAYMENTS=1 to run the board without Stripe.",
    );
  }
  cached = new Stripe(key);
  return cached;
}

export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "http://localhost:3000";
}
