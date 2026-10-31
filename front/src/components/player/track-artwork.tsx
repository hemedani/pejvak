"use client";

/**
 * A track's cover, or a stand-in derived from its identity.
 *
 * The fallback is keyed by `contentHash`, so the same track has the same
 * cover on every visit and in the bar after a reload — a random gradient per
 * render would read as a different track each time. It is decoration: the title
 * beside it carries the meaning, so the tile is `aria-hidden`.
 */

import { cn } from "@/lib/cn";
import type { PlayerTrack } from "@/lib/player/types";

import { Icon } from "@/components/ui/icon";

function hueFor(contentHash: string): number {
  let sum = 0;
  for (let index = 0; index < contentHash.length; index += 1) {
    sum = (sum * 31 + contentHash.charCodeAt(index)) % 360;
  }
  return sum;
}

export function TrackArtwork({
  track,
  className,
}: {
  track: Pick<PlayerTrack, "contentHash" | "title" | "artworkUrl">;
  className?: string;
}) {
  const hue = hueFor(track.contentHash);

  return (
    <div
      aria-hidden
      className={cn(
        "relative shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-surface-sunken",
        className,
      )}
      style={{
        backgroundImage: `linear-gradient(135deg, hsl(${hue} 38% 34%), hsl(${(hue + 48) % 360} 32% 20%))`,
      }}
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
