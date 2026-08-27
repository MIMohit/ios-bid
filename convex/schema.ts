// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v, type Infer } from "convex/values";

/**
 * App Store metadata captured at checkout time so the webhook can create the
 * listing without a second round trip to Apple.
 *
 * `screenshots` and `description` exist for the rank-1 spotlight panel only. No
 * board row and no JSON-LD reads them, but the offset-scan pagination in
 * `board.page` reads whole documents, so both are capped at the write boundary
 * (see MAX_SCREENSHOTS / MAX_DESCRIPTION in rules.ts). At those caps a listing
 * is roughly 2 KB, so the deepest legal page (MAX_PAGE * PAGE_SIZE = 4,000
 * documents) costs about 8 MB against Convex's 16 MiB transaction budget. Raise
 * either cap and that arithmetic has to be redone.
 */
export const appMeta = v.object({
  appId: v.string(),
  slug: v.string(),
  name: v.string(),
  subtitle: v.optional(v.string()),
  description: v.optional(v.string()),  // trimmed Apple description, spotlight panel only
  iconUrl: v.string(),
  screenshots: v.array(v.string()),     // up to 6 mzstatic URLs, any aspect ratio
  developer: v.string(),
  price: v.number(),                    // Apple's own price, 0 for free. JSON-LD offers.price
  formattedPrice: v.optional(v.string()),
  rating: v.optional(v.number()),
  ratingCount: v.number(),
  genre: v.string(),
  categorySlug: v.string(),
  url: v.string(),
});

/** The single source of the AppMeta type. Nothing hand-writes this shape. */
export type AppMeta = Infer<typeof appMeta>;

export const bidStatus = v.union(
  v.literal("pending"),
  v.literal("paid"),
  v.literal("failed"),
);

export default defineSchema({
  /** One App Store app on the board, keyed by Apple's trackId. */
  listings: defineTable({
    appId: v.string(),              // Apple trackId. The identity of a listing, never the URL
    slug: v.string(),               // url-safe app name, unique, used by /go/:slug
    name: v.string(),
    subtitle: v.optional(v.string()),   // first sentence of Apple's description, <= 140 chars
    description: v.optional(v.string()),// trimmed Apple description. Rank 1 panel only
    iconUrl: v.string(),            // mzstatic artwork on the pinned is1-ssl host
    screenshots: v.array(v.string()),   // up to 6 mzstatic URLs. Rank 1 panel only
    developer: v.string(),          // artistName
    price: v.number(),              // Apple's price. NOT a bid. The only non-integer money here
    formattedPrice: v.optional(v.string()), // Apple's "Free" / "$4.99" string, never recomputed
    rating: v.optional(v.number()), // averageUserRating, 0 to 5
    ratingCount: v.number(),        // userRatingCount, drives the "(12.4K)" suffix
    genre: v.string(),              // primaryGenreName, shown in the "#1 in X" marker
    categorySlug: v.string(),       // our slug from lib/categories.ts. The category board key
    url: v.string(),                // canonical apps.apple.com link, parameter free
    totalBid: v.number(),           // whole USD, sum of every settled payment. All-time rank key
    negFirstBidAt: v.number(),      // -firstBidAt, so .order("desc") tiebreaks oldest first
    todayBid: v.number(),           // whole USD settled in the trailing 24h. Today rank key
    negTodayFirstAt: v.number(),    // -(oldest live payment's paidAt). 0 when todayBid is 0
    firstBidAt: v.number(),         // ms epoch of the first settled payment
    lastBidAt: v.number(),          // ms epoch of the most recent settled payment. Drives "2h ago"
  })
    .index("by_appId", ["appId"])                                        // raise-vs-create, and the settle lock
    .index("by_slug", ["slug"])                                          // /go/:slug and slug collision check
    .index("by_rank", ["totalBid", "negFirstBidAt"])                     // all-time board order, desc
    .index("by_category_rank", ["categorySlug", "totalBid", "negFirstBidAt"])
    .index("by_today", ["todayBid", "negTodayFirstAt"])                  // today board, desc, todayBid > 0
    .index("by_category_today", ["categorySlug", "todayBid", "negTodayFirstAt"]),

  /** One payment. `amount` is what Stripe charged: on a raise, only the difference. */
  bids: defineTable({
    appId: v.string(),              // denormalized so a pending bid exists before any listing does
    listingId: v.optional(v.id("listings")), // set at settle time, absent while pending
    amount: v.number(),             // whole USD actually charged
    totalAfter: v.number(),         // the listing's totalBid after this payment, for the ticker
    status: bidStatus,              // pending -> paid | failed. "paid" is the idempotency latch
    checkoutId: v.optional(v.string()),    // Stripe session id. How /success finds this bid
    paymentIntent: v.optional(v.string()), // Stripe pi_, and how a refund or dispute finds this bid
    country: v.optional(v.string()),       // ISO 3166-1 alpha-2 billing country. The VAT filing record
    snapshot: appMeta,              // Apple metadata frozen at checkout, typed, never v.any()
    paidAt: v.optional(v.number()), // ms epoch the webhook settled it. Drives the 24h window
    expired: v.optional(v.boolean()),      // true once this payment has aged out of the today board
    reversed: v.optional(v.boolean()),     // true once refunded or charged back. `bids.reverse` latch
  })
    .index("by_checkoutId", ["checkoutId"])              // /success lookup by session_id
    // A refund and a dispute both arrive as PaymentIntent-shaped events carrying
    // no metadata of ours, so the ledger resolves them by this and nothing else.
    .index("by_paymentIntent", ["paymentIntent"])
    .index("by_status_paidAt", ["status", "paidAt"])     // activity ticker + daily revenue rollup
    .index("by_listing_paidAt", ["listingId", "paidAt"]) // oldest still-live payment, for today ties
    .index("by_status_creation", ["status"]),            // sweep abandoned pending bids by _creationTime

  /**
   * Counters for one board scope. `key` is "all" or a category slug. Written only
   * when a listing joins or leaves a board, or when a bid settles in that scope.
   * This is what makes "1 - 50 of 1,514" exact and free.
   */
  boardStats: defineTable({
    key: v.string(),                // "all" | categorySlug
    listingCount: v.number(),       // listings with totalBid > 0
    todayCount: v.number(),         // listings with todayBid > 0
    totalBid: v.number(),           // sum of all-time bids in this scope, for the rail
    todayTotal: v.number(),         // sum of today bids in this scope
  }).index("by_key", ["key"]),

  /**
   * Singleton. Holds no board counts on purpose, so a heartbeat can never
   * invalidate a board query. Created lazily by ensureSiteStat().
   */
  siteStat: defineTable({
    launchedAt: v.number(),         // ms epoch, powers "since its launch N hours ago"
    revenue: v.number(),            // whole USD of settled payments. The revenue counter
    visitors: v.number(),           // drained from the sharded visitor counter by the 20s cron
    onlineCount: v.number(),        // recomputed from `presence` by the same 20s cron
  }),

  /** Rolling presence for the "N online" counter. One row per anonymous sid. */
  presence: defineTable({
    sid: v.string(),                // the iosbid_sid cookie value
    lastSeen: v.number(),           // ms epoch, refreshed at most every 30s per visitor
  })
    .index("by_sid", ["sid"])
    .index("by_lastSeen", ["lastSeen"]),

  /**
   * One row per (visitor, listing, UTC day) that we actually counted, plus one
   * budget row per (visitor, day) whose key has an empty listing segment.
   * Bounded by real humans times listings they tapped, not by raw traffic.
   */
  clickDedupe: defineTable({
    key: v.string(),                // `${sid}:${listingId}:${day}` or `${sid}::${day}`
    expiresAt: v.number(),          // ms epoch, 48h out. The sweeper's range key
    count: v.optional(v.number()),  // 1 on a click row, the running daily total on a budget row
  })
    .index("by_key", ["key"])
    .index("by_expiresAt", ["expiresAt"]),

  /**
   * Daily rollup. A row with `listingId` is per-listing taps; a row without one
   * is the site-wide day. Written by a cron, read only by /stats.
   */
  dailyStats: defineTable({
    day: v.string(),                // "2026-08-26", UTC
    listingId: v.optional(v.id("listings")), // absent = the site-wide row for that day
    clicks: v.number(),             // this day's taps = cumulative - yesterday's cumulative
    cumulativeClicks: v.number(),   // counter value at rollup time, so tomorrow can diff it
    revenue: v.optional(v.number()),    // site row only: USD settled that day
    bidCount: v.optional(v.number()),   // site row only: payments settled that day
    impressions: v.optional(v.number()),// site row only: board page views that day
  })
    .index("by_day_listing", ["day", "listingId"])  // idempotent upsert target for the rollup
    .index("by_listing_day", ["listingId", "day"]), // per-listing history on /stats

  // Click totals are NOT a table here. They live in the @convex-dev/sharded-counter
  // component's own namespace, mounted in convex/convex.config.ts.
});
