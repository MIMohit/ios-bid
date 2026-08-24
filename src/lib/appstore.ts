import { categorySlugFor } from "./categories";

/** Normalized App Store metadata — everything a listing needs. */
export type AppMeta = {
  appId: string;
  bundleId: string | null;
  name: string;
  subtitle: string | null;
  description: string | null;
  iconUrl: string;
  developer: string;
  developerUrl: string | null;
  price: number;
  formattedPrice: string | null;
  rating: number | null;
  ratingCount: number;
  contentRating: string | null;
  minimumOs: string | null;
  version: string | null;
  genre: string;
  categorySlug: string;
  screenshots: string[];
  url: string;
  slug: string;
};

export class AppStoreError extends Error {}

const LOOKUP = "https://itunes.apple.com/lookup";
const SEARCH = "https://itunes.apple.com/search";
const APPLE_HOSTS = /(^|\.)(apps|itunes|geo\.itunes)\.apple\.com$/i;

/**
 * Pull the Apple trackId out of whatever the user pasted. The id is the only
 * part of an App Store URL that identifies the app, so keying on it means
 * locale prefixes, slug changes, and affiliate/tracking parameters can never
 * split one app into two listings.
 */
export function extractAppId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  // Bare id, with or without the "id" prefix.
  const bare = raw.match(/^(?:id)?(\d{6,12})$/i);
  if (bare) return bare[1];

  let url: URL;
  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (!APPLE_HOSTS.test(url.hostname)) return null;

  const fromPath = url.pathname.match(/\/id(\d{6,12})/i);
  if (fromPath) return fromPath[1];

  // Newer short links: apps.apple.com/app/foo?id=123456789
  const fromQuery = url.searchParams.get("id");
  if (fromQuery && /^\d{6,12}$/.test(fromQuery)) return fromQuery;

  return null;
}

/**
 * Follow redirects so shortened links resolve to the App Store URL they point
 * at, rather than being listed as themselves.
 */
async function resolveRedirect(input: string): Promise<string> {
  const raw = input.trim();
  if (!/^https?:\/\//i.test(raw)) return raw;
  try {
    const res = await fetch(raw, {
      method: "GET",
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 (compatible; iosbid/1.0)" },
      signal: AbortSignal.timeout(6000),
    });
    return res.url || raw;
  } catch {
    return raw;
  }
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "app"
  );
}

/**
 * The App Store shows a short subtitle under the app name; the lookup API does
 * not expose it, so use the first sentence of the description as a stand-in.
 */
function deriveSubtitle(description?: string): string | null {
  if (!description) return null;
  const firstLine = description.split("\n").find((l) => l.trim().length > 0);
  if (!firstLine) return null;
  const trimmed = firstLine.trim();
  if (trimmed.length <= 140) return trimmed;
  const cut = trimmed.slice(0, 140);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return (lastStop > 60 ? cut.slice(0, lastStop + 1) : cut.replace(/\s+\S*$/, "")) + (lastStop > 60 ? "" : "…");
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function normalize(r: any): AppMeta {
  const icon: string = r.artworkUrl512 || r.artworkUrl100 || r.artworkUrl60 || "";
  return {
    appId: String(r.trackId),
    bundleId: r.bundleId ?? null,
    name: r.trackName ?? r.trackCensoredName ?? "Untitled app",
    subtitle: deriveSubtitle(r.description),
    description: r.description ?? null,
    // Ask Apple for a crisp icon rather than the default 512 thumbnail.
    iconUrl: icon.replace(/\/\d+x\d+bb\.(jpg|png)$/, "/512x512bb.png"),
    developer: r.artistName ?? "Unknown developer",
    developerUrl: r.artistViewUrl ?? null,
    price: typeof r.price === "number" ? r.price : 0,
    formattedPrice: r.formattedPrice ?? null,
    rating: typeof r.averageUserRating === "number" ? r.averageUserRating : null,
    ratingCount: typeof r.userRatingCount === "number" ? r.userRatingCount : 0,
    contentRating: r.trackContentRating ?? r.contentAdvisoryRating ?? null,
    minimumOs: r.minimumOsVersion ?? null,
    version: r.version ?? null,
    genre: r.primaryGenreName ?? "Other",
    categorySlug: categorySlugFor(r.primaryGenreId, r.primaryGenreName),
    screenshots: Array.isArray(r.screenshotUrls) ? r.screenshotUrls.slice(0, 6) : [],
    // Canonical, parameter-free link. Clicks go here.
    url: `https://apps.apple.com/us/app/${slugify(r.trackName ?? "app")}/id${r.trackId}`,
    slug: slugify(r.trackName ?? `app-${r.trackId}`),
  };
}

async function itunes(url: string): Promise<any[]> {
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!res.ok) throw new AppStoreError("Could not reach the App Store right now. Try again.");
  const body = await res.json();
  return Array.isArray(body?.results) ? body.results : [];
}

/** Look up one app by Apple trackId. Rejects anything that is not an iOS app. */
export async function lookupApp(appId: string): Promise<AppMeta> {
  const results = await itunes(
    `${LOOKUP}?id=${encodeURIComponent(appId)}&country=us&entity=software`,
  );
  const hit = results.find((r) => r.wrapperType === "software");
  if (!hit) throw new AppStoreError("No App Store app found for that link.");

  // "software" is an iOS app; "mac-software" is Mac-only. This board is iOS only.
  if (hit.kind && hit.kind !== "software") {
    throw new AppStoreError("That is not an iOS app. iosbid only lists apps from the iOS App Store.");
  }
  const devices: string[] = Array.isArray(hit.supportedDevices) ? hit.supportedDevices : [];
  if (devices.length > 0 && !devices.some((d) => /^(iPhone|iPad|iPod)/i.test(d))) {
    throw new AppStoreError("That app does not run on iPhone or iPad.");
  }
  return normalize(hit);
}

/** Free-text search, so people can list an app without hunting for its URL. */
export async function searchApps(term: string, limit = 8): Promise<AppMeta[]> {
  const results = await itunes(
    `${SEARCH}?term=${encodeURIComponent(term)}&country=us&entity=software&limit=${limit}`,
  );
  return results.filter((r) => r.wrapperType === "software" && r.kind === "software").map(normalize);
}

/**
 * Resolve whatever the user typed into a single app: an App Store link, a bare
 * id, a shortened link that redirects to one, or a name to search for.
 */
export async function resolveInput(
  input: string,
): Promise<{ match: AppMeta } | { suggestions: AppMeta[] }> {
  const raw = input.trim();
  if (!raw) throw new AppStoreError("Enter an App Store link or an app name.");

  let appId = extractAppId(raw);

  // A link that is not an Apple link may still redirect to one.
  if (!appId && /^https?:\/\//i.test(raw)) {
    appId = extractAppId(await resolveRedirect(raw));
    if (!appId) {
      throw new AppStoreError(
        "That link does not point to an iOS App Store app. Paste an apps.apple.com link.",
      );
    }
  }

  if (appId) return { match: await lookupApp(appId) };

  const suggestions = await searchApps(raw);
  if (suggestions.length === 0) throw new AppStoreError(`No iOS apps found for "${raw}".`);
  if (suggestions.length === 1) return { match: suggestions[0] };
  return { suggestions };
}
