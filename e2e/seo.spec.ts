import { expect, test } from "@playwright/test";

/**
 * The head, and the crawlable surface around it.
 *
 * These matter more here than on most sites: the product is a leaderboard whose
 * whole value is being found, and `head()` in every route is guarded so that a
 * pending loader falls through to the root rather than shipping a blank <head>.
 * A blank head is silent, which is exactly why it is worth a test.
 */

const BOARDS = ["/", "/today", "/category/productivity", "/category/productivity/today"] as const;

for (const path of BOARDS) {
  test(`${path} ships a complete head`, async ({ page }) => {
    await page.goto(path, { waitUntil: "domcontentloaded" });

    const title = await page.title();
    expect(title.length, `${path} has no title`).toBeGreaterThan(10);
    expect(title).toContain("iosrank.lol");

    const description = await page.locator('meta[name="description"]').getAttribute("content");
    expect(description?.length ?? 0, `${path} has no description`).toBeGreaterThan(40);

    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    expect(canonical, `${path} has no canonical`).toBeTruthy();
    expect(canonical).toMatch(/^https:\/\/iosrank\.lol/);
    // The canonical must never point at a URL that redirects, which on this site
    // means it must never carry ?page=1.
    expect(canonical).not.toContain("page=1");
  });
}

test("the board renders its rows into the HTML, not just into the client", async ({ request }) => {
  // useSuspenseQuery, never useQuery: useQuery does not suspend, so on the
  // server it renders its loading branch and the board never reaches a crawler.
  const response = await request.get("/");
  const html = await response.text();
  expect(response.status()).toBe(200);
  const rows = html.match(/class="row/g)?.length ?? 0;
  expect(rows, "the board did not server-render any rows").toBeGreaterThan(0);
});

test("the homepage carries exactly three JSON-LD blocks", async ({ page }) => {
  // The root emits Organization and WebSite; the board adds exactly one
  // ItemList. A fourth means something is emitting twice.
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const blocks = await page.locator('script[type="application/ld+json"]').count();
  expect(blocks).toBe(3);

  const parsed = await page
    .locator('script[type="application/ld+json"]')
    .evaluateAll((els) => els.map((el) => JSON.parse(el.textContent ?? "null")));
  for (const node of parsed) {
    expect(node, "a JSON-LD block did not parse").not.toBeNull();
    expect(node["@context"]).toContain("schema.org");
  }
  expect(parsed.some((n) => n["@type"] === "ItemList"), "no ItemList on the board").toBe(true);
});

test("robots.txt allows the board and points at the sitemap", async ({ request }) => {
  const response = await request.get("/robots.txt");
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toMatch(/sitemap:/i);
  // /go/ is a redirect hop, never a destination.
  expect(body).toMatch(/disallow:\s*\/go\//i);
});

test("the sitemap is valid XML and lists the boards", async ({ request }) => {
  const response = await request.get("/sitemap.xml");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("xml");

  const body = await response.text();
  expect(body).toContain("<urlset");
  expect(body).toContain("https://iosrank.lol/");
  expect(body).toContain("https://iosrank.lol/today");
  const urls = body.match(/<loc>/g)?.length ?? 0;
  expect(urls).toBeGreaterThan(28);
});

test("the social preview image renders", async ({ request }) => {
  const response = await request.get("/opengraph-image");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(/image\/(png|jpeg)/);
  const body = await response.body();
  expect(body.byteLength, "the og image is suspiciously small").toBeGreaterThan(2000);
});

test("every board row is marked as the paid placement it is", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const links = page.locator(".row .name");
  const count = await links.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < Math.min(count, 10); i++) {
    const rel = await links.nth(i).getAttribute("rel");
    expect(rel, "a paid outbound link is missing rel=sponsored").toContain("sponsored");
    expect(rel).toContain("nofollow");
    expect(rel).toContain("noopener");
  }
});

test('the string "see details" appears nowhere on a board', async ({ page }) => {
  // There is no per-listing detail page and never will be. This is the tripwire.
  for (const path of ["/", "/today"] as const) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).not.toContainText("see details");
  }
});
