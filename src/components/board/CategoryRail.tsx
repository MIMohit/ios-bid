import type { FunctionReturnType } from "convex/server";
import type { api } from "@convex/_generated/api";
import { CATEGORIES } from "@convex/lib/categories";
import { money } from "~/lib/format";

/** Derived from the query, never hand written. */
export type CategoryTotals = FunctionReturnType<typeof api.categories.totals>;

/** Slug to Apple's own display name. `categories.totals` returns slugs only. */
const CATEGORY_NAME = new Map<string, string>(CATEGORIES.map((c) => [c.slug, c.name]));

type Props = {
  /** Which board this rail belongs to. It picks the heading, the hrefs and the number. */
  window: "all" | "today";
  /** The category slug this page is showing, or null on an "All" board. */
  active: string | null;
  categories: CategoryTotals;
  /** The board's own top bid, for the "All" row. */
  topBid: number;
};

/**
 * Every App Store category with its current top bid, as a price list of
 * markets. All 27 always render, including the empty ones at $0: the rail is a
 * fixed-length list, and a category appearing the moment someone bids on it
 * would reflow the whole column.
 *
 * The two windows differ in four places and nowhere else, so they are one
 * component with a `window` prop rather than two that drift apart.
 */
export function CategoryRail({ window, active, categories, topBid }: Props) {
  const today = window === "today";
  const allHref = today ? "/today" : "/";
  const sum = (category: CategoryTotals[number]) => (today ? category.todayTotal : category.topBid);

  // Sorted by the number the rail actually shows, so the column reads top down.
  const ranked = [...categories].sort((a, b) => sum(b) - sum(a));

  return (
    <aside className="rail" aria-label="Categories">
      <div className="rail-head">{today ? "Category · paid today" : "Category · top bid"}</div>
      <ul>
        <li>
          <a className={active === null ? "rail-item is-active" : "rail-item"} href={allHref}>
            <span className="rail-name">All</span>
            <span className="rail-sum">{money(topBid)}</span>
          </a>
        </li>
        {ranked.map((category) => (
          <li key={category.slug}>
            <a
              className={category.slug === active ? "rail-item is-active" : "rail-item"}
              href={today ? `/category/${category.slug}/today` : `/category/${category.slug}`}
            >
              <span className="rail-name">{CATEGORY_NAME.get(category.slug) ?? category.slug}</span>
              <span className="rail-sum">{money(sum(category))}</span>
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}
