/**
 * The bidding rules, in one file, imported by BOTH the Convex functions and the
 * React tree. It imports nothing from `convex/*` on purpose: the price the
 * server charges and the price a row's CTA advertises come from this same
 * function, so they cannot disagree.
 */

/** Whole US dollars. Cents exist in exactly one place: Stripe `unit_amount = dollars * 100`. */
export const MIN_BID = 1;
export const MAX_BID = 999_999;

/**
 * The advertised price for #1 rounds up to a multiple of this, so the headline
 * figure is round. It is a headline, not a floor: a dollar over the top bid
 * takes #1 just the same, which is what the amount control walks down to.
 */
export const TOP_STEP = 5;

/** Taking any rank other than #1 costs the bid sitting on it plus this. */
export const RAISE_STEP = 1;

export const PAGE_SIZE = 50;

/**
 * The deepest page `board.page` will serve. The offset scan reads
 * MAX_PAGE * PAGE_SIZE whole documents in one transaction, so this is a read
 * budget, not a product limit. See the document-size note in schema.ts.
 */
export const MAX_PAGE = 80;

/** The Today board counts payments settled inside this trailing window. */
export const TODAY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Write-boundary caps that keep a listing document small enough for MAX_PAGE. */
export const MAX_SCREENSHOTS = 6;
export const MAX_DESCRIPTION = 400;

/**
 * The advertised price to take #1: the next whole multiple of TOP_STEP above the
 * current top bid, so the headline is $17,005 rather than $17,001. Anything over
 * `topBid` takes #1 all the same and the bidder can dial down to it.
 */
export function priceForTop(topBid: number): number {
  return Math.min(MAX_BID, (Math.floor(topBid / TOP_STEP) + 1) * TOP_STEP);
}

/**
 * What it costs to take the rank currently held by `bid`, given the board's
 * current top bid. Displacing #1 costs more than displacing anyone else, which
 * is the whole shape of the market.
 */
export function priceToTake(bid: number, topBid: number): number {
  return bid >= topBid ? priceForTop(topBid) : bid + RAISE_STEP;
}
