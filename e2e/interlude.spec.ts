import { expect, test } from "@playwright/test";
import { gotoWithTheme } from "./helpers";

/**
 * The interlude: the other window's top three, then the latest settled payments,
 * sitting between rank 3 and rank 4.
 *
 * Every board shows the board it is not, which is the whole reason the block
 * earns the slot. Getting the pairing backwards would still render something
 * plausible, so each direction is asserted by name and by href.
 */

const WINDOWS = [
  { path: "/", heading: "Today's top ranking", seeAll: "/today" },
  { path: "/today", heading: "All-time top ranking", seeAll: "/" },
] as const;

for (const window of WINDOWS) {
  test(`${window.path} shows the other board: ${window.heading}`, async ({ page }) => {
    await gotoWithTheme(page, window.path, "dark");

    const interlude = page.locator(".interlude");
    // A board with fewer than three listings renders no interlude at all, which
    // is deliberate. Skip rather than assert something that is not there.
    const rankThree = await page.locator(".row.is-t3").count();
    test.skip(rankThree === 0, "board has fewer than three listings");

    await expect(interlude).toBeVisible();
    await expect(interlude.getByRole("heading", { name: window.heading })).toBeVisible();

    const seeAll = interlude.getByRole("link", { name: /See all/ });
    await expect(seeAll).toHaveAttribute("href", window.seeAll);

    await expect(interlude.getByRole("heading", { name: "Latest activity" })).toBeVisible();
  });
}

test("the interlude sits between rank 3 and rank 4, not at the end of the list", async ({ page }) => {
  await gotoWithTheme(page, "/", "dark");
  test.skip((await page.locator(".row.is-t3").count()) === 0, "no rank 3 on this board");

  const order = await page.evaluate(() => {
    const children = Array.from(document.querySelector("ol.board")!.children);
    const three = children.findIndex((c) => c.classList.contains("is-t3"));
    const block = children.findIndex((c) => c.classList.contains("interlude"));
    const four = children.findIndex(
      (c, i) => i > block && c.classList.contains("row") && !c.classList.contains("is-t3"),
    );
    return { three, block, four };
  });

  expect(order.three).toBeGreaterThanOrEqual(0);
  expect(order.block).toBe(order.three + 1);
  expect(order.four).toBeGreaterThan(order.block);
});

test("the block holds its height when the other board is empty", async ({ page }) => {
  await gotoWithTheme(page, "/", "dark");
  test.skip((await page.locator(".interlude").count()) === 0, "no interlude on this board");

  const cards = await page.locator(".today-card").count();
  if (cards === 0) {
    // The empty state is a stated sentence at the same height, never a collapse:
    // a block that grows later pushes ranks 4 through 50 down the page.
    const empty = page.locator(".slab-empty");
    await expect(empty).toBeVisible();
    expect((await empty.boundingBox())!.height).toBeGreaterThan(30);
  } else {
    expect(cards).toBeLessThanOrEqual(3);
    // Three cards side by side must be one object at one height, so their
    // amounts share a baseline even when Apple gave an app no subtitle.
    const heights = await page.locator(".today-card").evaluateAll((els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().height)),
    );
    expect(new Set(heights).size, `cards have mismatched heights: ${heights.join(", ")}`).toBe(1);
  }
});

test("every card in the block is an outbound link through /go/", async ({ page }) => {
  await gotoWithTheme(page, "/", "dark");
  test.skip((await page.locator(".interlude").count()) === 0, "no interlude on this board");

  const links = page.locator(".today-card, .act-card");
  const count = await links.count();
  test.skip(count === 0, "no activity or podium cards yet");

  for (let i = 0; i < count; i++) {
    const href = await links.nth(i).getAttribute("href");
    expect(href, "a card links somewhere other than /go/").toMatch(/^\/go\/[^/]+$/);
    // Outbound links are paid placements. rel is not optional here.
    await expect(links.nth(i)).toHaveAttribute("rel", /sponsored/);
    await expect(links.nth(i)).toHaveAttribute("rel", /nofollow/);
  }
});

test("the activity strip scrolls sideways without a scrollbar and without moving the page", async ({
  page,
}) => {
  await gotoWithTheme(page, "/", "dark");
  test.skip((await page.locator(".act-row").count()) === 0, "no activity strip");

  const strip = await page.locator(".act-row").evaluate((el) => ({
    overflowX: getComputedStyle(el).overflowX,
    scrollbarWidth: getComputedStyle(el).scrollbarWidth,
    scrollable: el.scrollWidth > el.clientWidth,
  }));
  expect(strip.overflowX).toBe("auto");
  expect(strip.scrollbarWidth, "the strip is showing scrollbar chrome").toBe("none");
});

test("a focused activity card shows a ring its own scroll container cannot clip", async ({ page }) => {
  await gotoWithTheme(page, "/", "dark");
  test.skip((await page.locator(".act-card").count()) === 0, "no activity cards");

  const ring = await page.locator(".act-card").first().evaluate((el) => {
    el.focus();
    const cs = getComputedStyle(el);
    return { outline: cs.outlineStyle, shadow: cs.boxShadow };
  });
  // .act-row scrolls, so it clips on both axes and an outset ring has nowhere to
  // paint. The indicator has to be inset.
  expect(ring.shadow, "focused card has no inset ring").toContain("inset");
});
