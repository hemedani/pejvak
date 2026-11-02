/**
 * Per-track colour identity.
 *
 * Ported from `mobile/src/lib/palette.ts`. The phone derives a *stable* palette
 * from the track's `contentHash` (falling back to title, then id) instead of
 * extracting a dominant colour from the artwork, because real extraction needs
 * the decoded bitmap — and because a stable seed gives the property the design
 * actually depends on: the same track paints the same colour on every device and
 * every launch, offline, with no dependency. Changing tracks produces a visibly
 * different canvas; the same track never flickers to a new colour mid-stream.
 *
 * ## Why the web needs it at all
 *
 * Two surfaces now ask the same question — "what colour is this track?" — and
 * they must not answer it differently: the artwork tile (a fallback cover when a
 * source gave us none) and the ambient wash behind the player. One ramp table,
 * one hash, so a track's tile and its wash are visibly the same track.
 */

/**
 * The aurora ramp table, verbatim from `mobile/src/theme/tokens.ts`.
 *
 * Each entry is `[deep, bright, shadow]`: the gradient runs deep → bright, and
 * `shadow` is the darkened end used for text-bearing surfaces. Kept as data
 * rather than CSS custom properties because the *choice* is per track and made
 * in JavaScript; the tokens file holds the palette, this holds the ramps.
 */
export const AURORA = [
  ["#0A635C", "#1FB6A6", "#0B4F52"],
  ["#3B6FF5", "#6AA8FF", "#182B6B"],
  ["#8A4DFF", "#C48CFF", "#2C1656"],
  ["#F0625C", "#FF9E7A", "#5A1D24"],
  ["#F2A93B", "#FFD27A", "#5A3A10"],
  ["#12A594", "#4FD1C5", "#0B4A44"],
  ["#E24E9B", "#FF8FC4", "#5A1440"],
  ["#2E9BE0", "#69D2F0", "#0C3550"],
] as const;

export type AuroraRamp = (typeof AURORA)[number];

/**
 * FNV-1a, 32-bit. Cheap, stable, well distributed for short strings.
 *
 * Exported because colour is not the only thing that wants a stable hash of a
 * string: anything that must pick the same one of N options twice for the same
 * input uses this rather than `Math.random()`.
 */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export type TrackSeed = {
  contentHash?: string | null;
  title?: string | null;
  id?: string | null;
};

/**
 * The gradient ramp for a track. Stable for a given seed, varied across tracks.
 *
 * `"pejvak"` is the fallback seed, not a random one: a track with no identity at
 * all should still paint the brand's own colour rather than whatever the empty
 * string happens to hash to.
 */
export function paletteFor(seed: TrackSeed | string | null | undefined): AuroraRamp {
  const key =
    typeof seed === "string"
      ? seed
      : (seed?.contentHash ?? seed?.title ?? seed?.id ?? "") || "pejvak";
  const index = hashString(key) % AURORA.length;
  return AURORA[index] ?? AURORA[0];
}

/** Primary accent of a track's ramp — the thumb, the marker, the live figure. */
export function accentFor(seed: TrackSeed | string | null | undefined): string {
  return paletteFor(seed)[1];
}

/** `#rrggbb` → `rgba(r, g, b, alpha)`. Returns the input if it is not a hex triplet. */
export function withAlpha(hex: string, alpha: number): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!match) {
    return hex;
  }
  const value = Number.parseInt(match[1], 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Perceived luminance, 0–1. Used to pick readable text over a track colour. */
export function luminance(hex: string): number {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!match) {
    return 0;
  }
  const value = Number.parseInt(match[1], 16);
  const channel = (raw: number) => {
    const c = raw / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel((value >> 16) & 0xff) +
    0.7152 * channel((value >> 8) & 0xff) +
    0.0722 * channel(value & 0xff)
  );
}

/** Black or white, whichever is legible on the given background. */
export function readableOn(hex: string): "#FFFFFF" | "#08131A" {
  return luminance(hex) > 0.55 ? "#08131A" : "#FFFFFF";
}

/**
 * A ramp as a CSS gradient.
 *
 * `angle` is in degrees and is passed by the caller because the same ramp is
 * used on a square tile (135°) and on a wide wash (160°); baking one angle in
 * would make the wash read as a stretched tile.
 */
export function rampGradient(ramp: AuroraRamp, angle = 135): string {
  return `linear-gradient(${angle}deg, ${ramp[0]}, ${ramp[1]} 55%, ${ramp[2]})`;
}
