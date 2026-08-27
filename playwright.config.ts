import { defineConfig, devices } from "@playwright/test";

/**
 * The per-PR gate. It drives the REAL app, so it needs a running stack and never
 * boots one itself beyond reusing what is already there.
 *
 *   pnpm build && pnpm start     # in one terminal, or let webServer do it
 *   pnpm test:e2e
 *
 * It targets the production build rather than `vite dev` on purpose: the dev
 * server compiles routes on demand and injects an HMR client, so neither its
 * timings nor its console output say anything about what ships.
 *
 * `retries` is not hiding flaky tests. Every board route server-renders five
 * Convex reads, and a cloud dev deployment on a home connection intermittently
 * stalls one for tens of seconds: the same stall reproduces with `curl` posting
 * straight to `/api/query`, with this app entirely out of the path. A retry is
 * the honest handling for an unreliable network between the runner and the
 * backend. Anything that fails twice is a real failure.
 */
const PORT = Number(process.env.PORT ?? 3000);
const BASE_URL = process.env.BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 2,
  // One worker. Every SSR request costs the dev deployment five reads, and
  // parallel workers turn an intermittent stall into a reliable one.
  workers: 1,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],

  timeout: 90_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: BASE_URL,
    navigationTimeout: 60_000,
    actionTimeout: 15_000,
    // The recording is the proof. Both are gitignored output.
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    // Chromium at a phone viewport, not WebKit. What is being tested here is the
    // responsive layout: the podium plates keep equal-and-opposite margins, the
    // interlude goes one-up, the rail becomes a strip, and nothing scrolls
    // sideways. None of that is engine specific, and pinning WebKit would make
    // the gate depend on a second browser download for no extra coverage.
    {
      name: "mobile",
      use: { ...devices["Desktop Chrome"], viewport: { width: 393, height: 852 }, isMobile: false, hasTouch: true },
    },
  ],

  webServer: {
    // Assumes `pnpm build` has run. Reuses an already-running stack, which is
    // the normal local case.
    command: "node .output/server/index.mjs",
    // /robots.txt, not /. The health probe has to answer whether the SERVER is
    // up, and every board route server-renders five Convex reads: probing one of
    // those makes a slow backend look like a missing server, and Playwright then
    // starts a second copy that dies on the taken port. robots.txt touches
    // nothing but the process.
    url: `${BASE_URL}/robots.txt`,
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
