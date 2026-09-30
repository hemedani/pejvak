/**
 * The dock's geometry, as an invariant rather than a picture.
 *
 * Two rules, and both exist because this dock broke them:
 *
 *   1. **A slot holds one thing.** The row was once sized for an icon block and
 *      a label together, which is how it ended up clipping the Discover button
 *      5pt off the top and 5pt off the bottom. Icon-only removes the sum
 *      entirely — so the assertion is about the tallest thing a slot contains,
 *      not about an icon plus something below it.
 *   2. **Every slot is hittable.** A dock is the app's primary navigation; a
 *      slot narrower or shorter than the platform minimum is a control that
 *      cannot reliably be pressed.
 */

import { dockInset, layout } from "@/theme/tokens";

const d = layout.dock;

describe("the dock's navigation row", () => {
  it("gives every slot a full tap target", () => {
    // A slot is the full column, so its height is the target's short edge.
    expect(d.navHeight).toBeGreaterThanOrEqual(d.touchTarget);
  });

  it("fits the active indicator inside its row", () => {
    // The clipping bug, restated for the layout that replaced it: with no label
    // in the slot, the indicator is the only thing that can overflow, and it is
    // the only thing there is to check.
    expect(d.indicator).toBeLessThanOrEqual(d.navHeight);
    expect(d.iconActive).toBeLessThanOrEqual(d.indicator);
    expect(d.icon).toBeLessThanOrEqual(d.indicator);
  });

  it("draws the indicator as a true circle, not a stadium", () => {
    // A rounded rectangle with a pill radius is a lozenge; it reads as a chip
    // rather than as the button the listener is on. An even diameter means the
    // corner radius is exactly half of it and lands on a whole pixel.
    expect(d.indicator % 2).toBe(0);
    expect(d.indicator).toBeLessThanOrEqual(48);
  });

  it("gives the selected glyph room inside the circle", () => {
    // The filled glyph sits on the accent circle, so it needs its own margin —
    // the resting glyph has the whole slot and this one does not.
    expect(d.indicator - d.iconActive).toBeGreaterThanOrEqual(16);
    expect(d.iconActive).toBeGreaterThan(d.icon - 4);
  });

  it("gives both halves the same height, so the seam divides the panel evenly", () => {
    expect(d.playerHeight).toBe(d.navHeight);
  });
});

describe("the dock as a whole", () => {
  it("reserves enough room for itself at its tallest", () => {
    const stack = d.margin + d.playerHeight + d.navHeight;
    expect(dockInset).toBeGreaterThanOrEqual(stack);
    expect(dockInset - stack).toBe(d.clearance);
  });

  it("floats on the bottom and the sides", () => {
    expect(d.margin).toBeGreaterThan(0);
    expect(d.inset).toBeGreaterThan(0);
  });

  it("costs less screen than the bar it replaced", () => {
    // The pre-dock bar was 62 tall with a 66pt now-player stacked above it —
    // 138 before the collision. A guard against the row creeping back up.
    expect(d.navHeight).toBeLessThanOrEqual(60);
  });
});
