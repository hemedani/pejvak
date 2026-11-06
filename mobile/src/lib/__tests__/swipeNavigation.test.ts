import {
  SWIPE_DISTANCE,
  SWIPE_VELOCITY,
  swipeCommit,
} from "@/lib/swipeNavigation";

const middle = { canPrev: true, canNext: true };

describe("swipeCommit", () => {
  it("does nothing for a tap", () => {
    expect(swipeCommit({ dx: 0, velocityX: 0, ...middle })).toBe(0);
    expect(swipeCommit({ dx: 4, velocityX: 40, ...middle })).toBe(0);
  });

  it("reads a long drag to the left as the next tab", () => {
    expect(swipeCommit({ dx: -SWIPE_DISTANCE, velocityX: 0, ...middle })).toBe(1);
  });

  it("reads a long drag to the right as the previous tab", () => {
    expect(swipeCommit({ dx: SWIPE_DISTANCE, velocityX: 0, ...middle })).toBe(-1);
  });

  it("reads a short fast flick as a page change", () => {
    // The gesture people actually make: a quick push that never travels the
    // distance. Without this rule it would feel unresponsive.
    expect(swipeCommit({ dx: -20, velocityX: -SWIPE_VELOCITY, ...middle })).toBe(1);
    expect(swipeCommit({ dx: 20, velocityX: SWIPE_VELOCITY, ...middle })).toBe(-1);
  });

  it("ignores a slow drag that never reaches the distance", () => {
    expect(swipeCommit({ dx: -30, velocityX: -300, ...middle })).toBe(0);
  });

  it("trusts the distance over a flick back", () => {
    // Dragged past the threshold and then flicked the other way on release:
    // the listener already showed where they wanted to go, and honouring the
    // flick would undo the gesture they just made.
    expect(swipeCommit({ dx: -SWIPE_DISTANCE - 10, velocityX: 900, ...middle })).toBe(
      1,
    );
  });

  it("bounces at the ends instead of doing nothing", () => {
    // `0` is the bounce: the pager springs back, so a page that cannot move
    // still acknowledges that it was pushed.
    expect(swipeCommit({ dx: -200, velocityX: -2000, canPrev: true, canNext: false })).toBe(
      0,
    );
    expect(swipeCommit({ dx: 200, velocityX: 2000, canPrev: false, canNext: true })).toBe(
      0,
    );
  });

  it("stays put when there is only one tab", () => {
    const single = { canPrev: false, canNext: false };
    expect(swipeCommit({ dx: -300, velocityX: -2000, ...single })).toBe(0);
    expect(swipeCommit({ dx: 300, velocityX: 2000, ...single })).toBe(0);
  });
});
