/**
 * The theme contract. The blocking script in __root.tsx and the toggle button
 * both read this key, so it is defined exactly once.
 */
export const THEME_STORAGE_KEY = "iosbid-theme";

export type Theme = "dark" | "light";

/**
 * Runs synchronously in <head>, before first paint, so the page never flashes
 * the wrong theme. Stored preference wins; with none, follow the system. Kept
 * as a string because it has to execute before React exists.
 */
export const THEME_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var s=localStorage.getItem(k);var t=(s==="dark"||s==="light")?s:(window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark");document.documentElement.setAttribute("data-theme",t);}catch(e){document.documentElement.setAttribute("data-theme","dark");}})();`;
