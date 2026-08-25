/**
 * The two static structured-data nodes that every page carries. Board-scoped
 * nodes (ItemList, MobileApplication, BreadcrumbList, FAQPage) live in
 * jsonld-board.ts because they need live data.
 */
const SITE = "https://iosbid.lol";

export const ORGANIZATION = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${SITE}/#organization`,
  name: "iosbid.lol",
  alternateName: "iosbid",
  url: SITE,
  logo: {
    "@type": "ImageObject",
    "@id": `${SITE}/#logo`,
    url: `${SITE}/icon-512.png`,
    width: 512,
    height: 512,
    caption: "iosbid.lol",
  },
  image: { "@id": `${SITE}/#logo` },
  description:
    "iosbid.lol runs a public leaderboard of iOS App Store apps ranked only by how much was paid for the position. Every listing is a paid placement.",
  foundingDate: "2026-08",
  slogan: "Rank is the bid.",
  contactPoint: [
    {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: "hello@iosbid.lol",
      availableLanguage: "English",
    },
  ],
  sameAs: ["https://x.com/iosbidlol"],
} as const;

export const WEBSITE = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${SITE}/#website`,
  url: SITE,
  name: "iosbid.lol",
  description:
    "A public leaderboard of iOS App Store apps ranked only by what was paid for the spot. Rank is the bid, nothing else.",
  inLanguage: "en-US",
  publisher: { "@id": `${SITE}/#organization` },
  copyrightHolder: { "@id": `${SITE}/#organization` },
  // Every listing is paid placement. Saying so in the markup is the honest
  // counterpart to the disclosure line rendered above the board.
  isAccessibleForFree: true,
  // No `potentialAction`. Google removed the sitelinks search box in 2024 and
  // there is no /search?q= that filters this board, so a SearchAction would be
  // a false claim.
} as const;
