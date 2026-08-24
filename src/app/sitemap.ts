import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { CATEGORIES } from "@/lib/categories";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const listings = await prisma.listing.findMany({ select: { slug: true, updatedAt: true } });

  return [
    { url: base, changeFrequency: "always", priority: 1 },
    { url: `${base}/today`, changeFrequency: "always", priority: 0.9 },
    { url: `${base}/categories`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${base}/rules`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/about`, changeFrequency: "weekly", priority: 0.3 },
    ...CATEGORIES.map((c) => ({
      url: `${base}/category/${c.slug}`,
      changeFrequency: "hourly" as const,
      priority: 0.6,
    })),
    ...listings.map((l) => ({
      url: `${base}/app/${l.slug}`,
      lastModified: l.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
  ];
}
