"use client";

/**
 * Starting a playlist as one run.
 *
 * ## The queue is the playable entries, in playlist order
 *
 * `tracks` arrives already filtered and ordered by the server page, so this does
 * not decide what plays — it maps to queue entries and starts. A local-origin
 * track is a real playlist member that this browser cannot stream, and including
 * it would open a run that can never complete; the header says how many were
 * left out.
 *
 * ## Mapping happens here, not on the server
 *
 * `playerTrackFromTrack` applies `isLiveSource`, and the live registry is
 * populated in the browser by `OnlineStreamBridge`. A queue built on the server
 * would mark a live station as seekable and then fail to seek it.
 *
 * ## Same-browser resume comes from the open run
 *
 * If this browser left a run for this playlist unfinished, playback re-enters at
 * the track and second it stopped on. That is a local fact — the open run is in
 * `localStorage` — not a server feature: cross-device continue is the Discover
 * shelf, and History is the record of what was heard.
 */

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { Playlist } from "@/lib/domain/playlist";
import type { TrackSummary } from "@/lib/domain/track";
import { playQueueAt } from "@/lib/player/controller";
import { playerTrackFromTrack } from "@/lib/player/from-track";
import { sameContext } from "@/lib/player/playbackContext";
import { playerStorage } from "@/lib/player/storage";
import type { PlaybackContext } from "@/lib/player/types";

export function PlaylistPlayButton({
  playlist,
  tracks,
}: {
  playlist: Playlist;
  /** Playable entries only, in playlist order. */
  tracks: TrackSummary[];
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A ref, not `pending`: two clicks in one tick both read the state that has
  // not re-rendered yet.
  const busy = useRef(false);

  async function start() {
    if (busy.current || tracks.length === 0) {
      return;
    }

    busy.current = true;
    setPending(true);
    setError(null);

    try {
      const queue = tracks.map(playerTrackFromTrack);
      const context: PlaybackContext = {
        type: "playlist",
        key: playlist.id,
        title: playlist.title,
      };

      const open = playerStorage().getOpenRun();
      let index = 0;
      let startPositionSec = 0;

      if (
        open !== null &&
        open.endedAt === null &&
        sameContext({ type: open.contextType, key: open.contextKey }, context)
      ) {
        // `lastTrackId` is a content hash, not a server id: a queue entry is
        // keyed by hash, and the run is written before any server id exists.
        const found = queue.findIndex((track) => track.contentHash === open.lastTrackId);
        if (found >= 0) {
          index = found;
          startPositionSec = open.lastPositionSec;
        }
      }

      await playQueueAt(queue, index, { context, startPositionSec });
    } catch {
      setError("Playback did not start. Try again.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-[var(--space-xxs)]">
      <Button
        type="button"
        variant="primary"
        size="md"
        onClick={() => void start()}
        disabled={pending || tracks.length === 0}
        aria-busy={pending || undefined}
      >
        <Icon name="play" size="sm" />
        Play
      </Button>

      {error ? (
        <p role="alert" className="type-caption text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
