import { expect, test } from "@playwright/test";
import { THEME_STORAGE_KEY } from "../src/lib/theme";
import { channelsOf, contrastOf, gotoWithTheme } from "./helpers";

/**
 * The theme switch, and the light theme it switches into.
 *
 * The light theme is the half that shipped broken, so most of what is here is a
 * regression suite rather than a feature test. Each case names the defect it
 * exists to catch.
 */

test("the theme is stamped before first paint, so there is no flash", async ({ page }) => {
  // The blocking script in __root.tsx is the only thing standing between a dark
  // preference and a white flash. If it stops running, data-theme arrives after
  // hydration and this catches it, because domcontentloaded is before React.
  await page.addInitScript(
    ([key]) => {
      try {
        localStorage.setItem(key, "dark");
      } catch {
        // ignore
      }
    },
    [THEME_STORAGE_KEY] as const,
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("the toggle flips the theme, persists it, and reveals it with a circle from its own corner", async ({
  page,
}) => {
  await gotoWithTheme(page, "/", "dark");

  const result = await page.evaluate(async () => {
    const button = document.querySelector<HTMLElement>(".theme-btn")!;
    const rect = button.getBoundingClientRect();
    button.click();
    await new Promise((r) => setTimeout(r, 90));

    // The KEYFRAMES, not the live playState. Whether the animation is still
    // running at some arbitrary sample point is a race with the clock and says
    // nothing about the product; what it is animating, from where, and how far
    // is the whole contract.
    const animation = document.documentElement
      .getAnimations({ subtree: true })
      .find(
        (a) =>
          (a.effect as KeyframeEffect | undefined)?.pseudoElement ===
          "::view-transition-new(root)",
      );
    const effect = animation?.effect as KeyframeEffect | undefined;
    const frames = (effect?.getKeyframes() ?? []).map((f) => String(f.clipPath ?? ""));
    const timing = effect?.getTiming();

    await new Promise((r) => setTimeout(r, 700));
    return {
      frames,
      duration: typeof timing?.duration === "number" ? timing.duration : 0,
      found: animation !== undefined,
      origin: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      viewport: { w: window.innerWidth, h: window.innerHeight },
      theme: document.documentElement.getAttribute("data-theme"),
      stored: localStorage.getItem("iosrank-theme"),
    };
  });

  expect(result.theme).toBe("light");
  expect(result.stored).toBe("light");
  expect(result.found, "no animation on ::view-transition-new(root)").toBe(true);
  expect(result.duration, "the reveal is instant or endless").toBeGreaterThan(200);

  expect(result.frames.length, `unexpected keyframes: ${result.frames.join(" -> ")}`).toBe(2);
  const [from, to] = result.frames;
  expect(from, "the reveal does not start from nothing").toMatch(/^circle\(0px at /);
  expect(to, "the reveal is not a circle").toMatch(/^circle\(/);

  // It grows from the button, not from a hardcoded corner, and it reaches the
  // furthest corner of the viewport so it always clears the screen.
  const at = to!.match(/at\s+([\d.]+)px\s+([\d.]+)px/);
  expect(at, `no origin in clip-path: ${to}`).not.toBeNull();
  expect(Math.abs(Number(at![1]) - result.origin.x)).toBeLessThan(2);
  expect(Math.abs(Number(at![2]) - result.origin.y)).toBeLessThan(2);

  const radius = Number(to!.match(/circle\(([\d.]+)px/)![1]);
  const needed = Math.hypot(
    Math.max(result.origin.x, result.viewport.w - result.origin.x),
    Math.max(result.origin.y, result.viewport.h - result.origin.y),
  );
  expect(radius, "the circle stops short of the viewport corner").toBeGreaterThanOrEqual(needed - 1);
});

test("a rapid double press lands on the right theme and throws nothing", async ({ page }) => {
  await gotoWithTheme(page, "/", "dark");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.evaluate(async () => {
    const button = document.querySelector<HTMLElement>(".theme-btn")!;
    button.click();
    button.click();
    await new Promise((r) => setTimeout(r, 900));
  });

  // Two flips from dark is dark. The interesting part is that the second press
  // rejects the first transition's ready promise, which must not surface.
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(errors).toEqual([]);
});

test("reduced motion skips the reveal but still changes the theme", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await gotoWithTheme(page, "/", "dark");

  const result = await page.evaluate(async () => {
    document.querySelector<HTMLElement>(".theme-btn")!.click();
    await new Promise((r) => setTimeout(r, 120));
    const running = document.documentElement
      .getAnimations({ subtree: true })
      .filter((a) => (a.effect as KeyframeEffect | undefined)?.pseudoElement?.includes("view-transition"))
      .filter((a) => a.playState === "running").length;
    return { running, theme: document.documentElement.getAttribute("data-theme") };
  });

  expect(result.theme, "reduced motion swallowed the theme change itself").toBe("light");
  expect(result.running, "a view transition ran under prefers-reduced-motion").toBe(0);
  await context.close();
});

test.describe("light theme regressions", () => {
  test("the flat bid bar reads the page, it is not a grey slab", async ({ page }) => {
    // THE bug. With no rank 1 there is no spotlight band, and the bar used to
    // land on a white page still pinned to white text over a dark fill.
    await gotoWithTheme(page, "/today", "light");
    const bar = page.locator(".bidwrap.is-flat .bidbar");
    test.skip((await bar.count()) === 0, "/today has a rank 1, so no flat bar here");

    const label = bar.locator(".hero-label");
    expect(await contrastOf(label), "the flat bar's heading is unreadable").toBeGreaterThanOrEqual(4.5);

    const rule = bar.locator(".hero-rule");
    expect(await contrastOf(rule), "the flat bar's helper text is unreadable").toBeGreaterThanOrEqual(4.5);

    // The field is a well cut into a light surface, not a black hole.
    const field = await bar.locator(".field").first().evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(channelsOf(field).sum, `the input field is dark on a light page: ${field}`).toBeGreaterThan(600);
  });

  test("the bar over the band stays pinned white in both themes", async ({ page }) => {
    await gotoWithTheme(page, "/", "light");
    const bar = page.locator(".spotlight .bidbar");
    test.skip((await bar.count()) === 0, "no spotlight band on this board");

    const colour = await bar
      .locator(".hero-label")
      .evaluate((el) => getComputedStyle(el).color);
    expect(colour, "the bar over the dark band stopped pinning white").toBe("rgb(255, 255, 255)");
  });

  for (const [path, where] of [
    ["/", "over the band"],
    ["/today", "flat on the page"],
  ] as const) {
    test(`the bid bar's error line is readable ${where}, light`, async ({ page }) => {
      // The error explains why checkout will not proceed. It was 2.26:1 on the
      // home page, because --attention is tuned for a white page and the band
      // is near black in both themes.
      await gotoWithTheme(page, path, "light");
      const note = page.locator(".bid-note");
      test.skip((await note.count()) === 0, "no bid bar on this route");

      await note.evaluate((el) => {
        el.classList.add("is-error");
        el.textContent = "Something went wrong. Nothing has been charged.";
      });
      expect(await contrastOf(note)).toBeGreaterThanOrEqual(4.5);
    });
  }

  test("the light label ramp is three distinct steps, not two", async ({ page }) => {
    // Apple's alphas copied across left --label-2 and --label-3 identical, which
    // collapsed every row's three lines into two.
    await gotoWithTheme(page, "/", "light");
    const ramp = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return [1, 2, 3, 4].map((n) => cs.getPropertyValue(n === 1 ? "--label" : `--label-${n}`).trim());
    });
    expect(new Set(ramp).size, `the light ramp has duplicate steps: ${ramp.join(" | ")}`).toBe(4);
  });

  test("meta text clears AA on every surface it lands on, light and dark", async ({ page }) => {
    for (const theme of ["light", "dark"] as const) {
      await gotoWithTheme(page, "/", theme);
      // The meta line on a podium plate is the worst case: the smallest type on
      // the busiest surface.
      const meta = page.locator(".row.is-t2 .meta");
      if ((await meta.count()) === 0) continue;
      expect(await contrastOf(meta), `${theme}: meta on a plate`).toBeGreaterThanOrEqual(4.5);

      await page.locator(".row.is-t2").hover();
      await page.waitForTimeout(150);
      expect(await contrastOf(meta), `${theme}: meta on a hovered plate`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
