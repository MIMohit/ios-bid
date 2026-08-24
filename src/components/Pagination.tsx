import Link from "next/link";

function pages(current: number, count: number): (number | "gap")[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const set = new Set([1, 2, current - 1, current, current + 1, count - 1, count]);
  const sorted = [...set].filter((n) => n >= 1 && n <= count).sort((a, b) => a - b);

  const out: (number | "gap")[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - (sorted[i - 1] as number) > 1) out.push("gap");
    out.push(n);
  });
  return out;
}

export function Pagination({
  page,
  pageCount,
  total,
  basePath,
  pageSize,
}: {
  page: number;
  pageCount: number;
  total: number;
  basePath: string;
  pageSize: number;
}) {
  if (total === 0) return null;
  const href = (n: number) => (n === 1 ? basePath : `${basePath}?page=${n}`);
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <nav className="mt-6 flex flex-col items-center gap-2" aria-label="Board pages">
      {pageCount > 1 && (
        <ul className="flex flex-wrap items-center justify-center gap-1">
          {pages(page, pageCount).map((p, i) =>
            p === "gap" ? (
              <li key={`gap-${i}`} className="px-1 text-xs text-faint">…</li>
            ) : (
              <li key={p}>
                <Link
                  href={href(p)}
                  aria-current={p === page ? "page" : undefined}
                  className={`tnum grid h-8 min-w-8 place-items-center rounded-lg px-2 text-[13px] font-medium transition ${
                    p === page
                      ? "bg-accent text-white"
                      : "border border-line bg-surface text-muted hover:text-ink"
                  }`}
                >
                  {p}
                </Link>
              </li>
            ),
          )}
        </ul>
      )}
      <p className="tnum text-xs text-faint">
        {from.toLocaleString()} – {to.toLocaleString()} of {total.toLocaleString()}
      </p>
    </nav>
  );
}
