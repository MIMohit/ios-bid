import { expect, test } from "@playwright/test";
import { channelsOf, gotoWithTheme } from "./helpers";

/**
 * Routing and its edge cases. Every URL here is crawlable, so a wrong answer is
 * not just a bad page view, it is a page Google is asked to index.
 */

test.describe("pagination", () => {
  test("page 1 is the bare path and never redirects to itself", async ({ page }) => {
    // `?page=1` on the site's most important URL would be the canonical
    // redirecting away from itself.
    const response = await page.goto("/?page=1");
    expect(response?.status()).toBeLessThan(400);
    await page.waitForURL((url) => url.search === "" || !url.search.includes("page=1"));
    expect(new URL(page.url()).searchParams.get("page")).toBeNull();
  });

  test("an unparseable page lands on page 1 instead of the error boundary", async ({ page }) => {
    const response = await page.goto("/?page=banana");
    expect(response?.status(), "?page=banana should render a board").toBeLessThan(400);
    await expect(page.getByRole("heading", { name: /leaderboard/i })).toBeVisible();
  });

  test("a page past the end is a real 404, not an empty board", async ({ page }) => {
    // An unbounded ?page= space serving 200s is a crawl trap, and every one of
    // those URLs is a thin page.
    const response = await page.goto("/?page=9999");
    const notFound =
      response?.status() === 404 || (await page.getByText(/not found/i).count()) > 0;
    expect(notFound, "a page past the end served a 200 board").toBe(true);
  });

  test("prev is inert on page 1 and readable, not invisible", async ({ page }) => {
    await gotoWithTheme(page, "/", "light");
    const prev = page.locator(".pg[aria-disabled='true']").first();
    test.skip((await prev.count()) === 0, "single page board");

    const colour = await prev.evaluate((el) => getComputedStyle(el).color);
    // Disabled is carried by the cursor and the missing hover, not by dropping
    // the label below the info floor.
    expect(channelsOf(colour).sum, `disabled pager label is near invisible: ${colour}`).toBeLessThan(560);
  });

  test("page 2 renders the next slice and keeps the board shape", async ({ page }) => {
    await gotoWithTheme(page, "/", "dark");
    const next = page.getByRole("link", { name: "Next" });
    test.skip((await next.count()) === 0, "single page board");

    await next.click();
    await page.waitForURL(/page=2/);
    await expect(page.locator(".row").first()).toBeVisible();
    // Deeper pages carry no podium and no interlude: they start past rank 3.
    expect(await page.locator(".row.is-t1, .row.is-t2, .row.is-t3").count()).toBe(0);
    expect(await page.locator(".interlude").count()).toBe(0);
  });
});

test.describe("categories", () => {
  test("the rail navigates to a category board scoped to that category", async ({ page }) => {
    await gotoWithTheme(page, "/", "dark");
    const item = page.locator(".rail-item").nth(1);
    const href = await item.getAttribute("href");
    await item.click();
    await page.waitForURL(`**${href}`);
    await expect(page.locator(".rail-item.is-active")).toHaveAttribute("href", href!);
  });

  test("an unknown category is a 404, not an empty board", async ({ page }) => {
    // 27 real slugs and nothing else. Without this every misspelling is a live
    // URL and an unbounded thin-page generator.
    const response = await page.goto("/category/not-a-real-category");
    const notFound =
      response?.status() === 404 || (await page.getByText(/not found/i).count()) > 0;
    expect(notFound).toBe(true);
  });

  test("the categories index links to every board", async ({ page }) => {
    await gotoWithTheme(page, "/categories", "dark");
    const links = page.locator("main a[href^='/category/']");
    expect(await links.count()).toBeGreaterThanOrEqual(27);
  });
});

test.describe("outbound taps", () => {
  test("a row's name goes through /go/ and never straight to Apple", async ({ page }) => {
    await gotoWithTheme(page, "/", "dark");
    const names = page.locator(".row .name");
    const count = await names.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < Math.min(count, 10); i++) {
      await expect(names.nth(i)).toHaveAttribute("href", /^\/go\/[^/]+\?r=\d+$/);
    }
  });

  test("/go/:slug 302s to Apple with the source tag and refuses to be indexed", async ({ request, page }) => {
    await gotoWithTheme(page, "/", "dark");
    const href = await page.locator(".row .name").first().getAttribute("href");

    const response = await request.get(href!, { maxRedirects: 0 });
    expect(response.status(), "the outbound hop is not a 302").toBe(302);

    const location = response.headers()["location"];
    expect(location).toContain("apps.apple.com");
    expect(location).toContain("utm_source=iosrank");
    // A robots.txt Disallow stops crawling, not indexing of a URL found
    // elsewhere. The header is what keeps /go/ out of the index.
    expect(response.headers()["x-robots-tag"]).toContain("noindex");
    expect(response.headers()["cache-control"]).toContain("no-store");
  });

  test("an unknown slug is a stale share, so it goes home rather than erroring", async ({ request }) => {
    const response = await request.get("/go/this-app-does-not-exist", { maxRedirects: 0 });
    expect(response.status()).toBe(302);
    expect(response.headers()["location"]).toMatch(/iosrank\.lol\/?$/);
  });
});

test("the receipt page states the rank and offers the same price the board does", async ({ page }) => {
  await gotoWithTheme(page, "/", "dark");
  const href = await page.locator(".row .name").first().getAttribute("href");
  const slug = href!.replace("/go/", "").split("?")[0];

  await page.goto(`/r/${slug}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/on iosrank\.lol/);
  // The receipt is a receipt, not a second page about the app.
  await expect(page.locator("body")).not.toContainText("see details");
  await expect(page.locator(".bidwrap.is-flat")).toBeVisible();
});

test("an unknown route renders the not-found page rather than a blank screen", async ({ page }) => {
  const response = await page.goto("/definitely-not-a-route");
  expect(response?.status()).toBe(404);
  await expect(page.locator("body")).toContainText(/not found/i);
});
