/**
 * When a horizontal drag should change tab, and which way.
 *
 * Pulled out of the gesture handler because the rule is the part that can be
 * wrong in ways a screenshot never shows: a swipe that needs to travel half the
 * screen feels broken, and one that fires on a 3pt wobble turns every attempt
 * to scroll sideways into a tab change. The gesture code below it should only
 * have to say *where the finger is*; deciding what that means lives here, where
 * a test can assert it.
 */

/** How far the finger must travel before the drag means "next tab". */
export const SWIPE_DISTANCE = 56;

/**
 * How fast a flick must be to count without travelling the distance.
 *
 * A flick is the gesture people actually make on a phone — a short, quick push
 * that covers 30pt — so velocity has to be able to stand in for distance. The
 * number is comfortably above the ~200 pt/s of a slow drag, and below the
 * 800–1500 pt/s of a deliberate flick.
 */
export const SWIPE_VELOCITY = 520;

/**
 * How far the page follows the finger, in points.
 *
 * Deliberately short. This is a *hint* that a drag is being read as a page
 * change, not a full paging surface: the content underneath is a scrolling list,
 * and a page that travelled the full width would have to hide a second list
 * behind it to avoid showing the background. A nudge says the same thing.
 */
export const SWIPE_TRAVEL = 72;

/** The fraction of the finger's travel the page copies. */
export const SWIPE_RESISTANCE = 0.45;

export type SwipeInput = {
  /** Horizontal travel of the finger, in points. Right is positive. */
  dx: number;
  /** Horizontal speed at release, in points per second. Right is positive. */
  velocityX: number;
  /** Whether there is a tab to the left. */
  canPrev: boolean;
  /** Whether there is a tab to the right. */
  canNext: boolean;
};

/**
 * `-1` for the previous tab, `1` for the next, `0` for "stay where you are".
 *
 * Distance is checked before velocity on purpose: a listener who has dragged
 * past the threshold and then flicked back has still *shown* where they wanted
 * to go, and honouring the flick would undo the gesture they just made.
 *
 * At either end of the strip the answer is always `0`, so an over-drag bounces
 * back instead of doing nothing at all — a page that cannot move still has to
 * acknowledge that it was pushed.
 */
export function swipeCommit({ dx, velocityX, canPrev, canNext }: SwipeInput): -1 | 0 | 1 {
  const byDistance = Math.abs(dx) >= SWIPE_DISTANCE;
  const byVelocity = Math.abs(velocityX) >= SWIPE_VELOCITY;
  if (!byDistance && !byVelocity) {
    return 0;
  }

  const direction = (byDistance ? dx : velocityX) < 0 ? 1 : -1;
  if (direction === 1) {
    return canNext ? 1 : 0;
  }
  return canPrev ? -1 : 0;
}
