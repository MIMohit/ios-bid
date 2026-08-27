import type { CategorySlug } from "@convex/lib/categories";

/**
 * App Store category slug -> schema.org applicationCategory. Google accepts only
 * a fixed enum, so genres with no exact member (Productivity, News, Weather) map
 * to the nearest legal value. Apple's real genre name still ships as
 * applicationSubCategory, so nothing is lost by the approximation.
 *
 * Keyed off CategorySlug, so adding a category without mapping it fails typecheck.
 */
export const SCHEMA_CATEGORY: Record<CategorySlug, string> = {
  "games": "GameApplication",
  "productivity": "BusinessApplication",
  "developer-tools": "DeveloperApplication",
  "health-fitness": "HealthApplication",
  "photo-video": "MultimediaApplication",
  "social-networking": "SocialNetworkingApplication",
  "finance": "FinanceApplication",
  "education": "EducationalApplication",
  "utilities": "UtilitiesApplication",
  "entertainment": "EntertainmentApplication",
  "lifestyle": "LifestyleApplication",
  "business": "BusinessApplication",
  "graphics-design": "DesignApplication",
  "music": "MultimediaApplication",
  "travel": "TravelApplication",
  "shopping": "ShoppingApplication",
  "food-drink": "LifestyleApplication",
  "news": "ReferenceApplication",
  "sports": "SportsApplication",
  "navigation": "TravelApplication",
  "reference": "ReferenceApplication",
  "books": "ReferenceApplication",
  "medical": "HealthApplication",
  "weather": "UtilitiesApplication",
  "magazines-newspapers": "ReferenceApplication",
  "stickers": "EntertainmentApplication",
  "other": "UtilitiesApplication",
};

export function schemaCategory(slug: string): string {
  return SCHEMA_CATEGORY[slug as CategorySlug] ?? "UtilitiesApplication";
}
