import type { Metadata } from "next";
import { themeScript } from "@/components/ThemeToggle";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: {
    default: "iosbid.lol — the pay-to-rank board for iOS apps",
    template: "%s · iosbid.lol",
  },
  description:
    "A public leaderboard for iOS apps. Rank is the bid — nothing else. Outbid the current #1 to take the top spot.",
  openGraph: {
    title: "iosbid.lol",
    description: "The pay-to-rank leaderboard for iOS apps. Rank is the bid.",
    url: "/",
    siteName: "iosbid.lol",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "iosbid.lol" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
