import { expect, test } from "@playwright/test";
import { MIN_BID } from "@convex/rules";
import { gotoWithTheme } from "./helpers";

/**
 * The bid bar. This is the site's only interaction and the only path that takes
 * money, so it gets the most cases.
 *
 * NOTHING here submits a checkout. The submit handler calls
 * `api.stripe.createCheckout`, which creates a real session against whatever key
 * the deployment holds, and a test suite that mints Stripe sessions on every run
 * is leaving litter in someone's dashboard at best. Every assertion stops at the
 * button's enabled state, which is the last thing this side of the app owns: the
 * amount is repriced server side by `quoteInternal` before a session exists, so
 * what the form shows and what the card is charged already cannot disagree.
 */

/** Whole dollars only. This is the rule the whole product is built on. */
const NO_DECIMAL = /^\$\d{1,3}(,\d{3})*$/;

test.describe("the amount control", () => {
  test("shows the price to take #1 and never a decimal point", async ({ page }) => {
    await gotoWithTheme(page, "/", "dark");
    const amount = page.locator(".hero-amount");
    await expect(amount).toBeVisible();
    const value = await amount.inputValue();
    expect(value, `the amount is not whole dollars: ${value}`).toMatch(NO_DECIMAL);
  });

  test("the steppers step in dollars and stop on a rung, never cross one", async ({ page }) => {
    await gotoWithTheme(page, "/", "dark");
    const amount = page.locator(".hero-amount");
    const label = page.locator(".hero-label");
    const dollars = async () => Number((await amount.inputValue()).replace(/[^\d]/g, ""));

    // The bar opens on the rounded price of #1. Nothing outranks #1, so plus has
    // no rung to stop on and takes the whole step, which scales because +$1 on a
    // $17,000 bid is a control that does nothing.
    await expect(label).toContainText("#1");
    const before = await dollars();
    await page.locator(".step").nth(1).click();
    const step = (await dollars()) - before;
    if (before >= 10_000) expect(step).toBe(100);
    else if (before >= 1_000) expect(step).toBe(25);
    else if (before >= 100) expect(step).toBe(5);
    else expect(step).toBe(1);

    // And back down by the same step, because the opening price is never under
    // the rung beneath it.
    await page.locator(".step").nth(0).click();
    expect(await dollars()).toBe(before);

    // A rung cuts a step short and never lengthens one. Trimming $17,005 to the
    // $17,001 that still holds #1 is a rung stopping a $100 step. Dropping $5 to
    // $1 on an empty board would be a rung making a $1 step longer, which is the
    // regression this pins.
    await page.locator(".step").nth(0).click();
    const down = await dollars();
    expect(down, "minus moved further than one step").toBeGreaterThanOrEqual(
      Math.max(MIN_BID, before - step),
    );
    expect(down).toBeLessThan(before);
  });

  test("a decimal point cannot be entered at all", async ({ page }) => {
    await gotoWithTheme(page, "/", "dark");
    const amount = page.locator(".hero-amount");
    await amount.click();
    await amount.fill("");
    await amount.type("12.34");
    const value = await amount.inputValue();
    expect(value, `a decimal survived the keystroke filter: ${value}`).not.toContain(".");
  });

  test("emptying the field commits the floor rather than nothing", async ({ page }) => {
    // The figure on screen and the figure the form would charge must be the same
    // number at every moment, so every path commits.
    await gotoWithTheme(page, "/", "dark");
    const amount = page.locator(".hero-amount");
    await amount.click();
    await amount.fill("");
    await amount.blur();
    const value = await amount.inputValue();
    expect(value).toMatch(NO_DECIMAL);
    expect(Number(value.replace(/[^\d]/g, ""))).toBeGreaterThanOrEqual(MIN_BID);
  });

  test("the minus stepper stops at the floor instead of going negative", async ({ page }) => {
    await gotoWithTheme(page, "/today", "dark");
    const amount = page.locator(".hero-amount");
    test.skip((await amount.count()) === 0, "no bid bar on this route");

    const minus = page.locator(".step").nth(0);
    for (let i = 0; i < 12; i++) {
      if (await minus.isDisabled()) break;
      await minus.click();
    }
    const value = Number((await amount.inputValue()).replace(/[^\d]/g, ""));
    expect(value, "the amount went under the minimum bid").toBeGreaterThanOrEqual(MIN_BID);
  });
});

test.describe("claiming a rank from the board", () => {
  test("a row's claim button prefills the bar with that rank and that price", async ({ page }) => {
    await gotoWithTheme(page, "/", "dark");
    const row = page.locator(".row").nth(2);
    const claim = row.locator(".claim");
    test.skip((await claim.count()) === 0, "no claim control on this row");

    const label = await claim.getAttribute("aria-label");
    const wanted = label!.match(/rank (\d+) for \$([\d,]+)/);
    expect(wanted, `unreadable claim label: ${label}`).not.toBeNull();

    await claim.click();
    await expect(page.locator(".hero-label")).toContainText(`#${wanted![1]}`);
    expect(await page.locator(".hero-amount").inputValue()).toBe(`$${wanted![2]}`);
  });

  test("the claim control is on every row at every width, never hover-revealed", async ({ page }) => {
    await gotoWithTheme(page, "/", "dark");
    const rows = await page.locator(".row").count();
    const claims = await page.locator(".row .claim").count();
    expect(claims, "some rows have no claim control").toBe(rows);

    const hidden = await page.locator(".row .claim").evaluateAll((els) =>
      els.filter((el) => {
        const cs = getComputedStyle(el);
        return cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0;
      }).length,
    );
    expect(hidden, "a claim control is hidden until hover").toBe(0);
  });
});

test.describe("the lookup", () => {
  test("Outbid stays disabled until an app has actually resolved", async ({ page }) => {
    // The guard that stops a checkout being opened for nothing.
    await gotoWithTheme(page, "/", "dark");
    const submit = page.getByRole("button", { name: "Outbid" });
    await expect(submit).toBeDisabled();

    await page.locator(".field").first().fill("a");
    await page.waitForTimeout(600);
    await expect(submit, "Outbid enabled with no app resolved").toBeDisabled();
  });

  test("typing after a pick un-picks the app, so a stale id cannot be charged", async ({ page }) => {
    await gotoWithTheme(page, "/", "dark");
    const field = page.locator(".field").first();

    await field.fill("Duolingo");
    // The lookup is debounced and goes to Apple, so it may or may not resolve
    // here. Either way, editing must clear whatever it found.
    await page.waitForTimeout(2500);
    await field.fill("Duolingo x");
    await page.waitForTimeout(300);

    await expect(
      page.getByRole("button", { name: "Outbid" }),
      "the resolved app outlived the text it was resolved from",
    ).toBeDisabled();
  });

  test("the category cell states where the value comes from rather than offering a choice", async ({
    page,
  }) => {
    // Apple assigns the category. A disabled <select> would promise otherwise.
    await gotoWithTheme(page, "/", "dark");
    const cell = page.locator(".bid-cat");
    await expect(cell).toBeVisible();
    await expect(cell).toContainText("Category");
    expect(await page.locator("select").count(), "the bid form grew a select").toBe(0);
  });

  test("the note under the form reserves its height so the bar never grows on the first keystroke", async ({
    page,
  }) => {
    await gotoWithTheme(page, "/", "dark");
    const note = page.locator(".bid-note");
    await expect(note).toBeAttached();
    const height = (await note.boundingBox())?.height ?? 0;
    expect(height, "the note collapses when it has nothing to say").toBeGreaterThan(0);
  });

  test("the form never posts anywhere on submit", async ({ page }) => {
    // It is a JS handler over a <form>, so a native submit would navigate away
    // and lose the amount.
    await gotoWithTheme(page, "/", "dark");
    const action = await page.locator("form.bidbar").getAttribute("action");
    expect(action).toBeNull();
  });
});
