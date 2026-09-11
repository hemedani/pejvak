/**
 * Colors cycled across annotation markers so adjacent notes stay visually
 * distinct on the progress bar. Kept small and deterministic (index-based) so
 * it stays a pure, testable helper.
 */
export const ANNOTATION_COLORS = [
  "#208AEF",
  "#E5484D",
  "#30A46C",
  "#F5A623",
  "#8E4EC6",
  "#12A594",
] as const;

/** Fraction (0–1) of the track at which an annotation marker sits. */
export function markerOffsetRatio(positionSec: number, durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return 0;
  }
  if (!Number.isFinite(positionSec)) {
    return 0;
  }
  return Math.min(1, Math.max(0, positionSec / durationSec));
}

/** Deterministic palette pick that wraps and tolerates negative indexes. */
export function pickAnnotationColor(index: number): string {
  const length = ANNOTATION_COLORS.length;
  if (!Number.isFinite(index)) {
    return ANNOTATION_COLORS[0];
  }
  const normalized = ((Math.trunc(index) % length) + length) % length;
  return ANNOTATION_COLORS[normalized];
}
