"use client";

/**
 * A track's cover, or a stand-in derived from its identity.
 *
 * The fallback is keyed by `contentHash` through `paletteFor`, so the same track
 * has the same cover on every visit and in the bar after a reload — a random
 * gradient per render would read as a different track each time.
 *
 * It deliberately shares the *one* palette table with the player's ambient wash.
 * Before this it computed its own hue from the hash, which meant a track's tile
 * and the light behind it could be two unrelated colours — the small kind of
 * disagreement that makes a screen feel assembled rather than designed.
 *
 * The tile is decoration: the title beside it carries the meaning, so it is
 * `aria-hidden`.
 */

import { cn } from "@/lib/cn";
import { paletteFor, rampGradient } from "@/lib/palette";
import type { PlayerTrack } from "@/lib/player/types";

import { Icon } from "@/components/ui/icon";

export function TrackArtwork({
  track,
  className,
}: {
  track: Pick<PlayerTrack, "contentHash" | "title" | "artworkUrl">;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "relative shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-surface-sunken",
        className,
      )}
      style={{ backgroundImage: rampGradient(paletteFor(track.contentHash), 135) }}
    >
      {track.artworkUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- a source's cover is an arbitrary remote URL and Next Image would need every source's host configured.
        <img
          src={track.artworkUrl}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <span className="absolute inset-0 grid place-items-center text-white/85">
          <Icon name="player" size="lg" />
        </span>
      )}
    </div>
  );
}
