import { useState } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@convex/_generated/api";
import { MAX_BID, MIN_BID } from "@convex/rules";
import { money } from "~/lib/format";

/**
 * The step grows with the amount, because +$1 on a $17,000 bid is a control
 * that does nothing. It is the fallback: wherever the board offers a rung, the
 * stepper lands on that instead.
 */
function stepFor(amount: number): number {
  if (amount >= 10_000) return 100;
  if (amount >= 1_000) return 25;
  if (amount >= 100) return 5;
  return 1;
}

/** The three amounts around the current place, from `api.board.place`. */
type Ladder = Pick<
  FunctionReturnType<typeof api.board.place>,
  "floor" | "cheaper" | "dearer"
>;

type Props = {
  value: number;
  /** Undefined until the board answers, and null-filled where there is no rung. */
  ladder: Ladder | undefined;
  /** Always a whole dollar figure inside the rules' bounds. */
  onChange: (next: number) => void;
};

/**
 * The amount control: minus, the figure, plus.
 *
 * The figure is an input, not a label. The rules say the bidder names any whole
 * dollar amount and that amount alone decides the rank, so stepping from $1 to
 * $17,005 has to be typeable; the steppers are for nudging past the row you are
 * aiming at.
 *
 * Whole dollars are enforced at the keystroke: every non-digit is dropped
 * before the value is read, so a decimal point can never be entered and the
 * server's integer check is a second line of defence rather than the first.
 * `draft` holds the raw digits only while the field has focus, so the formatted
 * figure is what is on screen the rest of the time and the two can never drift.
 *
 * The one invariant that matters here is that the figure on screen and the
 * figure the form will charge are the same number. Every path that can alter
 * either one therefore commits: the keystroke that empties the field commits
 * the floor rather than nothing, and focusing pins whatever is currently shown
 * so a live price change cannot move the amount under a field the bidder is
 * already looking at. Below the floor the store clamps to MIN_BID, which is
 * stated under the field and restated in the quote line, and blur reformats the
 * draft away so the field never sits on a figure that is not the charge.
 */
export function AmountStepper({ value, ladder, onChange }: Props) {
  const [draft, setDraft] = useState<string | null>(null);

  /**
   * The steppers walk the board's own ladder, because that is the only place a
   * dollar changes anything: minus trims a #1 price of $17,005 to the $17,001
   * that still holds #1, then drops to the cheapest amount that holds #2. Where
   * the board has no rung to offer, above #1 or past the depth it will name, it
   * falls back to a plain dollar step.
   */
  const rung = (direction: -1 | 1) => {
    if (direction === 1) return ladder?.dearer;
    if (ladder?.floor != null && value > ladder.floor) return ladder.floor;
    return ladder?.cheaper;
  };

  const step = (direction: -1 | 1) =>
    onChange(
      Math.min(
        MAX_BID,
        Math.max(MIN_BID, rung(direction) ?? value + direction * stepFor(value)),
      ),
    );

  return (
    <div className="stepper">
      <button
        type="button"
        className="step"
        aria-label="Lower the amount"
        disabled={value <= MIN_BID}
        onClick={() => step(-1)}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M3 7h8" />
        </svg>
      </button>

      <input
        className="hero-amount money-t"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-label="Bid amount in whole US dollars"
        value={draft ?? money(value)}
        onFocus={(event) => {
          // Pin the shown figure. `value` falls back to the live "claim #1"
          // price, which another bidder can move while this field has focus.
          onChange(value);
          setDraft(String(value));
          event.currentTarget.select();
        }}
        onBlur={() => setDraft(null)}
        onChange={(event) => {
          // Six digits is MAX_BID. The cap is here as well as in the store so a
          // paste cannot briefly render a seven digit number.
          const digits = event.currentTarget.value.replace(/\D/g, "").slice(0, 6);
          setDraft(digits);
          // Emptying the field is a keystroke like any other. Committing
          // nothing here left the field blank while the form still held the
          // previous amount, and submitting then charged a figure that was not
          // on screen.
          onChange(digits === "" ? MIN_BID : Number(digits));
        }}
      />

      <button
        type="button"
        className="step"
        aria-label="Raise the amount"
        disabled={value >= MAX_BID}
        onClick={() => step(1)}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M7 3v8M3 7h8" />
        </svg>
      </button>
    </div>
  );
}
