import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { MIN_BID, MAX_BID, TOP_STEP, RAISE_STEP } from "@/lib/bidding";

export const metadata: Metadata = { title: "Rules" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-sm font-bold tracking-tight">{title}</h2>
      <div className="mt-2 space-y-2.5 text-[13px] leading-relaxed text-muted">{children}</div>
    </section>
  );
}

export default function RulesPage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-xl px-4 pb-16 pt-8">
        <h1 className="text-2xl font-bold tracking-tight">Rules</h1>
        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          iosbid is a public leaderboard for iOS apps. There are no ads, no App Store algorithm, and no revenue
          share. You pay to stand above everyone else. Rank is the bid — nothing else.
        </p>

        <Section title="How ranking works">
          <p>
            New listings are whole US dollars, ${MIN_BID} minimum, ${MAX_BID.toLocaleString()} maximum, $1 at a
            time. Bids already on the board keep their amount until they raise or get outranked.
          </p>
          <p>
            Taking #1 costs at least ${TOP_STEP} more than the current top bid. Paying less still puts you on the
            board at whatever rank that bid can take. Equal bids stay in the order they were placed — the older
            bid keeps the higher rank.
          </p>
          <p>
            Today&apos;s board ranks what you spent in the last 24 hours. Each payment counts for a day from when
            you paid, then drops off. The same payment also adds to your all-time bid. Taking today&apos;s #1
            costs at least ${TOP_STEP} more than the most anyone else spent in that window.
          </p>
          <p>
            Enter the same app again to raise that listing to any rank. The new bid must be at least $
            {RAISE_STEP} above your current bid; you only pay the difference. Someone else cannot take your rank
            by paying that difference.
          </p>
        </Section>

        <Section title="What you can list">
          <p>Any app on the iOS App Store. Paste its App Store link, or just search by name.</p>
          <p>
            Listings are keyed by Apple&apos;s app id, so different apps never share a bid, and tracking or
            affiliate query strings are ignored — only the link Apple actually serves the app from matters.
          </p>
          <p>
            Link shorteners are followed to whatever App Store page they point to. Non-App-Store links, and apps
            that don&apos;t run on iPhone or iPad, are not accepted.
          </p>
        </Section>

        <Section title="Categories">
          <p>
            Categories come directly from the primary genre Apple assigns each app — no manual submission, no AI
            guesswork.
          </p>
        </Section>

        <Section title="After you pay">
          <p>Your listing is public immediately. Clicks go straight to the app&apos;s App Store page.</p>
          <p>A completed payment is what claims the rank. Bids never expire and are never refunded.</p>
        </Section>
      </main>
      <Footer />
    </>
  );
}
