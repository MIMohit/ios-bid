/**
 * The theme contract. The blocking script in __root.tsx and the toggle button
 * both read this key, so it is defined exactly once.
 */
export const THEME_STORAGE_KEY = "iosrank-theme";

export type Theme = "dark" | "light";

/**
 * Runs synchronously in <head>, before first paint, so the page never flashes
 * the wrong theme. Stored preference wins; with none, follow the system. Kept
 * as a string because it has to execute before React exists.
 */
export const THEME_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var s=localStorage.getItem(k);var t=(s==="dark"||s==="light")?s:(window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark");document.documentElement.setAttribute("data-theme",t);}catch(e){document.documentElement.setAttribute("data-theme","dark");}})();`;

/**
 * The theme a transition is on its way to, while one is in flight.
 *
 * `startViewTransition` calls its callback asynchronously, so two presses inside
 * one frame both read a `data-theme` that has not changed yet, both resolve to
 * the same value, and the second press is a silent no-op. Remembering what is
 * already committed is what makes a double press land where a double press
 * should. Cleared once the attribute agrees with it.
 */
let pending: Theme | null = null;

/**
 * Flip the theme, revealing the new one with a circle from the top right corner.
 *
 * `<html data-theme>` is the single source of truth: the blocking script above
 * stamps it before first paint and this reads it back. Nothing here reads the
 * theme during React's render, so there is no hydration mismatch to guard.
 *
 * The reveal is a view transition rather than a CSS transition on the tokens
 * because a token swap animates every colour on the page independently, which
 * is fifty rows of text cross-fading through grey. A view transition paints two
 * static snapshots and clips one of them, so the cost is one composited circle
 * regardless of how much page is behind it.
 *
 * The circle itself is entirely in app.css, under `theme-reveal`. It grows from
 * the viewport's top right corner rather than from the toggle's rect, because
 * the header sits in a 1200px column centred in the page and on a wide screen a
 * circle grown from the button reads as starting from the middle of the screen.
 * Declaring it in CSS is also what stops the transition ending before the wipe
 * does; see the note there. Nothing about the geometry needs measuring, so
 * nothing about it is here.
 *
 * Two ways out, and both still change the theme: a viewer who asked for less
 * motion, or a browser without view transitions. The theme is the feature; the
 * circle is not.
 */
export function toggleTheme(): void {
  const root = document.documentElement;
  const current = pending ?? (root.getAttribute("data-theme") === "light" ? "light" : "dark");
  const next: Theme = current === "light" ? "dark" : "light";
  pending = next;

  const apply = () => {
    root.setAttribute("data-theme", next);
    if (pending === next) pending = null;
    // Private browsing and blocked storage both throw here. The theme still
    // applies for this page view, it just does not persist.
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  };

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced || typeof document.startViewTransition !== "function") {
    apply();
    return;
  }

  // `ready` rejects if a second press starts a transition before this one has
  // captured. The theme has already flipped by then, so there is nothing to
  // recover and nothing to report.
  void document.startViewTransition(apply).ready.catch(() => {
    // ignore
  });
}
