/**
 * The head surface, in one place.
 *
 * Every page route builds its tags through `pageHead()`, so canonical, robots,
 * Open Graph and the structured-data block cannot drift apart between eleven
 * routes. The board-scoped JSON-LD nodes come from `jsonld-board.ts` and are
 * passed in, which keeps this file free of any Convex import and free of a
 * circular dependency.
 */
import type { FunctionReturnType } from "convex/server";
import type { api } from "@convex/_generated/api";

export const SITE = "https://iosrank.lol";

/** Derived from the query, never hand written. */
export type BoardPage = FunctionReturnType<typeof api.board.page>;

/** Absolute URL for a site-relative path. Every canonical on the site goes through this. */
export function absolute(path: string): string {
  return `${SITE}${path}`;
}

/**
 * Page 1 canonicalises to the bare path, every deeper page is self-canonical.
 *
 * Google's own pagination guidance is that each page gets its own canonical.
 * Pointing page 7 at page 1 would eventually cut the only crawl path to ranks
 * 301 and beyond, which is a product failure for whoever paid for rank 312.
 */
export function boardCanonical(path: string, page: number): string {
  return page > 1 ? `${absolute(path)}?page=${page}` : absolute(path);
}

/** "351 to 400". The inclusive rank span this page is showing. */
export function pageRange(board: BoardPage): { from: number; to: number } {
  const from = (board.page - 1) * board.pageSize + 1;
  return { from, to: Math.max(from, Math.min(board.page * board.pageSize, board.total)) };
}

export type Crumb = { name: string; path: string };

type HeadInput = {
  title: string;
  description: string;
  /** Absolute. Omitted only on /success, which is `private, no-store` and indexed nowhere. */
  canonical?: string;
  /**
   * `noindex`. Used by a Today board with no rows: the 27 category-today pages
   * are a thin-content generator until somebody pays, and they flip back the
   * moment one does. Links are still followed, so the board below stays
   * crawlable from an empty window.
   */
  noindex?: boolean;
  /** Pairs with `noindex` to make it `noindex, nofollow`. /success only. */
  nofollow?: boolean;
  /** Board-scoped structured data, already built. One <script> per node. */
  jsonld?: readonly object[];
};

/**
 * The tags for one page.
 *
 * `head()` receives `loaderData` as OPTIONAL: it is undefined while the loader
 * is pending, during error rendering and on any `ssr: false` route. Every route
 * that reads loader data guards it and returns `{}` instead, which falls back to
 * the root's title and description rather than throwing inside head generation
 * and emitting a blank <head>.
 */
export function pageHead({ title, description, canonical, noindex, nofollow, jsonld }: HeadInput) {
  return {
    meta: [
      { title },
      { name: "description", content: description },
      ...(noindex
        ? [{ name: "robots", content: nofollow ? "noindex, nofollow" : "noindex, follow" }]
        : []),
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      ...(canonical ? [{ property: "og:url", content: canonical }] : []),
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
    ],
    links: canonical ? [{ rel: "canonical", href: canonical }] : [],
    scripts: (jsonld ?? []).map((node) => ({
      type: "application/ld+json",
      children: JSON.stringify(node),
    })),
  };
}
