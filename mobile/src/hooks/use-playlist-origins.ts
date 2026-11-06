/**
 * The origin of each playlist, resolved from the tracks it holds.
 *
 * A playlist is a container the listener built, so it has no origin of its own:
 * "is this local or online?" is answered by its members, and a list that mixes
 * an imported lecture with a streamed episode is neither. The resolution needs
 * the tracks, which the playlist row does not carry (its `items` are ids), so it
 * is one batched read rather than a query per card.
 *
 * Results are keyed by the playlist's own id and the read is re-run when the
 * membership changes — a playlist that gains its first streamed track has to
 * change its badge, and the row's `updatedAt` is not something the list screen
 * watches.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import type { LocalPlaylist, TrackOrigin } from "@/lib/db/types";
import { playlistOrigin, type ItemOrigin } from "@/lib/origin";
import { LocalDBService } from "@/services/LocalDBService";

export function usePlaylistOrigins(
  playlists: readonly LocalPlaylist[],
): Record<string, ItemOrigin> {
  const [origins, setOrigins] = useState<Record<string, ItemOrigin>>({});
  const latest = useRef(playlists);

  /**
   * The membership as one string, so a refresh that returns the same playlists
   * does not re-read the tracks — and a reorder or an add does.
   */
  const signature = useMemo(
    () =>
      playlists
        .map((playlist) => `${playlist.id}:${playlist.items.map((item) => item.trackId).join(",")}`)
        .join("|"),
    [playlists],
  );

  // The list itself is read inside the effect below; only the signature decides
  // when to re-run it, so the rows are handed over separately from the trigger.
  useEffect(() => {
    latest.current = playlists;
  }, [playlists]);

  useEffect(() => {
    let cancelled = false;
    const rows = latest.current;
    const ids = [
      ...new Set(rows.flatMap((playlist) => playlist.items.map((item) => item.trackId))),
    ];
    if (ids.length === 0) {
      setOrigins({});
      return;
    }

    void LocalDBService.getTracksByIds(ids).then((tracks) => {
      if (cancelled) {
        return;
      }
      const originOf = new Map<string, TrackOrigin>(
        tracks.map((track) => [track.id, track.origin]),
      );
      const next: Record<string, ItemOrigin> = {};
      for (const playlist of rows) {
        next[playlist.id] = playlistOrigin(
          playlist,
          (trackId) => originOf.get(trackId) ?? null,
        );
      }
      setOrigins(next);
    });

    return () => {
      cancelled = true;
    };
  }, [signature]);

  return origins;
}
