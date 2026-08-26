/**
 * The structured data that needs live data: the board as an ItemList of real
 * App Store apps, the breadcrumb trail, the rules FAQ and the category index.
 *
 * The two static nodes every page carries (Organization, WebSite) live in
 * jsonld.ts and are emitted once by __root.tsx.
 *
 * Nothing here invents a fact. Every value is either Apple's own metadata or a
 * number that was paid, which is the whole reason this markup is safe to ship on
 * a board of paid placements.
 */
import { SITE, absolute, type BoardPage, type Crumb } from "./seo";
import { schemaCategory } from "./schema-category";

type Row = BoardPage["rows"][number];

/**
 * One listing.
 *
 * `url` is our own `/go/:slug`, because there is no detail page and the row's
 * only outbound link is that redirect. `aggregateRating` is omitted rather than
 * zeroed when Apple has no rating: a rating of 0 out of 5 is a claim we would be
 * making about somebody else's app.
 */
function mobileApplication(row: Row) {
  return {
    "@type": "MobileApplication",
    "@id": `${SITE}/#app-${row.slug}`,
    name: row.name,
    url: `${SITE}/go/${row.slug}`,
    applicationCategory: schemaCategory(row.categorySlug),
    applicationSubCategory: row.genre,
    operatingSystem: "iOS",
    image: row.iconUrl,
    author: { "@type": "Organization", name: row.developer },
    ...(row.subtitle ? { description: row.subtitle } : {}),
    offers: {
      "@type": "Offer",
      price: row.price,
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    },
    ...(row.rating && row.ratingCount > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: row.rating,
            ratingCount: row.ratingCount,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  };
}

/**
 * The board.
 *
 * `position` is the listing's real rank, not its index on the page, so page 7
 * continues at 301 instead of restarting at 1. That is what makes a deep page
 * legible to a crawler as a continuation rather than as a competing list.
 */
export function boardItemList(
  rows: readonly Row[],
  { url, name }: { url: string; name: string },
) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${url}#board`,
    name,
    url,
    numberOfItems: rows.length,
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    itemListElement: rows.map((row) => ({
      "@type": "ListItem",
      position: row.rank,
      item: mobileApplication(row),
    })),
  };
}

export function breadcrumbList(crumbs: readonly Crumb[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: absolute(crumb.path),
    })),
  };
}

/** /rules. The questions are the ones people actually ask before they pay. */
export function faqPage(entries: readonly { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${SITE}/rules#faq`,
    mainEntity: entries.map((entry) => ({
      "@type": "Question",
      name: entry.q,
      acceptedAnswer: { "@type": "Answer", text: entry.a },
    })),
  };
}

/** /categories. A page whose content is a set of links to other pages. */
export function collectionPage({
  path,
  name,
  description,
  links,
}: {
  path: string;
  name: string;
  description: string;
  links: readonly { name: string; path: string }[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${absolute(path)}#collection`,
    url: absolute(path),
    name,
    description,
    isPartOf: { "@id": `${SITE}/#website` },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: links.length,
      itemListElement: links.map((link, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: link.name,
        url: absolute(link.path),
      })),
    },
  };
}
