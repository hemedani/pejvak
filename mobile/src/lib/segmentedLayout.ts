/**
 * The segmented control's thumb geometry.
 *
 * Pure, and deliberately not in the component: `segmented-control.tsx` imports
 * Reanimated, whose native module will not load under Jest, so a test that
 * reached for this through the component could not run at all. The same reason
 * `planRowLayout` lives in `cardLayout.ts`.
 */

/**
 * The thumb's `translateX`, as a percentage of the thumb's own width.
 *
 * `transform: translateX` on an absolutely-positioned view resolves its
 * percentage against **that view's width**, and the thumb is one segment wide
 * rather than the whole track. So the unit it wants is "segments moved", and a
 * normalised 0–1 progress is not that: applying one directly moved the thumb
 * `1 / (count - 1)` of the distance it should, so on the five-option playback
 * speed it came to rest inside the *first* segment while the second was selected.
 *
 * Segment `index` is therefore `index * 100` — one thumb-width per segment.
 *
 * ## Why this runs on the JS thread
 *
 * This function is called from the component body, never from inside
 * `useAnimatedStyle`. A worklet body runs on the UI thread, where a plain
 * function from another module is a *Remote Function* and calling it throws
 * synchronously. Keeping the conversion here leaves the worklet doing nothing but
 * read one shared value and interpolate it into a string.
 */
export function thumbTargetPercent(index: number, count: number): number {
  if (count <= 1) {
    return 0;
  }
  const clamped = Math.max(0, Math.min(count - 1, index));
  return clamped * 100;
}

/**
 * Where the thumb's left edge should sit, as a fraction of the track's width.
 *
 * Segment `index` owns the slice from `index / count` to `(index + 1) / count`, so
 * a thumb resting on segment 0 starts at exactly 0 and one resting on the last
 * segment stops a thumb-width short of the trailing edge. This is the contract
 * `thumbTargetPercent` exists to satisfy, stated as the property a listener
 * actually sees rather than as an implementation detail.
 */
export function thumbOffsetRatio(index: number, count: number): number {
  if (count <= 1) {
    return 0;
  }
  const clamped = Math.max(0, Math.min(count - 1, index));
  return clamped / count;
}
