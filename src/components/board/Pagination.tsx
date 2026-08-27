import { MAX_PAGE } from "@convex/rules";

/**
 * The page window: first, last, and a run around the current page, with a single
 * gap glyph on either side. Nine controls at most, so the footer never wraps.
 */
function pageWindow(page: number, pageCount: number): number[] {
  const pages = new Set<number>([1, pageCount, page - 1, page, page + 1]);
  return [...pages].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);
}

type Props = {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  /** Route-aware href for a page number. The routes own their own search params. */
  hrefFor: (page: number) => string;
  /** Re-runs the loaders. There is nothing to poll, so this is reassurance, not a refetch loop. */
  onRefresh: () => void;
};

export function Pagination({ page, pageCount, total, pageSize, hrefFor, onRefresh }: Props) {
  // MAX_PAGE is the Convex read budget: past it the board returns nothing, so
  // linking there would be linking at a blank page.
  const last = Math.min(pageCount, MAX_PAGE);
  const first = (page - 1) * pageSize + 1;
  const shown = Math.min(page * pageSize, total);
  const window = pageWindow(page, last);

  return (
    <nav className="pager" aria-label="Board pages">
      <span className="pager-count">
        <b>
          {first}-{shown}
        </b>{" "}
        of {total.toLocaleString("en-US")}
      </span>

      <div className="pager-nav">
        {page > 1 ? (
          <a className="pg" href={hrefFor(page - 1)} rel="prev">
            Prev
          </a>
        ) : (
          <span className="pg" aria-disabled="true">
            Prev
          </span>
        )}

        {window.map((n, i) => (
          <span key={n} style={{ display: "contents" }}>
            {i > 0 && n - (window[i - 1] ?? 0) > 1 ? (
              <span className="pg" aria-hidden="true">
                {"…"}
              </span>
            ) : null}
            <a
              className="pg"
              href={hrefFor(n)}
              aria-current={n === page ? "page" : undefined}
              aria-label={`Page ${n}`}
            >
              {n}
            </a>
          </span>
        ))}

        {page < last ? (
          <a className="pg" href={hrefFor(page + 1)} rel="next">
            Next
          </a>
        ) : (
          <span className="pg" aria-disabled="true">
            Next
          </span>
        )}
      </div>

      <button type="button" className="refresh" onClick={onRefresh}>
        <svg
          width="13"
          height="13"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 7a5 5 0 1 1-1.6-3.7" />
          <path d="M12.2 1.6v3h-3" />
        </svg>
        Refresh
      </button>
    </nav>
  );
}
