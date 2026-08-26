import { icon, iconSrcSet } from "~/lib/icon";

/**
 * One App Store icon, at an exact pixel size.
 *
 * `px` is the rendered CSS size for this tier, and the CDN is asked for that
 * size rather than one bitmap being scaled: the 72px spotlight icon and the 44px
 * row icon are different files, so neither renders soft.
 *
 * `alt=""` on purpose. The app name is the link text immediately beside every
 * icon, so alt text here would make a screen reader announce each app twice.
 */
export function AppIcon({
  url,
  px,
  eager = false,
}: {
  url: string;
  px: number;
  /** Ranks above the fold. Below rank 10 the icon is lazy. */
  eager?: boolean;
}) {
  return (
    <span className="icon">
      <img
        src={icon(url, px)}
        srcSet={iconSrcSet(url, px)}
        width={px}
        height={px}
        alt=""
        decoding="async"
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : "auto"}
      />
    </span>
  );
}
