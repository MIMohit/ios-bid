/**
 * The one shared squircle clip path, rendered once in __root.tsx and referenced
 * by every app icon on the page. Apple's icon shape is a continuous corner
 * curve, not a rounded rectangle, so a border-radius is visibly wrong next to
 * real App Store artwork.
 *
 * Browsers that ship `corner-shape: squircle` get it natively from board.css and
 * ignore the clip-path; this def is the fallback everywhere else. One def for
 * fifty icons, so the cost is a single path.
 */
export const SQUIRCLE_CLIP_ID = "sq";

export function Squircle() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={SQUIRCLE_CLIP_ID} clipPathUnits="objectBoundingBox">
          <path d="M 0.64208 0 c 0.12528 0 0.18793 0 0.23578 0.02438 a 0.2237 0.2237 0 0 1 0.09776 0.09776 c 0.02438 0.04785 0.02438 0.11049 0.02438 0.23578 L 1 0.64208 c 0 0.12528 0 0.18793 -0.02438 0.23578 a 0.2237 0.2237 0 0 1 -0.09776 0.09776 c -0.04785 0.02438 -0.11049 0.02438 -0.23578 0.02438 L 0.35792 1 c -0.12528 0 -0.18793 0 -0.23578 -0.02438 a 0.2237 0.2237 0 0 1 -0.09776 -0.09776 c -0.02438 -0.04785 -0.02438 -0.11049 -0.02438 -0.23578 L 0 0.35792 c 0 -0.12528 0 -0.18793 0.02438 -0.23578 a 0.2237 0.2237 0 0 1 0.09776 -0.09776 c 0.04785 -0.02438 0.11049 -0.02438 0.23578 -0.02438 Z" />
        </clipPath>
      </defs>
    </svg>
  );
}
