import { expect, test } from "@playwright/test";
import { contrastOf, gotoWithTheme, rightEdge } from "./helpers";

/**
 * The podium: ranks 1 to 3 carry a tinted plate whose fill and edge step down to
 * nothing by rank 4.
 *
 * On page 1 rank 1 is the spotlight band, so the list's own podium is ranks 2
 * and 3 and the ramp shifts up onto them. That shift is the thing most likely to
 * be lost in a refactor, because it lives in one selector, so it is asserted
 * directly rather than inferred from a screenshot.
 */

for (const theme of ["dark", "light"] as const) {
  test.describe(`podium, ${theme}`, () => {
    test.beforeEach(async ({ page }) => {
      await gotoWithTheme(page, "/", theme);
      await expect(page.locator(".row.is-t2")).toBeVisible();
    });

    test("the top two rows carry a plate and rank 4 does not", async ({ page }) => {
      const tinted = await page.evaluate(() => {
        const read = (selector: string) => {
          const el = document.querySelector(selector);
          if (!el) return null;
          const cs = getComputedStyle(el);
          const edge = getComputedStyle(el, "::after");
          return {
            radius: parseFloat(cs.borderTopLeftRadius),
            image: cs.backgroundImage,
            edgeColour: edge.borderTopColor,
            edgeWidth: parseFloat(edge.borderTopWidth) || 0,
          };
        };
        return {
          two: read(".row.is-t2"),
          three: read(".row.is-t3"),
          four: read(".row:not(.is-t1):not(.is-t2):not(.is-t3)"),
        };
      });

      expect(tinted.two, "no rank 2 row on the board").not.toBeNull();
      expect(tinted.three, "no rank 3 row on the board").not.toBeNull();
      expect(tinted.four, "no uniform row on the board").not.toBeNull();

      // A plate: rounded, tinted, edged.
      expect(tinted.two!.radius).toBeGreaterThan(8);
      expect(tinted.two!.image).toContain("gradient");
      expect(tinted.two!.edgeWidth).toBe(1);

      expect(tinted.three!.radius).toBeGreaterThan(8);
      expect(tinted.three!.image).toContain("gradient");

      // Rank 4 is a hairline row and nothing else.
      expect(tinted.four!.radius).toBe(0);
      expect(tinted.four!.image).toBe("none");
    });

    test("the ramp descends: rank 2's tint and edge are stronger than rank 3's", async ({ page }) => {
      const alpha = (value: string) => {
        const parts = value.match(/[\d.]+/g);
        return parts && parts.length === 4 ? Number(parts[3]) : 1;
      };

      const ramp = await page.evaluate(() => {
        const grab = (selector: string) => {
          const el = document.querySelector(selector)!;
          const stop = getComputedStyle(el).backgroundImage.match(/rgba?\([^)]+\)/);
          return {
            fill: stop ? stop[0] : "",
            edge: getComputedStyle(el, "::after").borderTopColor,
          };
        };
        return { two: grab(".row.is-t2"), three: grab(".row.is-t3") };
      });

      expect(alpha(ramp.two.fill), "rank 2 tint should be the strongest on the board").toBeGreaterThan(
        alpha(ramp.three.fill),
      );
      expect(alpha(ramp.two.edge)).toBeGreaterThan(alpha(ramp.three.edge));
    });

    test("the plate does not move the money column", async ({ page }) => {
      // The whole argument for equal-and-opposite margin and padding on a plate.
      // If this drifts, the dollar figures step sideways at rank 4 and the board
      // stops reading as one board.
      const plate = await rightEdge(page.locator(".row.is-t2 .money"));
      const row = await rightEdge(page.locator(".row:not(.is-t1):not(.is-t2):not(.is-t3) .money").first());
      expect(plate, "money column shifts between a plate and a uniform row").toBe(row);
    });

    test("money on a plate stays readable, hovered and not", async ({ page }) => {
      const money = page.locator(".row.is-t2 .bid");
      expect(await contrastOf(money)).toBeGreaterThanOrEqual(4.5);

      await page.locator(".row.is-t2").hover();
      await page.waitForTimeout(200);
      expect(await contrastOf(money), "money fails AA while its own row is hovered").toBeGreaterThanOrEqual(
        4.5,
      );
    });

    test("the row is still one outbound link, and the plate's edge does not eat the tap", async ({
      page,
    }) => {
      // The edge is a ::after covering the row at a higher paint order than the
      // click layer, so pointer-events: none on it is load bearing.
      const name = page.locator(".row.is-t2 .name");
      await expect(name).toHaveAttribute("href", /^\/go\//);
      await expect(name).toHaveAttribute("rel", /sponsored/);

      const hitsTheLink = await page.evaluate(() => {
        const row = document.querySelector(".row.is-t2")!;
        const box = row.getBoundingClientRect();
        // A point inside the plate but away from the money column and the icon.
        const el = document.elementFromPoint(box.left + box.width * 0.55, box.top + box.height - 6);
        return el?.closest("a.name") !== null || el?.classList.contains("name") === true;
      });
      expect(hitsTheLink, "the plate edge is swallowing clicks meant for the row").toBe(true);
    });
  });
}

test("a board with no listings says so instead of rendering an empty list", async ({ page }) => {
  await gotoWithTheme(page, "/today", "light");
  const board = page.locator("#board");
  await expect(board).toBeVisible();
  // /today is empty on a fresh deployment. Either it has rows or it states the
  // floor price; a silent empty <ol> is the failure this catches.
  const rows = await page.locator(".row").count();
  if (rows === 0) {
    await expect(page.locator(".empty")).toContainText(/takes #1/);
  }
});
