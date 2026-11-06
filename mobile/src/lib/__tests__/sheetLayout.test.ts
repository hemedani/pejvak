import { sheetHeightFor, sheetLiftFor } from "@/lib/sheetLayout";

/** A typical phone in portrait, with a status bar and no keyboard. */
const WINDOW = { windowHeight: 800, keyboardHeight: 0, topInset: 44 };

describe("sheetHeightFor", () => {
  it("takes its preferred share when nothing is in the way", () => {
    expect(sheetHeightFor({ ...WINDOW, ratio: 0.7 })).toBe(560);
  });

  it("shrinks to the room the keyboard leaves, not below it", () => {
    // 800 - 300 keyboard - 44 status bar - 12 gap = 444, under the 560 asked for.
    expect(sheetHeightFor({ ...WINDOW, keyboardHeight: 300, ratio: 0.7 })).toBe(444);
  });

  it("keeps its height while the keyboard is up if there is still room", () => {
    // A short keyboard on a tall window: the preferred height still fits.
    expect(
      sheetHeightFor({ windowHeight: 1200, keyboardHeight: 280, topInset: 44, ratio: 0.7 }),
    ).toBe(840);
  });

  it("never returns a negative height", () => {
    expect(sheetHeightFor({ windowHeight: 300, keyboardHeight: 900, topInset: 44 })).toBe(0);
  });

  it("ignores a negative keyboard height", () => {
    expect(sheetHeightFor({ ...WINDOW, keyboardHeight: -40, ratio: 0.5 })).toBe(400);
  });
});

describe("sheetLiftFor", () => {
  it("rests on the safe area when the keyboard is down", () => {
    expect(sheetLiftFor({ keyboardHeight: 0, bottomInset: 34 })).toBe(34);
  });

  it("clears the keyboard entirely when it is up", () => {
    // The inset is already inside the keyboard's height on Android, so adding
    // it again would leave a gap the height of a home indicator.
    expect(sheetLiftFor({ keyboardHeight: 320, bottomInset: 34 })).toBe(328);
  });

  it("adds the requested breathing room", () => {
    expect(sheetLiftFor({ keyboardHeight: 320, bottomInset: 0, gap: 16 })).toBe(336);
  });
});
