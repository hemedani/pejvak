/**
 * How tall a bottom sheet is, and where its bottom edge sits.
 *
 * A sheet that sizes itself to its content is fine until a keyboard appears:
 * the window shrinks, the sheet's `maxHeight` shrinks with it, and the panel
 * collapses to a sliver while the search field sits under the keyboard. The
 * fix is to give the sheet a *height* rather than a ceiling — it keeps its
 * shape, the list inside it scrolls, and the whole panel is lifted clear of the
 * keyboard.
 *
 * Pure, and separate from the component, so the arithmetic can be checked
 * without rendering a modal.
 */

export type SheetMetrics = {
  windowHeight: number;
  keyboardHeight: number;
  /** Safe-area top, which the lifted sheet must not run under. */
  topInset: number;
  /** Share of the window the sheet would like. */
  ratio?: number;
  /** Breathing room between the sheet and whatever is above it. */
  gap?: number;
};

/**
 * The sheet's height: its preferred share of the window, capped by whatever the
 * keyboard and the status bar leave behind. Never negative — a keyboard taller
 * than the window is a degenerate case, not a reason to draw an inverted box.
 */
export function sheetHeightFor({
  windowHeight,
  keyboardHeight,
  topInset,
  ratio = 0.7,
  gap = 12,
}: SheetMetrics): number {
  const preferred = Math.round(windowHeight * ratio);
  const available = Math.max(
    0,
    Math.round(windowHeight - Math.max(0, keyboardHeight) - Math.max(0, topInset) - gap),
  );
  return Math.min(preferred, available);
}

/**
 * How far the sheet is lifted off the bottom of the window.
 *
 * With the keyboard down that is the safe-area inset; with it up the panel has
 * to clear the keyboard entirely, and the inset is already part of the
 * keyboard's height on Android's edge-to-edge window.
 */
export function sheetLiftFor({
  keyboardHeight,
  bottomInset,
  gap = 8,
}: {
  keyboardHeight: number;
  bottomInset: number;
  gap?: number;
}): number {
  return Math.max(0, keyboardHeight) > 0
    ? Math.max(0, keyboardHeight) + gap
    : Math.max(0, bottomInset);
}
