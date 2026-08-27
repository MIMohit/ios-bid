import { v } from "convex/values";
import { action } from "./_generated/server";
import { appMeta } from "./schema";
import { resolveInput } from "./lib/appstore";

/**
 * Apple's iTunes API is a plain HTTPS fetch, so this stays in the default V8
 * runtime: faster cold starts and no Node bundle on the path the bid form hits
 * on every keystroke after the debounce.
 *
 * A single hit is returned as `match` and auto-selected by the form; anything
 * ambiguous comes back as `suggestions` for the visitor to pick from. Bad input
 * throws an AppStoreError, which is a ConvexError, so the message survives
 * production error scrubbing and renders inline.
 */
export const lookup = action({
  args: { input: v.string() },
  returns: v.union(
    v.object({ match: appMeta }),
    v.object({ suggestions: v.array(appMeta) }),
  ),
  handler: async (_ctx, { input }) => resolveInput(input),
});
