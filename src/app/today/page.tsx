import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Board } from "@/components/Board";
import { touchPresence } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Today" };

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await touchPresence();
  const { page } = await searchParams;

  return (
    <>
      <Header window="today" categorySlug="all" />
      <main>
        <Board window="today" categorySlug="all" page={page ? Number(page) : 1} />
      </main>
      <Footer />
    </>
  );
}
