import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Board } from "@/components/Board";
import { getCategory } from "@/lib/categories";
import { touchPresence } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = getCategory(slug);
  return { title: category ? `${category.name} apps — Today` : "Category" };
}

export default async function CategoryTodayPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  await touchPresence();
  const { slug } = await params;
  if (!getCategory(slug)) notFound();
  const { page } = await searchParams;

  return (
    <>
      <Header window="today" categorySlug={slug} />
      <main>
        <Board window="today" categorySlug={slug} page={page ? Number(page) : 1} />
      </main>
      <Footer />
    </>
  );
}
