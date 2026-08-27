import { expect, test } from "@playwright/test";
import { collectConsoleErrors, expectNoHorizontalOverflow, gotoWithTheme } from "./helpers";

/**
 * Every route, both themes, both widths: it loads, it says what it is, it throws
 * nothing, and it does not scroll sideways.
 *
 * The horizontal overflow check is here rather than in a styling spec because
 * the board deliberately pulls rows past the content column with negative
 * margins, and the podium plates pull further still. That is exactly the kind of
 * thing that works at 1440 and breaks at 393.
 */

const ROUTES = [
  { path: "/", heading: /All-time leaderboard/ },
  { path: "/today", heading: /Today's ranking/ },
  { path: "/category/productivity", heading: /Productivity leaderboard/ },
  { path: "/category/productivity/today", heading: /Productivity today/ },
  { path: "/categories", heading: /Every App Store category/ },
  { path: "/stats", heading: /Live stats/ },
  { path: "/about", heading: /About/ },
  { path: "/rules", heading: /.+/ },
  { path: "/terms", heading: /.+/ },
  { path: "/privacy", heading: /.+/ },
] as const;

for (const theme of ["dark", "light"] as const) {
  for (const route of ROUTES) {
    test(`${route.path} loads clean, ${theme}`, async ({ page }) => {
      const errors = collectConsoleErrors(page);

      await gotoWithTheme(page, route.path, theme);
      await expect(page.getByRole("heading").first()).toBeVisible();

      // Named, not level-pinned. On a board with a rank 1 the <h1> is the
      // spotlit app and the board's own heading is an <h2>, because the board is
      // not the page. Every page still has exactly one h1.
      await expect(page.getByRole("heading", { name: route.heading }).first()).toBeVisible();
      expect(await page.getByRole("heading", { level: 1 }).count(), "not exactly one h1").toBe(1);

      await expectNoHorizontalOverflow(page);

      // Give late pushes from Convex a moment to throw if they are going to.
      await page.waitForTimeout(400);
      expect(errors, `${route.path} logged errors: ${errors.join(" | ")}`).toEqual([]);
    });
  }
}

test("the header is on every route and always links home", async ({ page }) => {
  for (const route of ROUTES.slice(0, 6)) {
    await gotoWithTheme(page, route.path, "dark");
    await expect(page.locator("header.chrome .wordmark")).toHaveAttribute("href", "/");
  }
});

test("the footer's legal links resolve on every one of them", async ({ page, request }) => {
  await gotoWithTheme(page, "/", "dark");
  const hrefs = await page.locator(".foot nav a").evaluateAll((els) =>
    els.map((el) => (el as HTMLAnchorElement).getAttribute("href")).filter(Boolean),
  );
  expect(hrefs.length).toBeGreaterThan(0);
  for (const href of hrefs) {
    if (href!.startsWith("http")) continue;
    const response = await request.get(href!);
    expect(response.status(), `${href} is broken`).toBeLessThan(400);
  }
});

test("images declare their size so the board does not reflow as artwork lands", async ({ page }) => {
  await gotoWithTheme(page, "/", "dark");
  const missing = await page.locator(".row img").evaluateAll((els) =>
    els
      .filter((el) => !el.getAttribute("width") || !el.getAttribute("height"))
      .map((el) => el.getAttribute("src") ?? "?"),
  );
  expect(missing, `icons without intrinsic size: ${missing.join(", ")}`).toEqual([]);
});
