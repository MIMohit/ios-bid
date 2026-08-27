import { ConvexError } from "convex/values";
import type { AppMeta } from "../schema";
import { MAX_DESCRIPTION, MAX_SCREENSHOTS } from "../rules";
import { categorySlugFor } from "./categories";

/**
 * Every message here is shown to the person who typed the input, so it is a
 * ConvexError: plain Error messages are scrubbed in a production deployment.
 */
export class AppStoreError extends ConvexError<{ code: "appstore"; message: string }> {
  constructor(message: string) {
    super({ code: "appstore", message });
  }
}

const LOOKUP = "https://itunes.apple.com/lookup";
const SEARCH = "https://itunes.apple.com/search";
const APPLE_HOSTS = /(^|\.)(apps|itunes|geo\.itunes)\.apple\.com$/i;

/**
 * Apple serves the same artwork from is1 through is5. Rewriting every host to
 * is1 means a board of 50 icons plus the spotlight screenshots costs one TLS
 * handshake and one preconnect instead of five.
 */
const pinHost = (url: string): string =>
  url.replace(/^https:\/\/is\d-ssl\.mzstatic\.com/, "https://is1-ssl.mzstatic.com");

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
  if (bare?.[1]) return bare[1];

  let url: URL;
  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (!APPLE_HOSTS.test(url.hostname)) return null;

  const fromPath = url.pathname.match(/\/id(\d{6,12})/i);
  if (fromPath?.[1]) return fromPath[1];

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
      headers: { "user-agent": "Mozilla/5.0 (compatible; iosrank/1.0)" },
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
function deriveSubtitle(description: string | undefined): string | undefined {
  const firstLine = description?.split("\n").find((l) => l.trim().length > 0)?.trim();
  if (!firstLine) return undefined;
  if (firstLine.length <= 140) return firstLine;
  const cut = firstLine.slice(0, 140);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return lastStop > 60 ? cut.slice(0, lastStop + 1) : `${cut.replace(/\s+\S*$/, "")}…`;
}

/**
 * The spotlight panel shows a few lines, not the whole listing. The cap is also
 * a write boundary: see the document budget note in schema.ts.
 */
function trimDescription(description: string | undefined): string | undefined {
  const text = description?.trim();
  if (!text) return undefined;
  if (text.length <= MAX_DESCRIPTION) return text;
  return `${text.slice(0, MAX_DESCRIPTION).replace(/\s+\S*$/, "")}…`;
}

/** iTunes returns untyped JSON, so every field is read through one of these. */
type Raw = Record<string, unknown>;

const str = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined;

const num = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const urls = (value: unknown): string[] =>
  Array.isArray(value) ? value.flatMap((v) => (str(v) ? [pinHost(String(v))] : [])) : [];

function normalize(r: Raw): AppMeta {
  const appId = String(num(r.trackId) ?? str(r.trackId) ?? "");
  const name = str(r.trackName) ?? str(r.trackCensoredName) ?? "Untitled app";
  const description = str(r.description);
  const icon = str(r.artworkUrl512) ?? str(r.artworkUrl100) ?? str(r.artworkUrl60) ?? "";
  const shots = urls(r.screenshotUrls);

  return {
    appId,
    slug: slugify(name),
    name,
    subtitle: deriveSubtitle(description),
    description: trimDescription(description),
    // Ask Apple for a crisp icon rather than the default 512 thumbnail.
    iconUrl: pinHost(icon.replace(/\/\d+x\d+bb\.(jpg|png)$/, "/512x512bb.png")),
    // An iPad-only app has no iPhone screenshots, so fall back rather than
    // hand the spotlight panel an empty array for a whole class of apps.
    screenshots: (shots.length > 0 ? shots : urls(r.ipadScreenshotUrls)).slice(0, MAX_SCREENSHOTS),
    developer: str(r.artistName) ?? "Unknown developer",
    price: num(r.price) ?? 0,
    formattedPrice: str(r.formattedPrice),
    rating: num(r.averageUserRating),
    ratingCount: num(r.userRatingCount) ?? 0,
    genre: str(r.primaryGenreName) ?? "Other",
    categorySlug: categorySlugFor(num(r.primaryGenreId) ?? str(r.primaryGenreId), str(r.primaryGenreName)),
    // Canonical, parameter-free link. Clicks go here.
    url: `https://apps.apple.com/us/app/${slugify(name)}/id${appId}`,
  };
}

async function itunes(url: string): Promise<Raw[]> {
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!res.ok) throw new AppStoreError("Could not reach the App Store right now. Try again.");
  const body: unknown = await res.json();
  const results = (body as { results?: unknown } | null)?.results;
  return Array.isArray(results) ? (results as Raw[]) : [];
}

/** Look up one app by Apple trackId. Rejects anything that is not an iOS app. */
export async function lookupApp(appId: string): Promise<AppMeta> {
  const results = await itunes(
    `${LOOKUP}?id=${encodeURIComponent(appId)}&country=us&entity=software`,
  );
  const hit = results.find((r) => r.wrapperType === "software");
  if (!hit) throw new AppStoreError("No App Store app found for that link.");

  // "software" is an iOS app; "mac-software" is Mac-only. This board is iOS only.
  const kind = str(hit.kind);
  if (kind && kind !== "software") {
    throw new AppStoreError("That is not an iOS app. iosrank only lists apps from the iOS App Store.");
  }
  const devices = Array.isArray(hit.supportedDevices) ? hit.supportedDevices : [];
  if (devices.length > 0 && !devices.some((d) => /^(iPhone|iPad|iPod)/i.test(String(d)))) {
    throw new AppStoreError("That app does not run on iPhone or iPad.");
  }
  return normalize(hit);
}

/** Free-text search, so people can list an app without hunting for its URL. */
export async function searchApps(term: string, limit = 8): Promise<AppMeta[]> {
  const results = await itunes(
    `${SEARCH}?term=${encodeURIComponent(term)}&country=us&entity=software&limit=${limit}`,
  );
  return results
    .filter((r) => r.wrapperType === "software" && r.kind === "software")
    .map(normalize);
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
  const only = suggestions[0];
  if (!only) throw new AppStoreError(`No iOS apps found for "${raw}".`);
  if (suggestions.length === 1) return { match: only };
  return { suggestions };
}
