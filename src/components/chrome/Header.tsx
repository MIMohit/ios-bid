import { toggleTheme } from "~/lib/theme";

type BoardWindow = "all" | "today";

type Props = {
  /** Which board is showing, so the switch can mark the current one. */
  window: BoardWindow;
  /**
   * Route-aware href for the other window. A category board keeps its slug when
   * it switches, so only the route knows the answer.
   */
  hrefFor: (window: BoardWindow) => string;
};

/**
 * The sticky glass header. One of exactly two blurred surfaces on the site; the
 * material lives in glass.css and this file is only its contents.
 *
 * No sign-in, no account menu, no avatar. There is no identity on this site to
 * put in the top right corner.
 */
export function Header({ window, hrefFor }: Props) {
  return (
    <header className="chrome">
      <div className="page chrome-in">
        <a className="wordmark" href="/">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <rect x="1" y="11" width="4" height="6" rx="1.4" fill="currentColor" opacity=".45" />
            <rect x="7" y="7" width="4" height="10" rx="1.4" fill="currentColor" opacity=".72" />
            <rect x="13" y="2" width="4" height="15" rx="1.4" fill="var(--accent)" />
          </svg>
          iosrank.lol
        </a>

        {/*
          Two links, not a tab control. /today is a crawlable URL with its own
          canonical and its own title, so switching boards is navigation and has
          to survive JavaScript being off and the back button being pressed.
        */}
        <div className="seg">
          <a href={hrefFor("all")} aria-current={window === "all" ? "page" : undefined}>
            <span className="dot" />
            All-time
          </a>
          <a href={hrefFor("today")} aria-current={window === "today" ? "page" : undefined}>
            <span className="dot" />
            Today
          </a>
        </div>

        <nav>
          <a href="/">Leaderboard</a>
          <a href="/categories">Categories</a>
          <a href="/about">About</a>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

/**
 * The theme toggle.
 *
 * `<html data-theme>` is the single source of truth: the blocking script in
 * __root.tsx stamps it before first paint and toggleTheme reads it back on
 * click. Both icons are always in the markup and CSS shows one, so nothing here
 * reads the theme during render and there is no hydration mismatch to guard
 * against.
 *
 * The whole switch, including the circular reveal and the storage key the
 * blocking script also reads, lives in ~/lib/theme.ts. This is only the control.
 */
function ThemeToggle() {
  return (
    <button
      type="button"
      className="theme-btn"
      aria-label="Switch theme"
      onClick={() => toggleTheme()}
    >
      <svg
        className="theme-moon"
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M13.5 9.6A5.8 5.8 0 0 1 6.4 2.5a5.8 5.8 0 1 0 7.1 7.1Z" />
      </svg>
      <svg
        className="theme-sun"
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="8" cy="8" r="3.1" />
        <path d="M8 1.4v1.6M8 13v1.6M14.6 8H13M3 8H1.4M12.7 3.3l-1.1 1.1M4.4 11.6l-1.1 1.1M12.7 12.7l-1.1-1.1M4.4 4.4 3.3 3.3" />
      </svg>
    </button>
  );
}
