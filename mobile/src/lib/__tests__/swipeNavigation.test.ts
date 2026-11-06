import {
  EDGE_RESISTANCE,
  SWIPE_VELOCITY,
  pageDragPosition,
  pageTargetFor,
} from "@/lib/swipeNavigation";

/** A phone-sized page, so `translationX / width` reads as a fraction. */
const WIDTH = 400;
const drag = (translationX: number, start = 1, count = 4) =>
  pageDragPosition({ start, translationX, width: WIDTH, count });

describe("pageDragPosition", () => {
  it("does not move until the finger does", () => {
    expect(drag(0)).toBe(1);
  });

  it("follows the finger one for one, in pages", () => {
    // Half a page of travel is half a page of movement — the content is not
    // damped, delayed or capped, which is the whole difference between a drag
    // and a hint that a drag was noticed.
    expect(drag(-WIDTH / 2)).toBeCloseTo(1.5);
    expect(drag(-WIDTH)).toBeCloseTo(2);
    expect(drag(WIDTH / 2)).toBeCloseTo(0.5);
  });

  it("resists past the first page instead of stopping dead", () => {
    const pushed = drag(WIDTH, 0);
    expect(pushed).toBeCloseTo(-EDGE_RESISTANCE);
    // Still moves, but far less than the finger: a strip that refuses to move
    // at all reads as frozen rather than as an edge.
    expect(Math.abs(pushed)).toBeLessThan(1);
  });

  it("resists past the last page", () => {
    const pushed = drag(-WIDTH, 3, 4);
    expect(pushed).toBeCloseTo(3 + EDGE_RESISTANCE);
  });

  it("bounces rather than paging when there is nothing to page to", () => {
    expect(pageDragPosition({ start: 0, translationX: -WIDTH, width: WIDTH, count: 1 })).toBeCloseTo(
      EDGE_RESISTANCE,
    );
  });

  it("stays put before it has been measured", () => {
    // A width of zero would divide the finger's travel into infinity and put
    // every page off screen.
    expect(
      pageDragPosition({ start: 2, translationX: -120, width: 0, count: 4 }),
    ).toBe(2);
  });
});

describe("pageTargetFor", () => {
  it("snaps to the nearest page on a slow release", () => {
    expect(pageTargetFor({ position: 1.2, velocityX: 0, count: 4 })).toBe(1);
    expect(pageTargetFor({ position: 1.6, velocityX: 0, count: 4 })).toBe(2);
  });

  it("treats a half-page drag as a decision", () => {
    // Exactly half is the point where the listener has moved the page further
    // than they have left it, so it counts as a change.
    expect(pageTargetFor({ position: 1.5, velocityX: 0, count: 4 })).toBe(2);
  });

  it("lets a flick decide before the page has travelled", () => {
    // The gesture people actually make: a quick 40pt push that never reaches
    // half a page. Rounding alone would put it back, and that feels broken.
    expect(pageTargetFor({ position: 1.1, velocityX: -SWIPE_VELOCITY, count: 4 })).toBe(2);
    expect(pageTargetFor({ position: 1.9, velocityX: SWIPE_VELOCITY, count: 4 })).toBe(1);
  });

  it("flicks a whole page from rest", () => {
    expect(pageTargetFor({ position: 1, velocityX: -SWIPE_VELOCITY, count: 4 })).toBe(2);
    expect(pageTargetFor({ position: 1, velocityX: SWIPE_VELOCITY, count: 4 })).toBe(0);
  });

  it("honours a flick back over a long drag", () => {
    // Dragged 70% of the way and then flicked the other way on release: on a
    // real pager the flick wins, and the page goes back where it came from.
    expect(pageTargetFor({ position: 1.7, velocityX: SWIPE_VELOCITY, count: 4 })).toBe(1);
  });

  it("never flicks past the ends", () => {
    expect(pageTargetFor({ position: 0, velocityX: SWIPE_VELOCITY, count: 4 })).toBe(0);
    expect(pageTargetFor({ position: 3, velocityX: -SWIPE_VELOCITY, count: 4 })).toBe(3);
    expect(pageTargetFor({ position: 0.2, velocityX: -2000, count: 1 })).toBe(0);
  });

  it("resolves an over-drag to the page it belongs to", () => {
    // The rubber band leaves the position slightly outside the strip; the
    // spring then has to land on a real page, which is what makes the edge a
    // bounce rather than a dead stop.
    expect(pageTargetFor({ position: -EDGE_RESISTANCE, velocityX: 0, count: 4 })).toBe(0);
    expect(pageTargetFor({ position: 3.35, velocityX: 0, count: 4 })).toBe(3);
  });
});
