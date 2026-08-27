import { expect, test } from "@playwright/test";
import { TRAFFIC_DASHBOARD } from "../src/lib/analytics";
import { contrastOf, gotoWithTheme } from "./helpers";

/**
 * The header, the live line, and the window switch. Everything that is on every
 * route.
 */

test.describe("the live line", () => {
  test("is one pill, and says online then visitors then where to go", async ({ page }) => {
    await gotoWithTheme(page, "/", "dark");
    const pill = page.locator(".stats-pill");
    await expect(pill).toBeVisible();

    const shape = await pill.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        radius: parseFloat(cs.borderTopLeftRadius),
        height: el.getBoundingClientRect().height,
        background: cs.backgroundColor,
      };
    });
    expect(shape.radius).toBeGreaterThanOrEqual(shape.height / 2 - 1);
    expect(shape.background).not.toBe("rgba(0, 0, 0, 0)");

    await expect(pill).toContainText(/online/);
    await expect(pill).toContainText(/visitors since launch/);
  });

  test("puts exactly one separator between each fact and none after the live dot", async ({ page }) => {
    // A descendant combinator on `span + span` used to match the nested online
    // count, which put a stray separator between the live dot and the number.
    //
    // The separators are ::before content, so innerText cannot see them: they
    // have to be read off the pseudo-elements, one per DIRECT child of the pill
    // after the first, and none anywhere deeper.
    await gotoWithTheme(page, "/", "dark");

    const separators = await page.locator(".stats-pill").evaluate((pill) => {
      const has = (el: Element) => {
        const content = getComputedStyle(el, "::before").content;
        return content.includes("\u00b7") || content.includes("·");
      };
      const direct = Array.from(pill.children);
      return {
        onDirect: direct.map(has),
        onNested: direct.flatMap((child) => Array.from(child.querySelectorAll("*")).map(has)),
      };
    });

    expect(separators.onDirect.length, "the pill lost one of its three facts").toBe(3);
    expect(separators.onDirect[0], "a separator sits before the first fact").toBe(false);
    expect(separators.onDirect.slice(1), "a fact is missing its separator").toEqual([true, true]);
    expect(
      separators.onNested.filter(Boolean).length,
      "a nested element grew a separator, which is the bug this test exists for",
    ).toBe(0);
  });

  test("see stats goes to the published PostHog dashboard, in its own tab", async ({ page }) => {
    await gotoWithTheme(page, "/", "dark");
    const link = page.locator(".stats-pill a");
    await expect(link).toHaveAttribute("href", TRAFFIC_DASHBOARD);
    await expect(link).toHaveAttribute("target", "_blank");
    // Somebody else's origin. rel is what stops it reaching back through
    // window.opener.
    await expect(link).toHaveAttribute("rel", /noopener/);
    await expect(link).toHaveAttribute("rel", /noreferrer/);
  });

  test("stays readable in both themes", async ({ page }) => {
    for (const theme of ["light", "dark"] as const) {
      await gotoWithTheme(page, "/", theme);
      expect(await contrastOf(page.locator(".stats-pill")), `${theme} pill`).toBeGreaterThanOrEqual(4.5);
      expect(
        await contrastOf(page.locator(".stats-online")),
        `${theme} online count`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});

test.describe("the window switch", () => {
  test("is two real links, so it survives the back button", async ({ page }) => {
    await gotoWithTheme(page, "/", "dark");
    const seg = page.locator(".seg");
    await expect(seg.getByRole("link", { name: /All-time/ })).toHaveAttribute("href", "/");
    await expect(seg.getByRole("link", { name: /Today/ })).toHaveAttribute("href", "/today");
    await expect(seg.getByRole("link", { name: /All-time/ })).toHaveAttribute("aria-current", "page");
  });

  test("carries the category slug across the switch", async ({ page }) => {
    await gotoWithTheme(page, "/category/productivity", "dark");
    await expect(page.locator(".seg").getByRole("link", { name: /Today/ })).toHaveAttribute(
      "href",
      "/category/productivity/today",
    );
  });

  test("navigating between windows keeps the page working", async ({ page }) => {
    await gotoWithTheme(page, "/", "dark");
    await page.locator(".seg").getByRole("link", { name: /Today/ }).click();
    await page.waitForURL("**/today");
    await expect(page.getByRole("heading", { name: /Today's ranking/ })).toBeVisible();

    await page.goBack();
    await page.waitForURL((url) => url.pathname === "/");
    await expect(page.getByRole("heading", { name: /All-time leaderboard/ })).toBeVisible();
  });
});

test("the category rail lists every category and shows no scrollbar chrome", async ({ page }) => {
  await gotoWithTheme(page, "/", "dark");
  const rail = page.locator(".rail");
  await expect(rail).toBeVisible();

  const items = await rail.locator(".rail-item").count();
  // All 27 App Store categories plus "All". A rail that grows as categories get
  // bids would reflow the whole column.
  expect(items).toBe(28);

  const scroll = await rail.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { x: cs.overflowX, y: cs.overflowY, bar: cs.scrollbarWidth };
  });
  if (scroll.y === "auto" || scroll.y === "scroll") {
    expect(scroll.bar, "the rail is showing a vertical scrollbar").toBe("none");
    expect(scroll.x, "the rail can scroll sideways").toBe("hidden");
  }
});
