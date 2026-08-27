/**
 * The two static structured-data nodes that every page carries. Board-scoped
 * nodes (ItemList, MobileApplication, BreadcrumbList, FAQPage) live in
 * jsonld-board.ts because they need live data.
 */
const SITE = "https://iosrank.lol";

export const ORGANIZATION = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${SITE}/#organization`,
  name: "iosrank.lol",
  alternateName: "iosrank",
  url: SITE,
  logo: {
    "@type": "ImageObject",
    "@id": `${SITE}/#logo`,
    url: `${SITE}/icon-512.png`,
    width: 512,
    height: 512,
    caption: "iosrank.lol",
  },
  image: { "@id": `${SITE}/#logo` },
  description:
    "iosrank.lol runs a public leaderboard of iOS App Store apps ranked only by how much was paid for the position. Every listing is a paid placement.",
  foundingDate: "2026-08",
  slogan: "Rank is the bid.",
  // No `contactPoint` and no `sameAs`. Both were here, asserting
  // hello@iosrank.lol and https://x.com/iosranklol on every page, and neither the
  // mailbox nor the handle has been verified to exist. A support address that
  // bounces is a false claim in markup on a site that takes money with no
  // accounts, and a sameAs pointing at nothing is a dead entity link. Restore
  // both the day the mailbox accepts mail and the handle is registered.
} as const;

export const WEBSITE = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${SITE}/#website`,
  url: SITE,
  name: "iosrank.lol",
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
