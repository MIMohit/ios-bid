/**
 * Apple artwork URLs, resized at the CDN.
 *
 * `is1-ssl.mzstatic.com` accepts an arbitrary size segment in place of the one
 * Apple returns, and it honours `webp`. Measured: a 120x120 webp icon is 5.2 KB
 * against 22.8 KB for the 128px png Apple hands out, so every icon on the board
 * goes through here and none of them ships png.
 *
 * The host is pinned to `is1` (Apple round-robins is1..is5) so fifty icons cost
 * one preconnect and one TLS handshake.
 */

const HOST = /^https:\/\/is\d-ssl\.mzstatic\.com/;

function pin(url: string): string {
  return url.replace(HOST, "https://is1-ssl.mzstatic.com");
}

/** Square app icon at an exact CSS pixel size. `px` is the device pixel count. */
export function icon(url: string, px: number): string {
  return pin(url).replace(/\/\d+x\d+bb\.(?:jpg|png|webp)$/, `/${px}x${px}bb.webp`);
}

/**
 * `srcSet` for an icon rendered at `px` CSS pixels. 2x and 3x only: 1x is the
 * `src`, and a 1.5x candidate buys nothing on the two DPRs Apple ships.
 */
export function iconSrcSet(url: string, px: number): string {
  return `${icon(url, px * 2)} 2x, ${icon(url, px * 3)} 3x`;
}

/**
 * App Store screenshot at an exact width, height left to the source aspect
 * ratio (`0w` is Apple's "scale to this width"). The spotlight band crops with
 * object-fit, so a landscape iPad shot arriving here cannot change the layout.
 */
export function shot(url: string, width: number): string {
  return pin(url).replace(/\/\d+x\d+(?:bb|w)\.(?:jpg|png|webp)$/, `/${width}x0w.webp`);
}

/** `srcSet` for a screenshot rendered at `width` CSS pixels. */
export function shotSrcSet(url: string, width: number): string {
  return `${shot(url, width)} 1x, ${shot(url, width * 2)} 2x`;
}
