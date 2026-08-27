import { createFileRoute } from "@tanstack/react-router";
import { boardDestination, convexServer, trackEdge, utcDay } from "~/lib/convex-server";
import { readSid } from "~/server/sid";

const SITE = "https://iosrank.lol";

/** Declared bots that do carry cookies, plus preview fetchers and scripted clients. */
const BOT =
  /bot|crawler|spider|crawling|slurp|preview|fetch|monitor|headless|phantom|python-requests|curl|wget|axios|okhttp|go-http|java\/|libwww|scrapy|lighthouse|semrush|ahrefs|dataforseo/i;

const HEADERS: Record<string, string> = {
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
  // A robots.txt Disallow stops crawling, not indexing of a URL discovered
  // elsewhere. This header is what actually keeps /go/ out of the index.
  "x-robots-tag": "noindex, nofollow",
};

/** OWNER-DECISIONS section 7. The stored url is parameter free, but not assumed to be. */
function destination(url: string): string {
  const u = new URL(url);
  u.searchParams.set("utm_source", "iosrank");
  return u.toString();
}

/**
 * Everything a tap has to look like to be counted, decided from headers alone
 * so a bot costs one 302 and never touches Convex. The caller checks the cookie
 * first, which is the strongest signal and the cheapest.
 *
 * Clients that send no Sec-Fetch-* headers at all are old, not hostile, and get
 * the benefit of the doubt. Convex enforces the last two rules that headers
 * cannot: one count per (sid, listing, UTC day), and a daily cap per sid.
 */
function isRealTap(h: Headers, ua: string): boolean {
  if (ua === "" || BOT.test(ua)) return false;
  if (h.get("sec-purpose")?.includes("prefetch")) return false;
  if (h.get("purpose") === "prefetch" || h.get("x-moz") === "prefetch") return false;
  const site = h.get("sec-fetch-site");
  if (site !== null && site !== "same-origin" && site !== "none") return false;
  return h.get("sec-fetch-mode") !== "cors";
}

export const Route = createFileRoute("/go/$slug")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const target = await convexServer().query(boardDestination, { slug: params.slug });
        // An unknown slug is a stale share, not an error worth a 404 page.
        if (!target) {
          return new Response(null, { status: 302, headers: { ...HEADERS, location: `${SITE}/` } });
        }

        const sid = readSid();
        if (sid && isRealTap(request.headers, request.headers.get("user-agent") ?? "")) {
          // Awaited, not fired and forgotten: Vercel may freeze the function the
          // moment the response is sent.
          await trackEdge("/track/click", { listingId: target.listingId, sid, day: utcDay() });
        }

        // The 302 always happens. Every filter above decides whether the tap
        // COUNTS, never whether the visitor gets where they were going. 302 and
        // not 301: a permanent redirect invites consolidation of /go/:slug into
        // the App Store URL, and Apple's metadata can move the destination.
        return new Response(null, {
          status: 302,
          headers: { ...HEADERS, location: destination(target.url) },
        });
      },
    },
  },
});
