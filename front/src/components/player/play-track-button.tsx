"use client";

/**
 * The two deliberate entry points into a track from the library.
 *
 * Playing replaces the queue; adding appends. Both build the queue entry with
 * `playerTrackFromTrack`, so the library's `contentHash` is carried verbatim
 * and never re-hashed from a filename or a URL.
 *
 * A local track renders nothing: its audio is on the phone, and a disabled
 * button would imply a permission problem rather than a fact about where the
 * bytes are.
 */

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { TrackDetail } from "@/lib/domain/track";
import { enqueue, playQueueAt } from "@/lib/player/controller";
import { playerTrackFromTrack } from "@/lib/player/from-track";
import { isUnplayableHere } from "@/lib/player/queue";

export function PlayTrackButton({ track }: { track: TrackDetail }) {
  const [added, setAdded] = useState(false);

  if (isUnplayableHere(playerTrackFromTrack(track))) {
    return null;
  }

  const playerTrack = playerTrackFromTrack(track);

  return (
    <div className="mt-[var(--space-md)] flex flex-wrap items-center gap-[var(--space-sm)]">
      <Button variant="primary" onClick={() => void playQueueAt([playerTrack], 0)}>
        <Icon name="play" size="sm" />
        پخش
      </Button>
      <Button
        variant="secondary"
        onClick={() => {
          void enqueue([playerTrack]);
          setAdded(true);
        }}
      >
        <Icon name="queue" size="sm" />
        {added ? "به صف اضافه شد" : "افزودن به صف"}
      </Button>
    </div>
  );
}
