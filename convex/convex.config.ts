import { defineApp } from "convex/server";
import shardedCounter from "@convex-dev/sharded-counter/convex.config";

/**
 * Components only. Every counter that would otherwise be a hot field on a
 * `listings` document lives in the sharded-counter component's own namespace
 * instead, so a tap can never invalidate an open board subscription.
 */
const app = defineApp();
app.use(shardedCounter);

export default app;
