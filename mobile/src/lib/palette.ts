/**
 * Per-track colour identity.
 *
 * The now-playing canvas should feel like it belongs to the track that is
 * playing. Real dominant-colour extraction needs the decoded bitmap, which we
 * cannot reach from `expo-image` without pulling in a native pixel reader — so
 * instead we derive a *stable* palette from the track's `contentHash` (falling
 * back to title, then id).
 *
 * That is a deliberate trade: the same track always paints the same gradient on
 * every device and every launch, offline, with zero dependencies — which is
 * exactly the property the cross-fade needs. Changing tracks produces a visibly
 * different canvas; the same track never flickers to a new colour mid-stream.
 */

import { aurora, type AuroraRamp } from "@/theme/tokens";

/** FNV-1a, 32-bit. Cheap, stable, well distributed for short strings. */
function hashString(value: string): number {
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

/** The gradient ramp for a track. Stable for a given seed, varied across tracks. */
export function paletteFor(seed: TrackSeed | string | null | undefined): AuroraRamp {
  const key =
    typeof seed === "string"
      ? seed
      : (seed?.contentHash ?? seed?.title ?? seed?.id ?? "") || "pejvak";
  const index = hashString(key) % aurora.length;
  return aurora[index] ?? aurora[0];
}

/** Primary accent of a track's ramp — used for the play button glow and markers. */
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
