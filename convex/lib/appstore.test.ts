import { expect, test, vi } from "vitest";
import { extractAppId, lookupApp } from "./appstore";
import { MAX_DESCRIPTION, MAX_SCREENSHOTS } from "../rules";

test("every shape of App Store input resolves to the same trackId", () => {
  for (const input of [
    "284882215",
    "id284882215",
    "https://apps.apple.com/us/app/facebook/id284882215",
    "https://apps.apple.com/gb/app/facebook/id284882215?mt=8&ct=affiliate",
    "apps.apple.com/app/facebook?id=284882215",
  ]) {
    expect(extractAppId(input), input).toBe("284882215");
  }
  for (const input of ["", "facebook", "https://example.com/id284882215"]) {
    expect(extractAppId(input), input).toBeNull();
  }
});

/**
 * The three things normalize() does that the board depends on and that a
 * refactor would silently break: one icon host, an iPad fallback so the
 * spotlight panel is never empty, and both write-boundary caps.
 */
test("lookup pins the artwork host and honours the document caps", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        resultCount: 1,
        results: [
          {
            wrapperType: "software",
            kind: "software",
            trackId: 284882215,
            trackName: "Facebook",
            description: "x".repeat(MAX_DESCRIPTION * 2),
            artworkUrl512: "https://is5-ssl.mzstatic.com/image/thumb/a/512x512bb.jpg",
            screenshotUrls: [],
            ipadScreenshotUrls: Array.from(
              { length: MAX_SCREENSHOTS + 3 },
              (_, i) => `https://is3-ssl.mzstatic.com/image/thumb/s${i}/392x696bb.png`,
            ),
            artistName: "Meta",
            primaryGenreId: 6005,
            primaryGenreName: "Social Networking",
          },
        ],
      }),
    ),
  );

  const meta = await lookupApp("284882215");
  expect(meta.iconUrl).toBe("https://is1-ssl.mzstatic.com/image/thumb/a/512x512bb.png");
  expect(meta.screenshots).toHaveLength(MAX_SCREENSHOTS);
  expect(meta.screenshots.every((s) => s.startsWith("https://is1-ssl."))).toBe(true);
  expect(meta.description?.length).toBeLessThanOrEqual(MAX_DESCRIPTION + 1);
  expect(meta.categorySlug).toBe("social-networking");
  expect(meta.url).toBe("https://apps.apple.com/us/app/facebook/id284882215");
  vi.unstubAllGlobals();
});
