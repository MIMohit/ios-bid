"use client";

import { useState } from "react";
import { money } from "@/lib/format";

export function RaiseWidget({
  appId,
  currentBid,
  isListed,
  minBid,
}: {
  appId: string;
  currentBid: number;
  isListed: boolean;
  minBid: number;
}) {
  const minimum = isListed ? currentBid + 1 : minBid;
  const [amount, setAmount] = useState(minimum);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const charge = isListed ? Math.max(0, amount - currentBid) : amount;

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ appId, amount }),
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

  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <p className="text-sm font-semibold">{isListed ? "Raise this bid" : "List this app"}</p>
      <p className="mt-0.5 text-xs text-muted">
        {isListed
          ? `Currently ${money(currentBid)} on the board. You only pay the difference.`
          : `New listings start at ${money(minBid)}.`}
      </p>

      <div className="mt-3 flex items-center gap-2">
        <div className="flex items-center gap-1 rounded-xl border border-line bg-surface-2 px-2 py-1.5">
          <span className="text-sm font-semibold text-accent">$</span>
          <input
            type="number"
            inputMode="numeric"
            value={amount}
            min={minimum}
            max={999999}
            onChange={(e) => setAmount(Math.floor(Number(e.target.value) || 0))}
            onBlur={() => setAmount((a) => Math.max(minimum, Math.floor(a) || minimum))}
            className="tnum w-20 bg-transparent text-sm font-semibold outline-none"
          />
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="flex-1 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition enabled:hover:brightness-110 disabled:opacity-50"
          style={{ background: "linear-gradient(145deg, var(--accent), var(--accent-2))" }}
        >
          {submitting ? "Opening…" : isListed ? `Raise · $${charge.toLocaleString()}` : "List it"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}
