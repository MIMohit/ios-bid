import Link from "next/link";

export function Footer() {
  return (
    <footer className="mx-auto mt-16 max-w-3xl px-4 pb-12">
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-t border-line pt-6 text-xs text-faint">
        <span>iosbid.lol — the pay-to-rank board for iOS apps</span>
        <span aria-hidden>·</span>
        <Link href="/rules" className="transition hover:text-ink">Rules</Link>
        <span aria-hidden>·</span>
        <Link href="/about" className="transition hover:text-ink">About</Link>
        <span aria-hidden>·</span>
        <Link href="/categories" className="transition hover:text-ink">Categories</Link>
      </div>
      <p className="mt-3 text-center text-[11px] text-faint">
        App metadata, icons, and screenshots come from the Apple App Store. Not affiliated with Apple Inc.
      </p>
    </footer>
  );
}
