import {
  keyboardOverlapFor,
  revealTargetY,
} from "@/components/ui/keyboard-scroll-view";

describe("keyboardOverlapFor", () => {
  it("uses the viewport's own loss when the window resized", () => {
    // Android with `adjustResize`: the scroll view is already 300 shorter, so
    // adding the keyboard height again would open a 300pt gap under the form.
    expect(
      keyboardOverlapFor({
        restingHeight: 800,
        viewportHeight: 500,
        keyboardHeight: 300,
      }),
    ).toBe(300);
  });

  it("uses the keyboard's own height when nothing resized", () => {
    // iOS: the viewport is untouched, so the space has to be supplied by us.
    expect(
      keyboardOverlapFor({
        restingHeight: 800,
        viewportHeight: 800,
        keyboardHeight: 300,
      }),
    ).toBe(300);
  });

  it("never claims more than the keyboard is actually taking", () => {
    // A rotation or a font-scale change between the two measurements would
    // otherwise read as an enormous keyboard and leave a hole in the page.
    expect(
      keyboardOverlapFor({
        restingHeight: 900,
        viewportHeight: 200,
        keyboardHeight: 300,
      }),
    ).toBe(300);
  });

  it("falls back to the keyboard height before anything has been measured", () => {
    expect(
      keyboardOverlapFor({
        restingHeight: 0,
        viewportHeight: 0,
        keyboardHeight: 280,
      }),
    ).toBe(280);
  });

  it("is zero when no keyboard is up", () => {
    expect(
      keyboardOverlapFor({
        restingHeight: 800,
        viewportHeight: 800,
        keyboardHeight: 0,
      }),
    ).toBe(0);
  });

  it("clamps nonsense input to zero rather than a negative overlap", () => {
    expect(
      keyboardOverlapFor({
        restingHeight: 0,
        viewportHeight: 500,
        keyboardHeight: 0,
      }),
    ).toBe(0);
  });
});

describe("revealTargetY", () => {
  const KEYBOARD_GAP = 24;

  it("leaves a field that is already visible exactly where it is", () => {
    // Scrolling a visible form out from under a thumb that is still on it is its
    // own bug, so the target must clamp to zero rather than chase the field.
    expect(
      revealTargetY({
        fieldY: 100,
        fieldHeight: 54,
        viewportHeight: 800,
        overlap: 0,
      }),
    ).toBe(0);
  });

  it("brings a field below the fold up to the top of the visible band", () => {
    const target = revealTargetY({
      fieldY: 900,
      fieldHeight: 54,
      viewportHeight: 800,
      overlap: 0,
    });
    // After scrolling, the field's top sits one gap below the band's top edge.
    expect(900 - target).toBe(800 - 54 - KEYBOARD_GAP);
  });

  it("uses the band the keyboard left, not the whole viewport", () => {
    // A 400pt viewport with 300pt of it covered leaves 100pt usable, so a 54pt
    // field is pinned to the top of that band rather than of the viewport.
    const target = revealTargetY({
      fieldY: 500,
      fieldHeight: 54,
      viewportHeight: 400,
      overlap: 300,
    });
    expect(500 - target).toBe(100 - 54 - KEYBOARD_GAP);
  });

  it("scrolls to a field's top when it cannot fit above the keyboard at all", () => {
    // The band is 50pt and the field is 200pt: no scroll reveals all of it, so
    // the best available answer is to put the field's top where it can be read —
    // the label and the first line. Scrolling less would leave it unseen.
    const target = revealTargetY({
      fieldY: 300,
      fieldHeight: 200,
      viewportHeight: 200,
      overlap: 150,
    });
    expect(target).toBe(300);
  });

  it("honours a caller-supplied gap", () => {
    const target = revealTargetY({
      fieldY: 500,
      fieldHeight: 50,
      viewportHeight: 400,
      overlap: 0,
      gap: 0,
    });
    expect(500 - target).toBe(400 - 50);
  });
});
