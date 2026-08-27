import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime", // convex-test needs the V8-like runtime
    server: { deps: { inline: ["convex-test"] } },
    include: ["convex/**/*.test.ts"],
    // The suite is empty until W1 lands convex/bids.test.ts. An empty run is a
    // zero result, not a failure, and vitest exits 1 for it by default.
    passWithNoTests: true,
  },
});
