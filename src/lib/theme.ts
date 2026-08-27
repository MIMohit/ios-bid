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

/** How long the reveal takes, and on what curve. */
const REVEAL_MS = 520;
const REVEAL_EASING = "cubic-bezier(0.4, 0, 0.2, 1)";

/**
 * Flip the theme, revealing the new one with a circle grown from `origin`.
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
 * `origin` is the button's own rect, read at click time rather than assumed to
 * be the top right corner, so the circle still starts under the finger when the
 * header reflows or the button moves. The radius reaches the furthest viewport
 * corner from that point, which is what guarantees the circle clears the screen
 * instead of stopping short of it.
 *
 * Three ways out, and all of them still change the theme: no origin to grow
 * from, a viewer who asked for less motion, or a browser without view
 * transitions. The theme is the feature; the circle is not.
 */
export function toggleTheme(origin: DOMRect | null): void {
  const root = document.documentElement;
  const next: Theme = root.getAttribute("data-theme") === "light" ? "dark" : "light";

  const apply = () => {
    root.setAttribute("data-theme", next);
    // Private browsing and blocked storage both throw here. The theme still
    // applies for this page view, it just does not persist.
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  };

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (origin === null || reduced || typeof document.startViewTransition !== "function") {
    apply();
    return;
  }

  const x = origin.left + origin.width / 2;
  const y = origin.top + origin.height / 2;
  const radius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );

  const transition = document.startViewTransition(apply);

  // `ready` rejects if a second press starts a transition before this one has
  // captured. The theme has already flipped by then, so there is nothing to
  // recover and nothing to report.
  void transition.ready
    .then(() => {
      root.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${radius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: REVEAL_MS,
          easing: REVEAL_EASING,
          pseudoElement: "::view-transition-new(root)",
        },
      );
    })
    .catch(() => {
      // ignore
    });
}
