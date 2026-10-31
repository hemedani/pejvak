/**
 * Annotation colours and marker geometry. Ported from
 * `mobile/src/lib/annotations.ts`.
 *
 * Colours cycle deterministically so adjacent notes stay visually distinct on
 * the scrubber. The colour is never the only signal: the swatch picker also
 * draws a ring and a check.
 */

export const ANNOTATION_COLORS = [
  "#208AEF",
  "#E5484D",
  "#30A46C",
  "#F5A623",
  "#8E4EC6",
  "#12A594",
] as const;

/** Persian names for the swatches, in the same order. */
export const ANNOTATION_COLOR_NAMES: Record<string, string> = {
  "#208AEF": "آبی",
  "#E5484D": "قرمز",
  "#30A46C": "سبز",
  "#F5A623": "کهربایی",
  "#8E4EC6": "بنفش",
  "#12A594": "فیروزه‌ای",
};

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

/** A colour the palette knows, or the first one for a stored/unknown value. */
export function normalizeAnnotationColor(color: string | null | undefined, index = 0): string {
  if (color && (ANNOTATION_COLORS as readonly string[]).includes(color)) {
    return color;
  }
  return pickAnnotationColor(index);
}
