/// <reference types="vite/client" />
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import appCss from "~/styles/app.css?url";
import { Squircle } from "~/components/Squircle";
import { THEME_SCRIPT } from "~/lib/theme";
import { ORGANIZATION, WEBSITE } from "~/lib/jsonld";

const SITE = "https://iosrank.lol";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "iosrank.lol · the pay-to-rank iOS app leaderboard" },
      {
        name: "description",
        content:
          "iOS App Store apps ranked only by what was paid for the spot. Every listing is a paid placement.",
      },
      // One value, not a media pair: head tags are deduped by name, so a second
      // theme-color silently replaces the first. Black is the site's identity in
      // both themes, and the light theme's chrome is glass over content anyway.
      { name: "theme-color", content: "#000000" },
      { property: "og:site_name", content: "iosrank.lol" },
      { property: "og:type", content: "website" },
      { property: "og:image", content: `${SITE}/opengraph-image` },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      // No crossorigin: a plain <img src> is a non-CORS request and a preconnect
      // only matches the same CORS mode. Every icon on the board is on this one
      // host, so this is one handshake for fifty images.
      { rel: "preconnect", href: "https://is1-ssl.mzstatic.com" },
      { rel: "dns-prefetch", href: "https://is1-ssl.mzstatic.com" },
      { rel: "icon", href: "/favicon.ico", sizes: "32x32" },
      { rel: "icon", href: "/icon-512.png", type: "image/png", sizes: "512x512" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
    ],
    scripts: [
      { type: "application/ld+json", children: JSON.stringify(ORGANIZATION) },
      { type: "application/ld+json", children: JSON.stringify(WEBSITE) },
      // Cookieless first-party analytics. import.meta.env, not process.env:
      // head() runs on both server and client and only import.meta.env is
      // statically replaced in the client bundle.
      ...(import.meta.env.VITE_DATAFAST_ID
        ? [
            {
              src: "https://datafa.st/js/script.js",
              defer: true,
              "data-website-id": import.meta.env.VITE_DATAFAST_ID,
              "data-domain": "iosrank.lol",
            },
          ]
        : []),
    ],
  }),
  // shellComponent always server-renders and wraps component / errorComponent /
  // notFoundComponent, so the <html> shell survives every failure mode.
  shellComponent: RootDocument,
  component: () => <Outlet />,
});

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // suppressHydrationWarning: the blocking script below stamps data-theme on
    // <html> before React exists, so the server markup deliberately lacks it.
    // This is the one attribute where a mismatch is the design.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          Blocking, first thing in <head>, before the stylesheet: resolves the
          stored preference then the system preference and stamps data-theme on
          <html> before first paint. Without it the page renders one frame in
          the wrong theme. The storage key lives in ~/lib/theme.ts so the toggle
          button and this script cannot drift apart.
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        <Squircle />
        {children}
        <Scripts />
      </body>
    </html>
  );
}
