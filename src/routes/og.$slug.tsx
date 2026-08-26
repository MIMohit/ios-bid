import { createFileRoute } from "@tanstack/react-router";
import satori from "satori";
import sharp from "sharp";
import geist from "~/assets/Geist-Regular.ttf?inline";
import { api } from "@convex/_generated/api";
import { convexServer } from "~/lib/convex-server";
import { money } from "~/lib/format";

/**
 * The card for one receipt, the thing /r/:slug is posted for. Same canvas and
 * same palette as /opengraph-image, one app instead of the whole board.
 *
 * satori and sharp directly, not @vercel/og, for the reason written at the top
 * of opengraph-image.tsx. The palette and the icon inliner are copied there
 * rather than shared: two cards is not a design system.
 */

// ?inline gives a base64 data URI at build time, so the font is in the bundle
// and the route touches neither the filesystem nor the network to render.
const GEIST = Buffer.from(geist.slice(geist.indexOf(",") + 1), "base64");

const BLACK = "#000000";
const LABEL = "#FFFFFF";
const LABEL_2 = "rgba(235,235,245,0.68)";
const LABEL_3 = "rgba(235,235,245,0.52)";
const ACCENT = "#30D158";

// satori ships one face, Geist at weight 400, so scale and colour carry every
// step of the hierarchy. Asking for a bold weight would silently render regular.
const FONT = "geist";

/** Inline the icon: a slow fetch inside satori takes the whole image down, here it degrades to no icon. */
async function iconDataUri(url: string): Promise<string | null> {
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

export const Route = createFileRoute("/og/$slug")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const receipt = await convexServer().query(api.receipt.forSlug, { slug: params.slug });
        if (!receipt) return new Response("not found", { status: 404 });

        const { row, clicks } = receipt;
        const icon = await iconDataUri(row.iconUrl);

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
                  <div style={{ display: "flex", fontSize: 34, letterSpacing: "-0.022em" }}>iosbid.lol</div>
                </div>
                <div style={{ display: "flex", fontSize: 22, color: LABEL_3 }}>Rank is the bid.</div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
                  {icon !== null && (
                    <img src={icon} width={132} height={132} style={{ borderRadius: 30 }} alt="" />
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "flex", fontSize: 26, color: LABEL_3, letterSpacing: "0.01em" }}>
                      #{row.rank} on the board
                    </div>
                    {/* One line. satori does not wrap gracefully at this size. */}
                    <div style={{ display: "flex", fontSize: 60, letterSpacing: "-0.03em" }}>
                      {row.name.length > 26 ? `${row.name.slice(0, 25)}…` : row.name}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 22 }}>
                  <div style={{ display: "flex", fontSize: 116, color: ACCENT, letterSpacing: "-0.038em" }}>
                    {money(row.bid)}
                  </div>
                  <div style={{ display: "flex", fontSize: 26, color: LABEL_2, paddingBottom: 22 }}>
                    paid for the spot
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", fontSize: 28, color: LABEL_2 }}>
                {`${clicks.toLocaleString("en-US")} taps sent · take this rank for ${money(row.priceToTake)}`}
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
