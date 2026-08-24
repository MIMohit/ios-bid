/**
 * App Store genres, keyed by Apple's primaryGenreId. Because every listing is
 * a real App Store app, categories are assigned from Apple's own metadata
 * rather than guessed — no AI classification, no manual correction queue.
 */
export type Category = { slug: string; name: string; short: string; emoji: string };

export const CATEGORIES: Category[] = [
  { slug: "games", name: "Games", short: "Games", emoji: "🎮" },
  { slug: "productivity", name: "Productivity", short: "Productivity", emoji: "⚡" },
  { slug: "developer-tools", name: "Developer Tools", short: "Developer", emoji: "⌘" },
  { slug: "health-fitness", name: "Health & Fitness", short: "Health", emoji: "❤️" },
  { slug: "photo-video", name: "Photo & Video", short: "Photo", emoji: "📷" },
  { slug: "social-networking", name: "Social Networking", short: "Social", emoji: "💬" },
  { slug: "finance", name: "Finance", short: "Finance", emoji: "💳" },
  { slug: "education", name: "Education", short: "Education", emoji: "🎓" },
  { slug: "utilities", name: "Utilities", short: "Utilities", emoji: "🔧" },
  { slug: "entertainment", name: "Entertainment", short: "Entertainment", emoji: "🍿" },
  { slug: "lifestyle", name: "Lifestyle", short: "Lifestyle", emoji: "🌿" },
  { slug: "business", name: "Business", short: "Business", emoji: "💼" },
  { slug: "graphics-design", name: "Graphics & Design", short: "Design", emoji: "🎨" },
  { slug: "music", name: "Music", short: "Music", emoji: "🎧" },
  { slug: "travel", name: "Travel", short: "Travel", emoji: "✈️" },
  { slug: "shopping", name: "Shopping", short: "Shopping", emoji: "🛍️" },
  { slug: "food-drink", name: "Food & Drink", short: "Food", emoji: "🍜" },
  { slug: "news", name: "News", short: "News", emoji: "📰" },
  { slug: "sports", name: "Sports", short: "Sports", emoji: "🏀" },
  { slug: "navigation", name: "Navigation", short: "Navigation", emoji: "🧭" },
  { slug: "reference", name: "Reference", short: "Reference", emoji: "📚" },
  { slug: "books", name: "Books", short: "Books", emoji: "📖" },
  { slug: "medical", name: "Medical", short: "Medical", emoji: "🩺" },
  { slug: "weather", name: "Weather", short: "Weather", emoji: "🌤️" },
  { slug: "magazines-newspapers", name: "Magazines & Newspapers", short: "Magazines", emoji: "🗞️" },
  { slug: "stickers", name: "Stickers", short: "Stickers", emoji: "✨" },
  { slug: "other", name: "Other", short: "Other", emoji: "📦" },
];

const BY_GENRE_ID: Record<string, string> = {
  "6014": "games",
  "6007": "productivity",
  "6026": "developer-tools",
  "6013": "health-fitness",
  "6008": "photo-video",
  "6005": "social-networking",
  "6015": "finance",
  "6017": "education",
  "6002": "utilities",
  "6016": "entertainment",
  "6012": "lifestyle",
  "6000": "business",
  "6027": "graphics-design",
  "6011": "music",
  "6003": "travel",
  "6024": "shopping",
  "6023": "food-drink",
  "6009": "news",
  "6004": "sports",
  "6010": "navigation",
  "6006": "reference",
  "6018": "books",
  "6020": "medical",
  "6001": "weather",
  "6021": "magazines-newspapers",
  "6025": "stickers",
};

const BY_NAME = new Map(CATEGORIES.map((c) => [c.name.toLowerCase(), c.slug]));

export function categorySlugFor(genreId?: string | number, genreName?: string): string {
  if (genreId != null && BY_GENRE_ID[String(genreId)]) return BY_GENRE_ID[String(genreId)];
  if (genreName && BY_NAME.has(genreName.toLowerCase())) return BY_NAME.get(genreName.toLowerCase())!;
  return "other";
}

export function getCategory(slug: string): Category | undefined {
  return CATEGORIES.find((c) => c.slug === slug);
}
