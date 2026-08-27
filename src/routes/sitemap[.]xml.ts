import { createFileRoute } from "@tanstack/react-router";
import { api } from "@convex/_generated/api";
import { convexServer } from "~/lib/convex-server";

const SITE = "https://iosrank.lol";

/**
 * The URL space, gated on what actually has content.
 *
 * `api.seo.sitemap` returns `hasListings` and `hasToday` per category in about
 * 29 document reads, and the gate is the whole point: a category board with no
 * listings is a thin page we asked Google to crawl. At launch that is all 27 of
 * them, so an ungated list would submit 27 empty boards to the exact crawlers
 * the site wants to be trusted by.
 *
 * Deliberately absent: /?page=N (indexable and self-canonical, but a sitemap of
 * paginated duplicates is noise), /success, /go/:slug and /opengraph-image.
 *
 * ponytail: single sitemap. Split by section at 45,000 URLs.
 */

/** Board surfaces. They are exactly as fresh as the most recent settled payment. */
const BOARD_PATHS = ["/", "/categories", "/stats"];

/** Prose. Nothing on the deployment tells us when these last changed, so they carry no lastmod. */
const DOC_PATHS = ["/rules", "/about", "/terms", "/privacy"];

type Entry = { path: string; lastmod?: number };

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// lastmod is the one optional field Google has said it uses, and only while it
// is honest, so it is emitted from a real settled-payment timestamp or not at
// all. changefreq and priority are ignored outright.
function xml(entries: readonly Entry[]): string {
  const urls = entries.map((entry) => {
    const lastmod = entry.lastmod
      ? `<lastmod>${new Date(entry.lastmod).toISOString()}</lastmod>`
      : "";
    return `<url><loc>${escape(SITE + entry.path)}</loc>${lastmod}</url>`;
  });
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    urls.join("") +
    "</urlset>"
  );
}

async function entries(): Promise<Entry[]> {
  const client = convexServer();
  const [seo, receipts] = await Promise.all([
    client.query(api.seo.sitemap, {}),
    client.query(api.receipt.slugs, {}),
  ]);

  const lastmod = seo.lastBidAt || undefined;
  // The global Today board is empty exactly when no category has a today row,
  // and an empty Today board serves noindex. Do not submit it.
  const hasToday = seo.categories.some((c) => c.hasToday);

  return [
    ...BOARD_PATHS.map((path) => ({ path, lastmod })),
    ...(hasToday ? [{ path: "/today", lastmod }] : []),
    ...DOC_PATHS.map((path) => ({ path })),
    ...seo.categories.flatMap((c) => [
      ...(c.hasListings ? [{ path: `/category/${c.slug}`, lastmod }] : []),
      ...(c.hasToday ? [{ path: `/category/${c.slug}/today`, lastmod }] : []),
    ]),
    // One receipt per paid listing. /r/:slug is a share target, not a detail
    // page, but it is a real page about a real purchase and it is the only URL
    // on the site that names one app.
    ...receipts.map((r) => ({ path: `/r/${r.slug}`, lastmod: r.lastBidAt })),
  ];
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        // A sitemap that 500s is a sitemap Search Console reports as an error
        // for days. If Convex is unreachable, serve the pages that exist
        // regardless of any data.
        let list: Entry[];
        try {
          list = await entries();
        } catch (error) {
          console.error("[sitemap]", error);
          list = [...BOARD_PATHS, ...DOC_PATHS].map((path) => ({ path }));
        }

        return new Response(xml(list), {
          headers: {
            "content-type": "application/xml; charset=utf-8",
            "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400",
          },
        });
      },
    },
  },
});
