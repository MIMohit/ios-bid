import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CATEGORIES } from "@/lib/categories";
import { prisma } from "@/lib/db";

export const metadata: Metadata = { title: "Categories" };
export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const counts = await prisma.listing.groupBy({
    by: ["categorySlug"],
    where: { totalBid: { gt: 0 } },
    _count: { _all: true },
  });
  const byCategory = new Map(counts.map((c) => [c.categorySlug, c._count._all]));

  return (
    <>
      <Header />
      <main className="mx-auto max-w-2xl px-4 pb-16 pt-8">
        <h1 className="text-2xl font-bold tracking-tight">Categories</h1>
        <p className="mt-1 text-sm text-muted">
          Every listing is a real iOS app — categories come straight from the App Store.
        </p>
        <ul className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {CATEGORIES.map((c) => (
            <li key={c.slug}>
              <Link
                href={`/category/${c.slug}`}
                className="flex items-center gap-2.5 rounded-2xl border border-line bg-surface p-3 shadow-card transition hover:border-line-strong hover:-translate-y-0.5"
              >
                <span className="text-xl" aria-hidden>{c.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{c.name}</span>
                  <span className="tnum block text-xs text-faint">{byCategory.get(c.slug) ?? 0} apps</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <Footer />
    </>
  );
}
