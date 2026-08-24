"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";

type Match = {
  appId: string;
  name: string;
  subtitle: string | null;
  developer: string;
  iconUrl: string;
  genre: string;
  categorySlug: string;
  rating: number | null;
  ratingCount: number;
  formattedPrice: string | null;
  url: string;
};

type Suggestion = Pick<
  Match,
  "appId" | "name" | "developer" | "iconUrl" | "genre" | "rating" | "ratingCount" | "formattedPrice"
>;

type LookupState = {
  match: Match | null;
  currentBid: number;
  listingSlug: string | null;
  minimum: number;
};

const EMPTY: LookupState = { match: null, currentBid: 0, listingSlug: null, minimum: 5 };

function Stars({ rating, count }: { rating: number | null; count: number }) {
  if (!rating) return null;
  return (
    <span className="inline-flex items-center gap-1 text-muted">
      <svg viewBox="0 0 24 24" className="size-3 text-gold" fill="currentColor" aria-hidden>
        <path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.9L12 17.8 5.8 21l1.2-6.9-5-4.9 6.9-1L12 2Z" />
      </svg>
      {rating.toFixed(1)}
      {count > 0 && <span className="text-faint">({count > 999 ? `${Math.round(count / 1000)}K` : count})</span>}
    </span>
  );
}

export function BidForm({ topPrice, minBid }: { topPrice: number; minBid: number }) {
  const [amount, setAmount] = useState(topPrice);
  const [query, setQuery] = useState("");
  const [state, setState] = useState<LookupState>(EMPTY);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [looking, setLooking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Ignore responses for queries the user has already typed past.
  const requestRef = useRef(0);

  const runLookup = useCallback(async (input: string) => {
    const seq = ++requestRef.current;
    setLooking(true);
    setError(null);
    try {
      const res = await fetch("/api/lookup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input }),
      });
      const data = await res.json();
      if (seq !== requestRef.current) return;

      if (!res.ok) {
        setState(EMPTY);
        setSuggestions(null);
        setError(data.error ?? "Could not find that app.");
        return;
      }
      if (data.suggestions) {
        setState(EMPTY);
        setSuggestions(data.suggestions);
        return;
      }
      setSuggestions(null);
      setState({
        match: data.match,
        currentBid: data.currentBid,
        listingSlug: data.listingSlug,
        minimum: data.minimum,
      });
      setAmount((a) => (a < data.minimum ? data.minimum : a));
    } catch {
      if (seq === requestRef.current) setError("Network error. Try again.");
    } finally {
      if (seq === requestRef.current) setLooking(false);
    }
  }, []);

  // Debounce so a search fires once the typing settles, not on every keystroke.
  useEffect(() => {
    const input = query.trim();
    if (input.length < 2) {
      requestRef.current++;
      setState(EMPTY);
      setSuggestions(null);
      setError(null);
      setLooking(false);
      return;
    }
    const timer = setTimeout(() => void runLookup(input), 450);
    return () => clearTimeout(timer);
  }, [query, runLookup]);

  async function pickSuggestion(appId: string) {
    setSuggestions(null);
    setQuery(`id${appId}`);
    await runLookup(appId);
  }

  const minimum = state.match ? state.minimum : minBid;
  const isRaise = state.currentBid > 0;
  const charge = isRaise ? Math.max(0, amount - state.currentBid) : amount;
  const takesTop = amount >= topPrice;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!state.match) {
      setError("Find your app first.");
      return;
    }
    if (amount < minimum) {
      setError(`This bid needs to be at least $${minimum.toLocaleString()}.`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ appId: state.match.appId, amount }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error ?? "Could not start checkout.");
        setSubmitting(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Network error. Try again.");
      setSubmitting(false);
    }
  }

  const step = (delta: number) =>
    setAmount((a) => Math.min(999_999, Math.max(minimum, a + delta)));

  return (
    <section className="mx-auto w-full max-w-2xl px-4 pt-8 text-center sm:pt-10">
      <h1 className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-3xl font-bold tracking-tight sm:text-[40px]">
        <span>Claim #1 for</span>
        <span className="inline-flex items-center gap-1 rounded-2xl bg-surface px-1.5 py-1 shadow-card ring-1 ring-line">
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Lower the bid by one dollar"
            className="grid size-7 place-items-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="size-4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14" /></svg>
          </button>
          <span className="flex items-baseline">
            <span className="text-2xl text-accent sm:text-3xl">$</span>
            <input
              type="number"
              inputMode="numeric"
              aria-label="Amount in dollars"
              value={amount}
              min={minimum}
              max={999999}
              onChange={(e) => setAmount(Math.floor(Number(e.target.value) || 0))}
              onBlur={() => setAmount((a) => Math.min(999_999, Math.max(minimum, Math.floor(a) || minimum)))}
              className="tnum w-[4.5ch] bg-transparent text-center text-2xl font-bold tabular-nums outline-none sm:text-3xl"
              style={{ width: `${Math.max(2, String(amount).length)}ch` }}
            />
          </span>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Raise the bid by one dollar"
            className="grid size-7 place-items-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="size-4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </button>
        </span>
      </h1>

      <p className="mx-auto mt-3 max-w-lg text-[13px] leading-relaxed text-muted">
        New spots start at <span className="font-medium text-ink">${minBid}</span>. Paying less than the
        #1 price still puts you on the board at whatever place that bid can take.
      </p>

      <form onSubmit={submit} className="mt-5">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <svg
              viewBox="0 0 24 24"
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint"
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
              aria-hidden
            >
              <circle cx="11" cy="11" r="7" /><path d="m20 20-3.4-3.4" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="App Store link, or just the app name"
              aria-label="App Store link or app name"
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-2xl border border-line bg-surface py-3 pl-10 pr-10 text-sm shadow-card outline-none transition placeholder:text-faint focus:border-accent focus:ring-4 focus:ring-accent-soft"
            />
            {looking && (
              <span className="absolute right-3.5 top-1/2 size-4 -translate-y-1/2 animate-spin rounded-full border-2 border-line border-t-accent" aria-hidden />
            )}
          </div>
          <button
            type="submit"
            disabled={submitting || !state.match}
            className="rounded-2xl px-6 py-3 text-sm font-semibold text-white shadow-card transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: "linear-gradient(145deg, var(--accent), var(--accent-2))" }}
          >
            {submitting ? "Opening checkout…" : isRaise ? `Raise · $${charge.toLocaleString()}` : "Outbid"}
          </button>
        </div>

        {error && (
          <p className="rise mt-2.5 rounded-xl bg-red-500/10 px-3 py-2 text-[13px] text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        {suggestions && suggestions.length > 0 && (
          <ul className="rise mt-2.5 overflow-hidden rounded-2xl border border-line bg-surface text-left shadow-card">
            <li className="border-b border-line px-3.5 py-2 text-[11px] font-medium uppercase tracking-wide text-faint">
              Pick the app you mean
            </li>
            {suggestions.map((s) => (
              <li key={s.appId}>
                <button
                  type="button"
                  onClick={() => void pickSuggestion(s.appId)}
                  className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition hover:bg-surface-2"
                >
                  <Image src={s.iconUrl} alt="" width={36} height={36} className="squircle size-9 shrink-0 ring-1 ring-line" unoptimized />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{s.name}</span>
                    <span className="block truncate text-xs text-muted">{s.developer} · {s.genre}</span>
                  </span>
                  <Stars rating={s.rating} count={s.ratingCount} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {state.match && (
          <div className="rise mt-2.5 flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-left shadow-card">
            <Image src={state.match.iconUrl} alt="" width={52} height={52} className="squircle size-13 shrink-0 ring-1 ring-line" unoptimized />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{state.match.name}</p>
              <p className="truncate text-xs text-muted">
                {state.match.developer} · {state.match.genre}
                {state.match.formattedPrice ? ` · ${state.match.formattedPrice}` : ""}
              </p>
              <p className="mt-0.5 text-xs">
                {isRaise ? (
                  <span className="text-muted">
                    On the board at{" "}
                    <span className="font-semibold text-ink">${state.currentBid.toLocaleString()}</span>. You pay the
                    difference: <span className="font-semibold text-accent">${charge.toLocaleString()}</span>.
                  </span>
                ) : (
                  <span className="text-muted">Not on the board yet — this would be its first bid.</span>
                )}
              </p>
            </div>
            {takesTop && (
              <span className="hidden shrink-0 rounded-full bg-gold-soft px-2.5 py-1 text-[11px] font-semibold text-gold sm:block">
                Takes #1
              </span>
            )}
          </div>
        )}

        <p className="mt-3 text-xs text-faint">
          Already on the board? Enter the same app and raise your bid — you only pay the difference.
        </p>
      </form>
    </section>
  );
}
