import { expect, type Page, type Locator } from "@playwright/test";
import { THEME_STORAGE_KEY, type Theme } from "../src/lib/theme";

/**
 * Shared helpers. The theme storage key is imported from the app rather than
 * retyped, so a rename breaks the build here instead of silently making every
 * theme assertion test the default theme twice.
 */

/**
 * Load a route with the theme already chosen, before first paint.
 *
 * The blocking script in __root.tsx reads localStorage synchronously, so seeding
 * it through an init script is the only way to assert on a theme without
 * watching the page repaint into it.
 */
export async function gotoWithTheme(page: Page, path: string, theme: Theme): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        // Private browsing. The test then measures the default theme, and the
        // assertion that names a theme will say so.
      }
    },
    [THEME_STORAGE_KEY, theme] as const,
  );
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}

/** WCAG 2 relative luminance of an `rgb()` / `rgba()` string, composited on white. */
function luminance(rgb: readonly [number, number, number]): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

function parseRgb(value: string): [number, number, number, number] {
  const parts = value.match(/[\d.]+/g);
  if (!parts || parts.length < 3) throw new Error(`unparseable colour: ${value}`);
  return [Number(parts[0]), Number(parts[1]), Number(parts[2]), parts[3] ? Number(parts[3]) : 1];
}

function composite(
  fg: readonly [number, number, number, number],
  bg: readonly [number, number, number],
): [number, number, number] {
  return [
    fg[0] * fg[3] + bg[0] * (1 - fg[3]),
    fg[1] * fg[3] + bg[1] * (1 - fg[3]),
    fg[2] * fg[3] + bg[2] * (1 - fg[3]),
  ];
}

/**
 * Contrast ratio between an element's text colour and the first opaque
 * background behind it.
 *
 * It walks up for the background rather than reading the element's own, because
 * almost nothing on this board paints one: a row's colour comes from the page,
 * or from a podium plate, or from a hover fill, and the ratio that matters is
 * against whatever is actually behind the glyphs. Translucent layers on the way
 * up are composited in order, which is what makes a plate's tint count.
 */
export async function contrastOf(locator: Locator): Promise<number> {
  const { colour, layers } = await locator.evaluate((el) => {
    const stack: string[] = [];
    let node: Element | null = el;
    while (node) {
      const cs = getComputedStyle(node);
      const bg = cs.backgroundColor;
      const image = cs.backgroundImage;
      // A flat two-stop gradient is how the podium carries its tint, so it has
      // to be read as a layer and not skipped as decoration.
      if (image && image !== "none") {
        const stop = image.match(/rgba?\([^)]+\)/);
        if (stop) stack.push(stop[0]);
      }
      if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") stack.push(bg);
      const opaque = bg.startsWith("rgb(") || /rgba\([^)]+,\s*1\)\s*$/.test(bg);
      if (opaque) break;
      node = node.parentElement;
    }
    return { colour: getComputedStyle(el).color, layers: stack };
  });

  // Bottom-most layer first, then each translucent layer over it.
  let background: [number, number, number] = [255, 255, 255];
  for (const layer of [...layers].reverse()) {
    background = composite(parseRgb(layer), background);
  }
  const text = composite(parseRgb(colour), background);

  const a = luminance(text);
  const b = luminance(background);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** The page must never scroll sideways, at any width, on any route. */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "page scrolls horizontally").toBeLessThanOrEqual(0);
}

/** Console errors worth failing on. Analytics 404s in a local build are not. */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    // PostHog is unconfigured locally, so its CDN 404s on every page. That is
    // the local environment, not the build.
    if (/posthog|favicon|ERR_/i.test(text)) return;
    errors.push(text);
  });
  return errors;
}

/** Right edge of an element's border box, for column alignment assertions. */
export async function rightEdge(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("element has no box");
  return Math.round(box.x + box.width);
}

/**
 * The numeric channels of a computed `rgb()` / `rgba()` string.
 *
 * Exists because `noUncheckedIndexedAccess` makes every index into a regex match
 * possibly-undefined, and a colour assertion that silently reads NaN is worse
 * than no assertion.
 */
export function channelsOf(colour: string): { r: number; g: number; b: number; sum: number } {
  const parts = colour.match(/[\d.]+/g)?.map(Number) ?? [];
  const [r = 0, g = 0, b = 0] = parts;
  return { r, g, b, sum: r + g + b };
}
