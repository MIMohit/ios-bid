import type { ReactNode } from "react";

/**
 * A header that cannot fail. The real chrome header subscribes to live Convex
 * data, and rendering that inside an error boundary is how a broken page
 * becomes a blank one, so the error and not-found pages carry this instead.
 *
 * Plain anchors, not <Link>: a hard navigation out of a failed render discards
 * whatever router state broke, which is the point.
 */
export function FallbackNav() {
  return (
    <header
      className="page"
      style={{
        height: 52,
        display: "flex",
        alignItems: "center",
        gap: 18,
        borderBottom: "1px solid var(--hairline)",
      }}
    >
      <a
        href="/"
        style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 600, letterSpacing: "-0.022em" }}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <rect x="1" y="11" width="4" height="6" rx="1.4" fill="currentColor" opacity=".45" />
          <rect x="7" y="7" width="4" height="10" rx="1.4" fill="currentColor" opacity=".72" />
          <rect x="13" y="2" width="4" height="15" rx="1.4" fill="var(--accent)" />
        </svg>
        iosbid.lol
      </a>
      <nav style={{ marginLeft: "auto", display: "flex", gap: 20, fontSize: 13, color: "var(--label-2)" }}>
        <a href="/">Leaderboard</a>
        <a href="/categories">Categories</a>
        <a href="/about">About</a>
      </nav>
    </header>
  );
}

/**
 * Rendered for any route that does not exist and for any board page past the
 * last one. A deep `?page=` that serves a 200 with nothing on it is a crawl
 * trap, so this is a real 404 with the nav intact.
 */
export function NotFound({ children }: { children?: ReactNode }) {
  return (
    <>
      <FallbackNav />
      <main className="page" style={{ paddingBlock: 96, maxWidth: 620 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.03em", margin: 0 }}>
          Nothing at this address
        </h1>
        <p style={{ marginTop: 10, fontSize: 14, color: "var(--label-2)" }}>
          {children ?? "That page does not exist, or that rank has not been bid for yet."}
        </p>
        <p style={{ marginTop: 18, fontSize: 14 }}>
          <a href="/" style={{ color: "var(--accent)" }}>
            Back to the leaderboard
          </a>
        </p>
      </main>
    </>
  );
}
