/**
 * The bid prefill, outside React.
 *
 * Every row on the board carries a "claim this rank for $X" button, and pressing
 * one has to land that exact number in the bid form. Holding it in a parent's
 * state would re-render all fifty rows on the site's primary interaction, so it
 * lives here and only the form subscribes.
 *
 * Two fields. `amount` is null until the visitor asks for a specific number, so
 * the form can fall back to the live "claim #1" price without this module ever
 * knowing what that price is. `rank` is which row was claimed, which is what the
 * hero label reads back.
 */
import { useSyncExternalStore } from "react";
import { MAX_BID, MIN_BID } from "@convex/rules";

/**
 * DOM ids, because the claim button and the form have no common React parent and
 * inventing one would put the amount back in a parent's state.
 */
export const BID_FORM_ID = "bid";
export const BID_INPUT_ID = "bid-app";

export type BidPrefill = { amount: number | null; rank: number | null };

// Module state on the server is per process, not per request. Nothing below is
// ever called during render or from a loader, only from browser event handlers,
// so no request can observe another request's value.
let prefill: BidPrefill = { amount: null, rank: null };
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): BidPrefill {
  return prefill;
}

/** Whole dollars, inside the rules' bounds. The server revalidates regardless. */
export function setBidAmount(amount: number, rank: number | null = null): void {
  const clamped = Math.min(MAX_BID, Math.max(MIN_BID, Math.round(amount)));
  if (prefill.amount === clamped && prefill.rank === rank) return;
  prefill = { amount: clamped, rank };
  for (const listener of listeners) listener();
}

/** Back to "whatever taking #1 costs right now". */
export function clearBidAmount(): void {
  if (prefill.amount === null && prefill.rank === null) return;
  prefill = { amount: null, rank: null };
  for (const listener of listeners) listener();
}

/**
 * A row's CTA: the price becomes the form's amount and the caret moves to the
 * form. This is the "pay according to the place" interaction, so it is a real
 * state change plus a focus move, not a scroll to an anchor.
 */
export function claimRank(amount: number, rank: number): void {
  setBidAmount(amount, rank);
  document.getElementById(BID_FORM_ID)?.scrollIntoView({ block: "center" });
  document.getElementById(BID_INPUT_ID)?.focus({ preventScroll: true });
}

export function useBidPrefill(): BidPrefill {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
