/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as appstore from "../appstore.js";
import type * as bids from "../bids.js";
import type * as board from "../board.js";
import type * as categories from "../categories.js";
import type * as clicks from "../clicks.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as lib_appstore from "../lib/appstore.js";
import type * as lib_categories from "../lib/categories.js";
import type * as maintenance from "../maintenance.js";
import type * as presence from "../presence.js";
import type * as receipt from "../receipt.js";
import type * as rules from "../rules.js";
import type * as seed from "../seed.js";
import type * as seo from "../seo.js";
import type * as stats from "../stats.js";
import type * as stripe from "../stripe.js";
import type * as today from "../today.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  appstore: typeof appstore;
  bids: typeof bids;
  board: typeof board;
  categories: typeof categories;
  clicks: typeof clicks;
  crons: typeof crons;
  http: typeof http;
  "lib/appstore": typeof lib_appstore;
  "lib/categories": typeof lib_categories;
  maintenance: typeof maintenance;
  presence: typeof presence;
  receipt: typeof receipt;
  rules: typeof rules;
  seed: typeof seed;
  seo: typeof seo;
  stats: typeof stats;
  stripe: typeof stripe;
  today: typeof today;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  shardedCounter: import("@convex-dev/sharded-counter/_generated/component.js").ComponentApi<"shardedCounter">;
};
