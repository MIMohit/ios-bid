/**
 * PostHog, loaded as the async snippet.
 *
 * The npm package would add 50KB or more to the entry chunk. This page's LCP is
 * hero text already competing with fifty Apple CDN images, so analytics loads
 * off PostHog's CDN after first paint and never blocks the board.
 *
 * Everything here is deliberately narrow. The numbers this site actually shows
 * (taps, bids, revenue, visitors, online) are first-party and live in Convex.
 * PostHog answers exactly one question those cannot: where the traffic came
 * from. It is not the source of truth for anything the board renders.
 */

const US_HOST = "https://us.i.posthog.com";

/**
 * The public traffic dashboard, PostHog's own hosted page.
 *
 * The token is a share token, not a secret: it grants read access to this one
 * dashboard and nothing else, which is the whole point of publishing it.
 * Revoking is a toggle in PostHog, not a redeploy here.
 *
 * It lives in this module rather than next to the one page that used to embed
 * it because the stats line in the header now links straight at it. Two
 * hardcoded copies of a token is one copy too many.
 */
const TRAFFIC_TOKEN = "ZtjOkb-GIbHUyxVr_U-5xz4D-HNzKw";
export const TRAFFIC_DASHBOARD = `https://us.posthog.com/shared/${TRAFFIC_TOKEN}`;
export const TRAFFIC_EMBED = `https://us.posthog.com/embedded/${TRAFFIC_TOKEN}`;

/**
 * Config, and the reasoning for each departure from PostHog's defaults.
 *
 * `persistence: "memory"` with `person_profiles: "identified_only"` is what
 * makes this cookieless. We have no accounts, so nothing is ever identified, so
 * no person profile is created and no cookie or localStorage entry is written.
 * That means no consent banner, which matters because this site sells to EU
 * developers. The cost is that PostHog's own unique-visitor count is inflated,
 * and we do not care: the visitor number on /stats comes from our own sharded
 * counter keyed on the iosrank_sid cookie.
 *
 * `autocapture: false` because autocapture records every click on the page. A
 * board is fifty rows of links; one viral day would spend the whole 1M event
 * allowance on clicks we already count server-side in /go/:slug, and count
 * better, because that path is bot-filtered and deduped per visitor per day.
 *
 * `capture_pageview: "history_change"` because TanStack Router navigates
 * through the history API. Left at the default, every route change after the
 * first would go unrecorded and /today, /categories and every category board
 * would look like they had no traffic at all.
 *
 * Session recording is off: it is the heaviest thing PostHog does, it is a
 * privacy surface we have no use for, and there is nothing to replay on a page
 * whose only interaction is a bid form.
 */
function config(): string {
  const host = import.meta.env.VITE_POSTHOG_HOST || US_HOST;
  return JSON.stringify({
    api_host: host,
    defaults: "2025-05-24",
    persistence: "memory",
    person_profiles: "identified_only",
    autocapture: false,
    capture_pageview: "history_change",
    capture_pageleave: true,
    disable_session_recording: true,
  });
}

/**
 * PostHog's official loader snippet. It stubs the API synchronously so calls
 * made before the CDN responds are queued rather than thrown away, then injects
 * the real script with `async`.
 */
export function posthogSnippet(): string {
  const key = import.meta.env.VITE_POSTHOG_KEY;
  if (!key) return "";
  return `!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug getPageViewId captureTraceFeedback captureTraceMetric".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);posthog.init(${JSON.stringify(key)},${config()});`;
}

/**
 * Record one product event. No-ops when PostHog is not configured, which is the
 * normal state in development and on every preview deploy.
 *
 * Keep the call sites countable on one hand. Everything the board displays is
 * already first-party; this is only for funnel steps that never reach our
 * server, and an abandoned checkout is the one that matters.
 */
export function track(event: string, properties?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const ph = (window as { posthog?: { capture: (e: string, p?: object) => void } }).posthog;
  ph?.capture(event, properties);
}
