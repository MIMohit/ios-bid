import { createServerFn } from "@tanstack/react-start";
import { trackEdge, utcDay } from "~/lib/convex-server";
import { readOrIssueSid } from "./sid";

/**
 * Marks this visitor present, and mints `iosrank_sid` on first sight.
 *
 * The hop through Vercel exists because the cookie is httpOnly: the browser
 * cannot call Convex with a value it is not allowed to read, and that is
 * exactly what stops a page script minting visitor ids. Convex throttles the
 * write to once per 30s per sid, so calling this more often is free.
 */
export const heartbeat = createServerFn({ method: "POST" }).handler(async () => {
  await trackEdge("/track/beat", { sid: readOrIssueSid(), day: utcDay() });
  return null;
});
