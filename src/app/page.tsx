import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Board } from "@/components/Board";
import { touchPresence } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await touchPresence();
  const { page } = await searchParams;

  return (
    <>
      <Header window="all" categorySlug="all" />
      <main>
        <Board window="all" categorySlug="all" page={page ? Number(page) : 1} />
      </main>
      <Footer />
    </>
  );
}
