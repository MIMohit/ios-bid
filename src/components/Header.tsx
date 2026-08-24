import Link from "next/link";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

/** The All-time / Today switch keeps whichever category you were browsing. */
function BoardSwitch({ window: win, categorySlug }: { window: "all" | "today"; categorySlug?: string | null }) {
  const base = categorySlug && categorySlug !== "all" ? `/category/${categorySlug}` : "";
  const tabs = [
    { key: "all" as const, label: "All-time", href: base || "/" },
    { key: "today" as const, label: "Today", href: `${base}/today` },
  ];

  return (
    <div className="flex items-center gap-0.5 rounded-full bg-surface-2 p-0.5 ring-1 ring-line">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={win === t.key ? "page" : undefined}
          className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
            win === t.key
              ? "bg-surface text-ink shadow-sm ring-1 ring-line"
              : "text-muted hover:text-ink"
          }`}
        >
          {t.key === "today" && <span className="mr-1 text-[9px] text-accent">●</span>}
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export function Header({
  window: win = "all",
  categorySlug,
}: {
  window?: "all" | "today";
  categorySlug?: string | null;
}) {
  return (
    <header className="frost sticky top-0 z-40 border-b border-line">
      <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
        <Logo />
        <div className="hidden sm:block">
          <BoardSwitch window={win} categorySlug={categorySlug} />
        </div>
        <nav className="ml-auto flex items-center gap-1 text-[13px] text-muted">
          <Link href="/" className="rounded-full px-2.5 py-1.5 transition hover:bg-surface-2 hover:text-ink">
            Board
          </Link>
          <Link href="/categories" className="rounded-full px-2.5 py-1.5 transition hover:bg-surface-2 hover:text-ink">
            Categories
          </Link>
          <Link href="/rules" className="hidden rounded-full px-2.5 py-1.5 transition hover:bg-surface-2 hover:text-ink sm:block">
            Rules
          </Link>
          <Link href="/about" className="rounded-full px-2.5 py-1.5 transition hover:bg-surface-2 hover:text-ink">
            About
          </Link>
          <ThemeToggle />
        </nav>
      </div>
      <div className="mx-auto max-w-3xl px-4 pb-2 sm:hidden">
        <BoardSwitch window={win} categorySlug={categorySlug} />
      </div>
    </header>
  );
}
