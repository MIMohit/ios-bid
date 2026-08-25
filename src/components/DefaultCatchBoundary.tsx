import type { ErrorComponentProps } from "@tanstack/react-router";
import { FallbackNav } from "./NotFound";

/**
 * The router's default error component. It says what happened in one line and
 * never shows a stack trace: the board is a public page and the error may carry
 * a Convex function name or a deployment URL.
 */
export function DefaultCatchBoundary({ reset }: ErrorComponentProps) {
  return (
    <>
      <FallbackNav />
      <main className="page" style={{ paddingBlock: 96, maxWidth: 620 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.03em", margin: 0 }}>
          The board did not load
        </h1>
        <p style={{ marginTop: 10, fontSize: 14, color: "var(--label-2)" }}>
          Something on our side failed. Nothing you did caused it, and no payment was affected.
        </p>
        <p style={{ marginTop: 18, display: "flex", gap: 18, fontSize: 14 }}>
          <button type="button" onClick={reset} style={{ color: "var(--accent)", fontWeight: 600 }}>
            Try again
          </button>
          <a href="/">Back to the leaderboard</a>
        </p>
      </main>
    </>
  );
}
