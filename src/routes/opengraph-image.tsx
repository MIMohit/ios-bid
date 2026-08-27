import { createFileRoute } from "@tanstack/react-router";
import satori from "satori";
import sharp from "sharp";
import geist from "~/assets/Geist-Regular.ttf?inline";
import { boardPricing, convexServer } from "~/lib/convex-server";
import { MIN_BID } from "@convex/rules";
import { money } from "~/lib/format";

// satori and sharp directly, not @vercel/og. og@1.0.2 publishes its Node build
// as ESM with harfbuzzjs inlined as CommonJS, so loading it under Node ESM dies
// on `Dynamic require of "fs" is not supported` and then cannot find hb.wasm.
// satori imports harfbuzzjs by name, so nitro traces the wasm into
// .output/server on its own, and sharp is already there for the SVG to PNG step.

// ?inline gives a base64 data URI at build time, so the font is in the bundle
// and the route touches neither the filesystem nor the network to render.
const GEIST = Buffer.from(geist.slice(geist.indexOf(",") + 1), "base64");

// Direction C on a 1200x630 canvas: true black, one accent, hierarchy from
// scale alone. No card, no border, no glow, exactly as on the board itself.
const BLACK = "#000000";
const LABEL = "#FFFFFF";
const LABEL_2 = "rgba(235,235,245,0.68)";
const LABEL_3 = "rgba(235,235,245,0.52)";
const ACCENT = "#30D158";

// satori ships one face, Geist at weight 400, so scale and colour carry every
// step of the hierarchy. Asking for a bold weight would silently render regular.
const FONT = "geist";

/**
 * Inline the icon rather than letting satori fetch it. A failed or slow fetch
 * inside satori takes the whole image down; here it degrades to no icon.
 * `iconUrl` is already the 512px PNG on the pinned is1-ssl host.
 */
async function iconDataUri(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    return `data:${res.headers.get("content-type") ?? "image/png"};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

/** The three ascending bars of the wordmark, tallest one in the accent. */
function Mark() {
  const bar = (h: number, color: string, opacity: number) => ({
    width: 14,
    height: h,
    borderRadius: 5,
    background: color,
    opacity,
  });
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 7 }}>
      <div style={bar(21, LABEL, 0.45)} />
      <div style={bar(35, LABEL, 0.72)} />
      <div style={bar(53, ACCENT, 1)} />
    </div>
  );
}

export const Route = createFileRoute("/opengraph-image")({
  server: {
    handlers: {
      GET: async () => {
        const board = await convexServer().query(boardPricing, { window: "all" });
        const icon = await iconDataUri(board.topIconUrl);
        const claimed = board.topName !== null && board.topBid > 0;

        const svg = await satori(
          (
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                background: BLACK,
                color: LABEL,
                fontFamily: FONT,
                padding: 72,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <Mark />
                  <div style={{ display: "flex", fontSize: 34, letterSpacing: "-0.022em" }}>iosrank.lol</div>
                </div>
                <div style={{ display: "flex", fontSize: 22, color: LABEL_3 }}>Rank is the bid.</div>
              </div>

              {claimed ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
                    {icon !== null && (
                      <img src={icon} width={132} height={132} style={{ borderRadius: 30 }} alt="" />
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ display: "flex", fontSize: 26, color: LABEL_3, letterSpacing: "0.01em" }}>
                        #1 on the board
                      </div>
                      <div style={{ display: "flex", fontSize: 60, letterSpacing: "-0.03em" }}>
                        {board.topName}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 22 }}>
                    <div style={{ display: "flex", fontSize: 116, color: ACCENT, letterSpacing: "-0.038em" }}>
                      {money(board.topBid)}
                    </div>
                    <div style={{ display: "flex", fontSize: 26, color: LABEL_2, paddingBottom: 22 }}>
                      paid for the spot
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  <div style={{ display: "flex", fontSize: 64, letterSpacing: "-0.03em" }}>
                    Nobody has bid yet.
                  </div>
                  <div style={{ display: "flex", fontSize: 116, color: ACCENT, letterSpacing: "-0.038em" }}>
                    {`${money(MIN_BID)} takes #1.`}
                  </div>
                </div>
              )}

              <div style={{ display: "flex", fontSize: 28, color: LABEL_2 }}>
                {claimed
                  ? `Claim #1 for ${money(board.priceForTop)} · every listing is a paid placement`
                  : "iOS App Store apps ranked only by what was paid · every listing is a paid placement"}
              </div>
            </div>
          ),
          {
            width: 1200,
            height: 630,
            fonts: [{ name: FONT, data: GEIST, weight: 400, style: "normal" }],
          },
        );

        return new Response(await sharp(Buffer.from(svg)).png().toBuffer(), {
          headers: {
            "content-type": "image/png",
            "cache-control": "public, s-maxage=300, stale-while-revalidate=3600",
          },
        });
      },
    },
  },
});
