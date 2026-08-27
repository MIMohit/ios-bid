/// <reference types="vite/client" />
import { getCookie, setCookie } from "@tanstack/react-start/server";

/** Matches outbid.lol's `outbid-visitor-id` in role: one anonymous visitor. */
export const SID_COOKIE = "iosrank_sid";

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Read the visitor id without ever minting one. `/go/:slug` depends on this
 * distinction: a tap arriving with no cookie has, by definition, not come from
 * a page we rendered, and that single check filters almost every crawler for
 * the cost of one header read.
 */
export function readSid(): string | undefined {
  return getCookie(SID_COOKIE);
}

/**
 * Read the visitor id, minting one on first sight.
 *
 * httpOnly is the whole point: the sid is the unit of click dedupe, so a value
 * page JavaScript can read is a value a click farm can rotate. It carries no
 * PII, no IP and no fingerprint, which is what keeps /privacy short and true.
 *
 * Only callable where a response is still being assembled: an SSR loader or a
 * server function. A route handler that returns its own Response has no place
 * to put the Set-Cookie header.
 */
export function readOrIssueSid(): string {
  const existing = getCookie(SID_COOKIE);
  if (existing) return existing;

  const sid = crypto.randomUUID();
  setCookie(SID_COOKIE, sid, {
    httpOnly: true,
    // Not in dev: a Secure cookie over plain http is dropped by the browser,
    // which would silently stop every tap being counted locally.
    secure: import.meta.env.PROD,
    sameSite: "lax", // rides the top-level navigation that /go/:slug is
    path: "/",
    maxAge: ONE_YEAR,
  });
  return sid;
}
