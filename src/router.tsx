import { createRouter } from "@tanstack/react-router";
import { QueryClient, notifyManager } from "@tanstack/react-query";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { ConvexQueryClient } from "@convex-dev/react-query";
import { ConvexProvider } from "convex/react";
import { routeTree } from "./routeTree.gen";
import { DefaultCatchBoundary } from "~/components/DefaultCatchBoundary";
import { NotFound } from "~/components/NotFound";

/**
 * Runs once per request on the server and once per tab in the browser. Each
 * server request gets a fresh QueryClient and a fresh ConvexHttpClient, which
 * matters: the http client pins a read timestamp and Convex backends only read
 * about 30 seconds into the past, so a hoisted instance eventually starts
 * failing.
 */
export function getRouter() {
  // Batch cache notifications onto animation frames in the browser. With fifty
  // rows resubscribing after a settled bid this is the difference between one
  // repaint and fifty. No-op on the server.
  if (typeof document !== "undefined") {
    notifyManager.setScheduler(window.requestAnimationFrame);
  }

  const CONVEX_URL = import.meta.env.VITE_CONVEX_URL;
  if (!CONVEX_URL) throw new Error("missing VITE_CONVEX_URL");

  const convexQueryClient = new ConvexQueryClient(CONVEX_URL);

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Both are required. hashFn teaches TanStack Query how to hash a query
        // key whose second element is a FunctionReference; queryFn routes
        // convexQuery keys to Convex and everything else to the fallback.
        queryKeyHashFn: convexQueryClient.hashFn(),
        queryFn: convexQueryClient.queryFn(),
      },
    },
  });

  // Wires QueryCache events to Convex subscriptions. Without this you get
  // one-shot fetches and no live updates.
  convexQueryClient.connect(queryClient);

  const router = createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: "intent",
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: () => <NotFound />,
    scrollRestoration: true,
    // ConvexProvider lives here, not in __root.tsx. Wrap sits outside the
    // router's own providers, so useConvex() works in loaders, error boundaries
    // and the shell.
    Wrap: ({ children }) => (
      <ConvexProvider client={convexQueryClient.convexClient}>{children}</ConvexProvider>
    ),
  });

  setupRouterSsrQueryIntegration({ router, queryClient });

  return router;
}
