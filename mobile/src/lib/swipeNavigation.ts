/**
 * Where a swipe lands, and how far the page follows the finger on the way.
 *
 * Pulled out of the gesture handler because these numbers are the whole
 * difference between a pager that feels native and one that feels broken, and
 * they are wrong in ways a screenshot never shows: a page that needs half the
 * screen of travel to commit feels stuck, and one that commits on a 20pt drift
 * turns every attempt to scroll sideways into a tab change. The gesture code
 * only has to say *where the finger is*; deciding what that means lives here,
 * where a test can assert it.
 *
 * Both functions carry a `"worklet"` directive. They are called from the UI
 * thread — the finger's travel has to become a page offset in the same frame it
 * happened, or the content visibly lags behind the thumb — and Reanimated only
 * moves a function off the JS thread when it is marked as one.
 */

/**
 * How fast a flick has to be to move a page on its own.
 *
 * A flick is the gesture people actually make: a short, quick push that covers
 * 30pt. Comfortably above the ~200 pt/s of a slow drag, and below the
 * 800–1500 pt/s of a deliberate one.
 */
export const SWIPE_VELOCITY = 520;

/**
 * How far the finger must travel before a drag is read as horizontal at all.
 *
 * Past the wobble of a tap and inside the shortest deliberate swipe. Below it a
 * slightly shaky vertical drag would steal the list's scroll, which is the one
 * thing this gesture must never do.
 */
export const SWIPE_ACTIVATION = 16;

/**
 * How much of an over-drag past either end the page shows.
 *
 * The strip cannot move past its last page, but a page that refuses to move at
 * all reads as frozen. A third of the finger's travel says "pushed, and this is
 * as far as it goes" without letting the content leave the screen.
 */
export const EDGE_RESISTANCE = 0.35;

export type DragInput = {
  /** Page position the gesture started from, in pages. */
  start: number;
  /** Finger travel since then, in points. Right is positive. */
  translationX: number;
  /** Width of one page, in points. */
  width: number;
  /** How many pages there are. */
  count: number;
};

/**
 * The page position a drag has reached, in pages.
 *
 * Fractional on purpose: `1.4` is "between the second and third page", which is
 * exactly what the strip has to be able to draw. Nothing is committed until the
 * finger lifts, so the position is the only state a drag produces.
 *
 * Dragging *left* reveals the page to the right, so the finger and the position
 * move in opposite directions — hence the minus.
 */
export function pageDragPosition({
  start,
  translationX,
  width,
  count,
}: DragInput): number {
  "worklet";
  if (width <= 0) {
    return start;
  }
  const last = Math.max(0, count - 1);
  const raw = start - translationX / width;
  if (raw < 0) {
    return raw * EDGE_RESISTANCE;
  }
  if (raw > last) {
    return last + (raw - last) * EDGE_RESISTANCE;
  }
  return raw;
}

export type ReleaseInput = {
  /** Continuous page position at release, in pages. */
  position: number;
  /** Horizontal speed at release, in points per second. Right is positive. */
  velocityX: number;
  /** How many pages there are. */
  count: number;
};

/**
 * The page the strip should settle on, as a whole index.
 *
 * Nearest page, unless the finger was still moving fast: on a real pager the
 * flick decides, so a quick push from 1.1 lands on 2 even though the rounding
 * alone would have gone back to 1. The reverse is true too — dragging most of
 * the way and then flicking back is a decision to stay, and honouring the drag
 * distance instead would undo the gesture the listener just made.
 *
 * The result is always a real page, so a drag past either end resolves to the
 * end and the spring becomes the bounce.
 */
export function pageTargetFor({
  position,
  velocityX,
  count,
}: ReleaseInput): number {
  "worklet";
  const last = Math.max(0, count - 1);
  const base = Math.min(Math.max(position, 0), last);
  const nearest = Math.round(base);

  if (Math.abs(velocityX) < SWIPE_VELOCITY) {
    return nearest;
  }
  if (velocityX < 0) {
    // A flick to the left asks for the next page even from a position the
    // rounding would have sent back.
    return Math.min(last, Math.max(nearest, Math.floor(base) + 1));
  }
  return Math.max(0, Math.min(nearest, Math.ceil(base) - 1));
}
